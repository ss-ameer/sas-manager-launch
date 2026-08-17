import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Helper to lazily get or initialize GoogleGenAI client with custom user key or process.env.GEMINI_API_KEY
  const getGeminiClient = (customKey?: string) => {
    const rawKey = (customKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "");
    if (!rawKey || rawKey === "MY_GEMINI_API_KEY" || rawKey === "YOUR_GEMINI_API_KEY" || rawKey === "placeholder") {
      return null;
    }
    return new GoogleGenAI({
      apiKey: rawKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Helper for exponential backoff retries on transient errors with model rotation pool support
  async function retryWithBackoffAndFallback<T>(
    fn: (modelName: string) => Promise<T>,
    modelsPool = ["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-flash-latest"],
    retries = 2,
    delayMs = 400
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      const currentModel = modelsPool[attempt % modelsPool.length];
      try {
        return await fn(currentModel);
      } catch (error: any) {
        attempt++;
        const errMsg = String(error?.message || "");
        const errStatus = error?.status || error?.code;
        const isAuthError =
          errStatus === 401 ||
          errStatus === 403 ||
          errMsg.includes("401") ||
          errMsg.includes("UNAUTHENTICATED") ||
          errMsg.includes("invalid authentication credentials") ||
          errMsg.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED");

        const isQuotaExhausted =
          errMsg.includes("prepayment credits") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("billing") ||
          errMsg.includes("depleted") ||
          errMsg.includes("Quota");

        // Immediately abort retry on authentication or quota/credit depletion
        if (isAuthError || isQuotaExhausted) {
          throw error;
        }

        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("429") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errStatus === 503 ||
          errStatus === 429;

        if (attempt >= retries || !isTransient) {
          throw error;
        }

        const nextModel = modelsPool[attempt % modelsPool.length];
        console.warn(`[retryWithBackoff] Transient error on "${currentModel}" (attempt ${attempt}/${retries}). Switching to fallback model "${nextModel}" and retrying in ${delayMs}ms... Error: ${errMsg}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential scaling
      }
    }
  }

  // API Routes
  app.post("/api/gemini/extract-enquiry", async (req, res) => {
    const requestStartTime = Date.now();
    let filePrepareTime = 0;
    let geminiApiTime = 0;
    let resultParseTime = 0;

    try {
      // Simulation fault injection headers check
      const simGeminiError = req.headers["x-simulate-gemini-error"] === "true";
      const simLatencyMs = parseInt((req.headers["x-simulate-latency"] as string) || "0", 10);

      if (simLatencyMs > 0) {
        console.log(`[SIMULATION] Injecting ${simLatencyMs}ms artificial latency...`);
        await new Promise((r) => setTimeout(r, simLatencyMs));
      }

      if (simGeminiError) {
        console.warn(`[SIMULATION] Gemini API Quota Exceeded error intercepted.`);
        return res.status(429).json({
          error: "429 Quota Exceeded: Gemini API is out of tokens or rate limited. Please check your AI quota or try again later.",
          __performance: {
            filePrepareTimeMs: 0,
            geminiApiTimeMs: 0,
            totalServerTimeMs: Date.now() - requestStartTime,
            error: true
          }
        });
      }

      const customUserKey = req.headers["x-user-gemini-api-key"] as string | undefined;
      const ai = getGeminiClient(customUserKey);
      if (!ai) {
        console.warn(`[server.ts] Gemini API key is missing or set to placeholder value.`);
        return res.status(401).json({
          error: "No active Gemini API Key found. Please enter your personal API key in Settings or AI Studio.",
          isApiKeyMissing: true,
          __performance: {
            filePrepareTimeMs: 0,
            geminiApiTimeMs: 0,
            totalServerTimeMs: Date.now() - requestStartTime,
            error: true
          }
        });
      }

      console.log(`\n=== [AI EXTRACTION DIAGNOSTIC START] ===`);
      console.log(`[1/5] Incoming payload received. Timestamp: ${new Date().toISOString()}`);
      
      const { fileName, mimeType, content, isBase64, salespersons } = req.body;

      if (!content) {
        console.error(`[ERROR] Missing file content to analyze.`);
        return res.status(400).json({ error: "Missing file content to analyze" });
      }

      const contentSizeKb = (content.length / 1024).toFixed(2);
      console.log(`[2/5] File metadata: Name="${fileName}", MimeType="${mimeType}", Size=${contentSizeKb} KB, isBase64=${isBase64}`);

      const prepareStart = Date.now();
      let filePart;
      if (isBase64) {
        filePart = {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: content,
          },
        };
      } else {
        filePart = {
          text: `Document Name: ${fileName}\n\nDocument Plain Text:\n${content}`,
        };
      }
      filePrepareTime = Date.now() - prepareStart;
      console.log(`[3/5] File payload prepared in ${filePrepareTime}ms.`);

      let salespersonExclusionPrompt = "";
      if (Array.isArray(salespersons) && salespersons.length > 0) {
        const salesInfoList = salespersons
          .map((sp: any) => `- Name: "${sp.full_name}" (Initials: "${sp.initials || 'N/A'}")${sp.email ? `, Email: "${sp.email}"` : ''}${sp.phone ? `, Phone: "${sp.phone}"` : ''}`)
          .join("\n");
        salespersonExclusionPrompt = `\n\nINTERNAL SALES REPRESENTATIVES (DO NOT EXTRACT AS CLIENT CONTACTS):\nThe following persons are internal sales team representatives:\n${salesInfoList}\n\nCRITICAL RULE FOR INTERNAL SALES DETAILS:\n- DO NOT extract any of the above internal salesperson emails or phone numbers as the client's contact_email or contact_phone!\n- If an email or phone in the document matches one of these internal sales reps, set the 'salesperson' field to that rep's initials or full name, and leave the client's contact_email/contact_phone clean.`;
      }

      const systemInstruction = `You are a professional sales engineer and RFQ data extraction assistant for an Enquiry Management System.
Your job is to analyze the uploaded document or copy-pasted raw text (which may be a Request for Quotation (RFQ), specification sheet, purchase order, enquiry details, email message, PDF file, or a raw multi-column row copy-pasted directly from Microsoft Excel or Google Sheets) and extract structured enquiry details with extreme precision.

HIGH-PRECISION EXTRACTION RULES FOR ENTITIES & CONTACTS:
1. COMPANY NAME:
   - Search headers, "To:", "Client:", "Customer:", "Messrs:", letterheads, signature blocks, and tabular text.
   - Look for corporate names like "AquaEnviro Solutions", "Al Reef Projects LLC", "Aventura", "Gulf Engineering Services".
   - Extract the legal entity name as company_name and clean suffix (LLC, FZE, FZC, Co. LLC, Ltd, W.L.L., Est., etc.) into legal_suffix.

2. CONTACT PERSON, EMAIL & PHONE NUMBER:
   - contact_name: Search "Attn:", "Attention:", "Kind Attn:", "Contact Person:", "Name:", "Mr.", "Ms.", "Eng.".
   - contact_email: Extract valid email addresses (e.g. mukesh.katara@aquaenvirosolutions.com, purchase@arpco.ae). DO NOT leave empty if an email appears anywhere in the text or signature.
   - contact_phone: Extract mobile or landline numbers (e.g. "+971 55 267 0574", "+971 2 5591110", "050-1234567"). DO NOT leave empty if a phone/mobile string is present.

3. CUSTOM ATTRIBUTE KEY-VALUE PAIRS FOR LINE ITEMS:
   - For every line item, extract ALL technical specifications, model specs, materials, and parameters into the 'attributes' array as explicit key-value objects: [{ "key": "Model", "value": "63\" x 67\"" }, { "key": "Make", "value": "Aventura" }, { "key": "Design Pressure", "value": "10.5 Bar" }, { "key": "MOC", "value": "FRP" }].
   - Common Attribute Keys to extract when found: "Model", "Make / Brand", "Design Pressure", "Dimensions", "MOC / Material", "Operation", "Flow Rate", "Application", "Standard", "Lead Time / Delivery".
   - BOTH 'key' and 'value' strings MUST be non-empty strings for each attribute object.

4. RAW EXCEL TAB-DELIMITED ROWS & COPY-PASTED TEXT RULES:
   - When data is tab-delimited or pipe-delimited Excel rows:
     * Field 1 (S/N #): sn (e.g. 2792).
     * Field 2 (Quote Ref No): quote_ref_no ALWAYS! (e.g. "2751-300626AA").
     * Field 3 (Listed): Month e.g. "Jul-2026".
     * Field 4 (Received Date): Convert to YYYY-MM-DD (e.g. "29/06/2026" -> "2026-06-29").
     * Field 5 (Sales Person): salesperson (e.g. "PV").
     * Field 6 (Customer Name): company_name (e.g. "AquaEnviro Solutions").
     * Field 7 (Contact Person): contact_name (e.g. "Mukesh Katara").
     * Field 8 (Email): contact_email (e.g. "mukesh.katara@aquaenvirosolutions.com").
     * Field 9 (Landline): Landline e.g. "+971 2 5591110".
     * Field 10 (Mobile): contact_phone (e.g. "+971 55 267 0574").
     * Field 11 (Country): country e.g. "UAE".
     * Field 12 (City / Area): project_location e.g. "Dubai".
     * Field 13 (Customer Ref): enquiry_source e.g. "EMAIL".
     * Field 14 (Product Type): Category name.
     * Field 15 (Product Detail): Detailed spec text & line items.
     * Field 16 (Value): package_value (e.g. 195500.00).

5. CLASSIFICATION OF LINE ITEMS (PRODUCT VS. CHARGE / SERVICE / DISCOUNT):
   - Every line item MUST be classified by 'item_type': 'product' | 'charge' | 'discount'.
   - Assign 'item_type': 'product' for physical components, equipment, or materials (e.g. Membranes, FRP Vessels, Pumps, Valves, Filters, Chemicals, Sand Media). Set 'product_type' to the specific product category name.
   - Assign 'item_type': 'charge' for non-product fees such as transportation, freight, delivery, installation, testing, commissioning, customs clearance, or mobilization. Set 'charge_type' (e.g. "Transportation", "Installation", "Customs", "Other Charge") and set 'product_type' to "Service / Charge".
   - Assign 'item_type': 'discount' for price deductions or commercial discounts. Set 'charge_type' to "Discount".

6. FEW-SHOT TRAINING EXAMPLES FOR ACCURATE EXTRACTION:
   Example Input:
   "2792\t2751-300626AA\tJul-2026\t29/06/2026\tPV\tAquaEnviro Solutions\tMukesh Katara\tmukesh.katara@aquaenvirosolutions.com\t\t+971 55 267 0574\tUAE\tDubai\tEMAIL\tFRP Filter Vessels...\t\"PRICE & COMMERCIAL TERMS\n1 FRP Filter Vessel 63”x67” 05 Nos. 12,500.00 62,500.00\n2 Transportation 01 LS 100.00 100.00\"\t195,500.00"
   Output Mapping:
   - quote_ref_no: "2751-300626AA"
   - company_name: "AquaEnviro Solutions"
   - contact_name: "Mukesh Katara"
   - contact_email: "mukesh.katara@aquaenvirosolutions.com"
   - contact_phone: "+971 55 267 0574"
   - country: "UAE"
   - project_location: "Dubai"
   - package_value: 195500.00
   - line_items: [
       { item_type: "product", product_type: "FRP Filter Vessels", description: "FRP Filter Vessel 63”x67” Design Pressure 10.5 Bar", quantity: 5, unit: "Nos", unit_price_aed: 12500, attributes: [{ key: "Model", value: "63\" x 67\"" }] },
       { item_type: "charge", charge_type: "Transportation", product_type: "Service / Charge", description: "Transportation - Up to Muscat Transporter warehouse in Muscat", quantity: 1, unit: "LS", unit_price_aed: 100, attributes: [] }
     ]

Extract the details accurately into the requested JSON format.${salespersonExclusionPrompt}`;

      console.log(`[4/5] Initiating request to Gemini Flash API...`);
      const apiCallStart = Date.now();
      
      const response = await retryWithBackoffAndFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: [
            filePart,
            { text: "Analyze the attached document or raw Excel copy-pasted text and extract the enquiry details into the requested JSON format." },
          ],
          config: {
            systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              required: [
                "company_name",
                "legal_suffix",
                "contact_name",
                "contact_email",
                "project_location",
                "remarks",
                "line_items",
                "confidence_scores",
              ],
              properties: {
                sn: { type: Type.NUMBER, description: "Serial number or legacy ID if present (e.g. 2792)." },
                quote_ref_no: { type: Type.STRING, description: "Quote reference number if present." },
                received_date: { type: Type.STRING, description: "Date in YYYY-MM-DD format." },
                proposal_option: { type: Type.STRING, description: "Proposal designation / option e.g. 'PV'." },
                company_name: { type: Type.STRING },
                legal_suffix: {
                  type: Type.STRING,
                  description: "Must be: 'LLC' | 'FZE' | 'FZC' | 'Co. LLC' | 'Ltd' | 'W.L.L.' | 'Est.' | 'None / Other'",
                },
                contact_name: { type: Type.STRING },
                contact_email: { type: Type.STRING },
                contact_phone: { type: Type.STRING, description: "Phone number of contact person." },
                country: { type: Type.STRING, description: "Company address country e.g. 'UAE'." },
                project_location: { type: Type.STRING, description: "Company address city or area e.g. 'Dubai' or 'Abu Dhabi'." },
                enquiry_source: { type: Type.STRING, description: "Source e.g. 'EMAIL'." },
                salesperson: { type: Type.STRING, description: "Salesperson name." },
                subject: { type: Type.STRING, description: "Short subject line or project summary of the enquiry." },
                customer_reference_code: { type: Type.STRING, description: "Customer's internal PO or RFQ reference code if present." },
                package_value: { type: Type.NUMBER, description: "Total lump sum or package value in AED if present." },
                remarks: { type: Type.STRING },
                line_items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["product_type", "description", "quantity", "unit", "attributes"],
                    properties: {
                      item_type: { type: Type.STRING, description: "Classification: 'product' for physical components, 'charge' for non-product fees (transportation, freight, installation, customs), or 'discount'." },
                      charge_type: { type: Type.STRING, description: "If item_type is 'charge' or 'discount', specify charge category e.g. 'Transportation', 'Installation', 'Customs', 'Discount', 'Other Charge'." },
                      product_type: { type: Type.STRING },
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      unit_price_aed: { type: Type.NUMBER },
                      attributes: {
                        type: Type.ARRAY,
                        description: "List of specification attributes extracted for this item as key-value pairs.",
                        items: {
                          type: Type.OBJECT,
                          required: ["key", "value"],
                          properties: {
                            key: { type: Type.STRING },
                            value: { type: Type.STRING }
                          }
                        }
                      },
                    },
                  },
                },
                confidence_scores: {
                  type: Type.OBJECT,
                  required: ["company_name", "contact_name", "project_location", "line_items"],
                  properties: {
                    company_name: { type: Type.STRING, enum: ["high", "medium", "low"], description: "Confidence level: 'high' | 'medium' | 'low'" },
                    contact_name: { type: Type.STRING, enum: ["high", "medium", "low"], description: "Confidence level: 'high' | 'medium' | 'low'" },
                    project_location: { type: Type.STRING, enum: ["high", "medium", "low"], description: "Confidence level: 'high' | 'medium' | 'low'" },
                    line_items: { type: Type.STRING, enum: ["high", "medium", "low"], description: "Confidence level: 'high' | 'medium' | 'low'" },
                  },
                },
              },
            },
          },
        })
      );

      geminiApiTime = Date.now() - apiCallStart;
      console.log(`[5/5] Gemini API call completed successfully in ${geminiApiTime}ms.`);

      const parseStart = Date.now();
      const resultText = response.text;
      const parsedData = JSON.parse(resultText || "{}");
      resultParseTime = Date.now() - parseStart;

      const totalElapsedTime = Date.now() - requestStartTime;
      
      console.log(`\n=== EXTRACTION PERFORMANCE BREAKDOWN ===`);
      console.log(`- Request Overhead / File Preparation: ${filePrepareTime}ms (${((filePrepareTime / totalElapsedTime) * 100).toFixed(1)}%)`);
      console.log(`- Gemini API Endpoint Round-trip: ${geminiApiTime}ms (${((geminiApiTime / totalElapsedTime) * 100).toFixed(1)}%)`);
      console.log(`- Local JSON Parsing & Validation: ${resultParseTime}ms (${((resultParseTime / totalElapsedTime) * 100).toFixed(1)}%)`);
      console.log(`- Total Server Elapsed Duration: ${totalElapsedTime}ms`);
      console.log(`=========================================\n`);

      // Inject server-side performance diagnostics for frontend visibility
      res.json({
        ...parsedData,
        __performance: {
          filePrepareTimeMs: filePrepareTime,
          geminiApiTimeMs: geminiApiTime,
          resultParseTimeMs: resultParseTime,
          totalServerTimeMs: totalElapsedTime,
        }
      });
    } catch (error: any) {
      const totalElapsedTime = Date.now() - requestStartTime;
      const errMsg = String(error?.message || "");
      const errStatus = error?.status || error?.code;
      const isAuthError =
        errStatus === 401 ||
        errStatus === 403 ||
        errMsg.includes("401") ||
        errMsg.includes("UNAUTHENTICATED") ||
        errMsg.includes("invalid authentication credentials") ||
        errMsg.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED");

      const isQuotaError =
        errStatus === 429 ||
        errMsg.includes("429") ||
        errMsg.includes("Quota") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("prepayment credits") ||
        errMsg.includes("billing") ||
        errMsg.includes("depleted");

      let statusCode = 500;
      let userFriendlyMessage = "Failed to extract enquiry details.";

      if (isAuthError) {
        statusCode = 401;
        userFriendlyMessage = "Invalid Gemini API Key or authentication credentials (401 Unauthenticated). Please check your GEMINI_API_KEY in AI Studio Settings or enter a personal API key.";
        console.warn(`[server.ts] Gemini API request unauthenticated (401). Key missing or invalid.`);
      } else if (isQuotaError) {
        statusCode = 429;
        userFriendlyMessage = "Gemini API quota or prepayment credits depleted (429 Rate Limit/Quota). Please enter your personal Gemini API key in Settings, or use Smart Paste (100% free & offline).";
        console.warn(`[server.ts] Gemini API quota / credits depleted (429/RESOURCE_EXHAUSTED).`);
      } else if (errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE")) {
        userFriendlyMessage = "The Gemini AI model is currently experiencing high demand. Please wait a moment and try clicking Autofill again.";
      } else {
        userFriendlyMessage = error?.message || userFriendlyMessage;
        console.error(`\n=== [AI EXTRACTION DIAGNOSTIC ERROR] ===`);
        console.error(`- Error occurred after: ${totalElapsedTime}ms`);
        console.error(`- Error stack/message:`, error);
        console.error(`=========================================\n`);
      }

      res.status(statusCode).json({ 
        error: userFriendlyMessage,
        isAuthError,
        isQuotaError,
        __performance: {
          filePrepareTimeMs: filePrepareTime,
          geminiApiTimeMs: geminiApiTime,
          totalServerTimeMs: totalElapsedTime,
          error: true,
        }
      });
    }
  });

  // AI Quick Assist Route for Activity Notes Summarization & WhatsApp Drafting
  app.post("/api/gemini/quick-assist", async (req, res) => {
    try {
      const customUserKey = req.headers["x-user-gemini-api-key"] as string | undefined;
      const ai = getGeminiClient(customUserKey);
      if (!ai) {
        return res.status(401).json({
          error: "No active Gemini API Key found. Please enter your personal API key in Settings or AI Studio.",
          isApiKeyMissing: true,
        });
      }

      const { action, notes, companyName, contactName, followupDate } = req.body;

      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "Please enter or dictate some notes first before using AI Assist." });
      }

      let prompt = "";
      if (action === "summarize_notes") {
        prompt = `You are an executive assistant for a commercial sales and engineering team.
Analyze and clean up the following raw activity/discussion notes. Format them into clean, concise, structured bullet points using clear sections:
• Key Points
• Key Decisions Made
• Action Items / Next Steps

Raw Notes:
"""
${notes.trim()}
"""

Provide ONLY the formatted clean bullet text without any meta-commentary, markdown headers (e.g., do not use '#' symbols or triple backticks), or intro phrases. Keep it direct and professional.`;
      } else if (action === "draft_whatsapp") {
        prompt = `You are a professional B2B client relation manager.
Generate a friendly, concise, and professional 2-sentence WhatsApp follow-up message to send to the client.
Context details:
- Client / Company: ${companyName || "valued partner"}
${contactName ? `- Contact Person: ${contactName}` : ""}
- Key Discussion Notes: ${notes.trim()}
${followupDate ? `- Scheduled Follow-Up Date: ${followupDate}` : ""}

Rules for the message:
1. Exactly 1 to 2 sentences.
2. Friendly, polite, professional, and clear.
3. Express appreciation for the discussion and confirm the agreed next step or follow-up date if available.
4. Do NOT include email subject lines, hashtags, bracketed placeholders like [Name], or formal letter salutations.
5. Provide ONLY the final message text to be sent directly on WhatsApp.`;
      } else {
        return res.status(400).json({ error: "Invalid action specified." });
      }

      const response = await retryWithBackoffAndFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        })
      );

      const resultText = response.text ? response.text.trim() : "";
      return res.json({ result: resultText });
    } catch (error: any) {
      console.error("[quick-assist error]", error);
      const errMsg = error?.message || "AI Assist processing failed.";
      const isAuthError =
        error?.status === 401 ||
        error?.status === 403 ||
        errMsg.includes("401") ||
        errMsg.includes("UNAUTHENTICATED");
      const isQuotaError =
        error?.status === 429 ||
        errMsg.includes("429") ||
        errMsg.includes("Quota") ||
        errMsg.includes("RESOURCE_EXHAUSTED");

      res.status(isAuthError ? 401 : isQuotaError ? 429 : 500).json({
        error: isAuthError
          ? "Gemini API key is invalid or missing."
          : isQuotaError
          ? "Gemini API quota exceeded. Please configure a personal API key."
          : errMsg,
        isAuthError,
        isQuotaError,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
