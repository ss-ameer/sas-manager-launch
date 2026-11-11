import { GoogleGenerativeAI } from '@google/generative-ai';

export const getExtractionSystemPrompt = (salespersons: any[]) => {
  let salespersonExclusionPrompt = "";
  if (Array.isArray(salespersons) && salespersons.length > 0) {
    const salesInfoList = salespersons
      .map((sp: any) => `- Name: "${sp.full_name}" (Initials: "${sp.initials || 'N/A'}")${sp.email ? `, Email: "${sp.email}"` : ''}${sp.phone ? `, Phone: "${sp.phone}"` : ''}`)
      .join("\n");
    salespersonExclusionPrompt = `\n\nINTERNAL SALES REPRESENTATIVES (DO NOT EXTRACT AS CLIENT CONTACTS):\nThe following persons are internal sales team representatives:\n${salesInfoList}\n\nCRITICAL RULE FOR INTERNAL SALES DETAILS:\n- DO NOT extract any of the above internal salesperson emails or phone numbers as the client's contact_email or contact_phone!\n- If an email or phone in the document matches one of these internal sales reps, set the 'salesperson' field to that rep's initials or full name, and leave the client's contact_email/contact_phone clean.`;
  }

  const JSON_FORMAT = `
REQUIRED JSON OUTPUT FORMAT:
{
  "sn": null,
  "quote_ref_no": null,
  "subject": null,
  "received_date": null,
  "proposal_option": null,
  "option": null,
  "company_name": null,
  "legal_suffix": null,
  "contact_name": null,
  "contact_designation": null,
  "contact_email": null,
  "contact_phone": null,
  "country": null,
  "project_location": null,
  "salesperson": null,
  "enquiry_source": null,
  "category": null,
  "currency": "AED",
  "package_value": null,
  "probability": null,
  "expected_award_date": null,
  "status": null,
  "remarks": null,
  "line_items": [
    {
      "item_type": "product",
      "charge_type": null,
      "product_type": null,
      "item_name": null,
      "description": null,
      "option_designation": "Default / Included",
      "quantity": null,
      "unit": null,
      "unit_price": null,
      "unit_price_aed": null,
      "margin_percentage": null,
      "margin_amount": null,
      "cogs_amount": null,
      "remarks": null,
      "is_composite_set": false,
      "sub_components": [
        {
          "item_name": "string",
          "quantity": 1,
          "unit": "Nos",
          "unit_price": 0,
          "is_included_accessory": true,
          "technical_Highlight": "string"
        }
      ],
      "attributes": [
        {
          "key": "string",
          "value": "string"
        }
      ]
    }
  ],
  "confidence_scores": {
    "company_name": "high",
    "contact_name": "high",
    "project_location": "high",
    "line_items": "high"
  }
}`;

  return `You are a professional sales engineer and RFQ data extraction assistant for an Enquiry Management System.
Your job is to analyze the uploaded document or copy-pasted raw text (which may be a Request for Quotation (RFQ), specification sheet, purchase order, enquiry details, email message, PDF file, or a raw multi-column row copy-pasted directly from Microsoft Excel or Google Sheets) and extract structured enquiry details with extreme precision.

HIGH-PRECISION EXTRACTION RULES FOR ENTITIES & CONTACTS:
1. COMPANY NAME & SUBJECT:
   - Search headers, "To:", "Client:", "Customer:", "Messrs:", letterheads, signature blocks, and tabular text.
   - Look for corporate names like "Apex Industrial Solutions LLC", "Al Reef Projects LLC", "Gulf Engineering Services", "Meridian Systems FZE".
   - Extract the legal entity name as company_name and clean suffix (LLC, FZE, FZC, Co. LLC, Ltd, W.L.L., Est., etc.) into legal_suffix.
   - subject: Extract the exact Subject line of the email, RFQ, or document if present (e.g., "SUBJECT: INDUSTRIAL CONTROL UNITS FOR PHASE II EXPANSION").

2. CONTACT PERSON, EMAIL & PHONE NUMBER:
   - contact_name: Search "Attn:", "Attention:", "Kind Attn:", "Contact Person:", "Name:", "Mr.", "Ms.", "Eng.".
   - contact_designation: Extract the exact job title or role of the contact person (e.g., "General Manager - Sales & Projects", "Procurement Engineer").
   - contact_email: Extract valid email addresses (e.g. rajesh.menon@apexindustrial.com, purchase@arpco.ae). DO NOT leave empty if an email appears anywhere in the text or signature.
   - contact_phone: Extract mobile or landline numbers (e.g. "+971 55 267 0574", "+971 2 5591110", "050-1234567"). DO NOT leave empty if a phone/mobile string is present.

3. CUSTOM ATTRIBUTE KEY-VALUE PAIRS, INCLUDED SUB-ITEMS & CURRENCY DETECTION FOR LINE ITEMS:
   - currency: Detect the document's primary commercial currency ("USD" or "AED"). If table headers or values say "Unit Price (USD)", "Total Price (USD)", "USD", or "$", set "currency": "USD". Otherwise default to "AED".
   - unit_price & unit_price_aed: Extract the exact numeric unit rate shown in the document table (e.g. 7157.00 or 2000.00) into BOTH "unit_price" and "unit_price_aed" WITHOUT performing any currency conversion. NEVER set unit_price to 0 when the table shows a package price!
   - item_name: Extract the primary bold heading or equipment name of the line item (e.g. "AUTOMATIC DUPLEX MMF SYSTEM 4.32m3/hr" or "RO PRESSURE VESSEL - 8\\" x 6E, 300PSI").
   - is_composite_set & sub_components: When a line item description lists "Including with followings:", "Includes:", or sub-items/accessories with quantities (e.g. "2 x Top and bottom distribution system", "1 x Vacuum Breaker", "1 x Riser Pipe"), set "is_composite_set": true and extract each sub-item into "sub_components" with "unit_price": 0 and "is_included_accessory": true, while keeping the main package selling price in the parent item's "unit_price"!
   - For every line item, extract ALL technical specifications, model specs, materials, and parameters into the 'attributes' array as explicit key-value objects: [{ "key": "Model", "value": "CCU-6300" }, { "key": "Make", "value": "OEM Standard" }, { "key": "Design Rating", "value": "10.5 Bar" }, { "key": "Material", "value": "SS316L" }].
   - Common Attribute Keys to extract when found: "Model", "Make / Brand", "Design Rating", "Dimensions", "Material / Grade", "Operation", "Capacity", "Application", "Standard", "Lead Time / Delivery".
   - BOTH 'key' and 'value' strings MUST be non-empty strings for each attribute object.

4. RAW EXCEL TAB-DELIMITED ROWS & COPY-PASTED TEXT RULES:
   - When data is tab-delimited or pipe-delimited Excel rows:
     * Field 1 (S/N #): sn (e.g. 2792).
     * Field 2 (Quote Ref No): quote_ref_no ALWAYS! (e.g. "2751-300626AA").
     * Field 3 (Listed): Month e.g. "Jul-2026".
     * Field 4 (Received Date): Convert to YYYY-MM-DD (e.g. "29/06/2026" -> "2026-06-29").
     * Field 5 (Sales Person): salesperson (e.g. "PV").
     * Field 6 (Customer Name): company_name (e.g. "Apex Industrial Solutions LLC").
     * Field 7 (Contact Person): contact_name (e.g. "Rajesh Menon").
     * Field 8 (Email): contact_email (e.g. "rajesh.menon@apexindustrial.com").
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
   - Assign 'item_type': 'product' for physical components, equipment, or materials (e.g. Control Units, Industrial Pumps, Actuated Valves, Sensors, Modular Skids, Spares Kits). Set 'product_type' to the specific product category name.
   - Assign 'item_type': 'charge' for non-product fees such as transportation, freight, delivery, installation, testing, commissioning, customs clearance, or mobilization. Set 'charge_type' (e.g. "Transportation", "Installation", "Customs", "Other Charge") and set 'product_type' to "Service / Charge".
   - Assign 'item_type': 'discount' for price deductions or commercial discounts. Set 'charge_type' to "Discount".

6. DATES & RECEIVED DATE LOGIC:
   - received_date: Explicitly prioritize the ACTUAL date the enquiry was submitted or sent by the client (e.g., extract "2026-08-07" from the phrase "email enquiry dated 07/08/2026"). DO NOT default to the document's generation or print date unless absolutely no other submitted/sent date exists.

7. DYNAMIC OPTION & ADD-ON DETECTION RULES:
   - Detect table section headings, banners, or subheadings such as "OPTION A", "OPTION B", "OPTION C", "ALTERNATIVE 1", "OPTION 1", etc.
   - For all products appearing under an option heading, set item "option_designation" dynamically to that exact option label (e.g., "Option A", "Option B", "Option C").
   - If an item description contains "OPTIONAL", "ADD-ON", "RECOMMENDED SPARES", "STANDBY UNIT (OPTIONAL)", or is clearly presented as an elective extra rather than a core deliverable, set "option_designation" to "Optional / Add-On".
   - For standard components without an explicit option section, set "option_designation" to "Default / Included".
   - Set document-level commercial scope "option" field: if multiple options (Option A, B, etc.) are detected, set to "Multi-Option (A/B/C)"; otherwise set to "None / Single Option".

8. FEW-SHOT TRAINING EXAMPLES FOR ACCURATE EXTRACTION:
   Example Input:
   "2792\\t2751-300626AA\\tJul-2026\\t29/06/2026\\tPV\\tApex Industrial Solutions LLC\\tRajesh Menon\\trajesh.menon@apexindustrial.com\\t\\t+971 55 267 0574\\tUAE\\tDubai\\tEMAIL\\tGeneral Equipment...\\t\\"PRICE & COMMERCIAL TERMS\\n1 Commercial Control Unit CCU-6300 05 Nos. 12,500.00 62,500.00\\n2 Transportation 01 LS 100.00 100.00\\"\\t195,500.00"
   Output Mapping:
   - quote_ref_no: "2751-300626AA"
   - company_name: "Apex Industrial Solutions LLC"
   - contact_name: "Rajesh Menon"
   - contact_email: "rajesh.menon@apexindustrial.com"
   - contact_phone: "+971 55 267 0574"
   - country: "UAE"
   - project_location: "Dubai"
   - currency: "AED"
   - package_value: 195500.00
   - line_items: [
       { item_type: "product", product_type: "General Equipment", item_name: "Commercial Control Unit CCU-6300", description: "Commercial Control Unit CCU-6300 Design Rating 10.5 Bar", quantity: 5, unit: "Nos", unit_price: 12500, unit_price_aed: 12500, attributes: [{ key: "Model", value: "CCU-6300" }] },
       { item_type: "charge", charge_type: "Transportation", product_type: "Service / Charge", item_name: "Transportation", description: "Transportation - Standard Delivery to Client Site", quantity: 1, unit: "LS", unit_price: 100, unit_price_aed: 100, attributes: [] }
     ]

Extract the details accurately into the requested JSON format.${salespersonExclusionPrompt}\n\n${JSON_FORMAT}`;
};

export const AVAILABLE_GEMINI_MODELS = [
  { id: 'auto', label: '⚡ Auto-Cascade (Fast Flash Routing)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast & Reliable Default)' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (High Speed)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest (Stable Alias)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (Ultra Fast)' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (Deep Complex BOQ)' },
];

export const DEFAULT_MODEL_CASCADE = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
];

export async function discoverLiveGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];

    const candidates = rawModels
      .filter((m) => {
        const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        if (!methods.includes('generateContent')) return false;
        const name = String(m?.name || '').replace(/^models\//, '').toLowerCase();
        if (!name.startsWith('gemini-')) return false;
        const excluded = ['1.5', '1.0', '2.0', 'embedding', 'imagen', 'veo', 'tts', 'audio', 'robotics', 'computer-use', 'customtools'];
        if (excluded.some((ex) => name.includes(ex))) return false;
        return true;
      })
      .map((m) => String(m.name).replace(/^models\//, ''));

    // Prioritize proven Flash models first
    candidates.sort((a, b) => {
      const score = (id: string) => {
        if (id === 'gemini-2.5-flash') return 110;
        if (id === 'gemini-3-flash-preview') return 105;
        if (id === 'gemini-flash-latest') return 100;
        if (id.includes('flash') && !id.includes('lite')) return 90;
        if (id.includes('flash-lite')) return 80;
        if (id.includes('pro')) return 70;
        return 50;
      };
      return score(b) - score(a);
    });

    return Array.from(new Set(candidates));
  } catch (err) {
    console.warn('[aiExtractionClient] Failed to discover live Gemini models:', err);
    return [];
  }
}

export async function extractEnquiryClientSide(
  apiKey: string,
  content: string,
  isBase64: boolean,
  mimeType: string,
  fileName: string,
  salespersons?: any[],
  signal?: AbortSignal,
  preferredModel?: string,
  onStatusUpdate?: (status: string) => void,
  scanMode: 'fast' | 'deep' = 'fast'
): Promise<any> {
  if (!apiKey) {
    throw new Error('No active Gemini API Key found. Please enter your personal API key in Settings or AI Studio.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = getExtractionSystemPrompt(salespersons || []);

  const filePart = isBase64
    ? {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: content.includes(',') ? content.split(',')[1] : content,
        },
      }
    : {
        text: `Document Name: ${fileName}\n\nDocument Plain Text:\n${content}`,
      };

  const generationConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
  };

  const baseCascade =
    scanMode === 'deep'
      ? ['gemini-2.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', ...DEFAULT_MODEL_CASCADE]
      : DEFAULT_MODEL_CASCADE;

  const primaryModel = preferredModel && preferredModel !== 'auto' ? preferredModel : baseCascade[0];
  const modelSequence = Array.from(
    new Set([primaryModel, ...baseCascade.filter((m) => m !== primaryModel)])
  );

  const perModelTimeoutMs = scanMode === 'deep' ? 90000 : 45000;
  let lastError: any = null;
  let hasAttemptedLiveDiscovery = false;

  for (let i = 0; i < modelSequence.length; i++) {
    const modelName = modelSequence[i];

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    onStatusUpdate?.(
      i === 0
        ? `Scanning with ${modelName} (${scanMode === 'deep' ? 'Deep Scan' : 'Fast Scan'})...`
        : `Failing over to ${modelName} (${i + 1}/${modelSequence.length})...`
    );

    let modelTimeoutTimer: any = null;
    let abortListener: (() => void) | undefined;

    try {
      const modelWithSystemPrompt = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

      const callPromise = modelWithSystemPrompt.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              filePart as any,
              {
                text: "Analyze the attached document or raw Excel copy-pasted text and extract the enquiry details (including any sub_components for packages/sets) into the requested JSON format.",
              },
            ],
          },
        ],
        generationConfig,
      });

      const perModelTimeoutPromise = new Promise<never>((_, reject) => {
        modelTimeoutTimer = setTimeout(() => {
          const timeoutErr: any = new Error(
            `Model ${modelName} call exceeded ${Math.round(perModelTimeoutMs / 1000)}s latency threshold.`
          );
          timeoutErr.isModelTimeout = true;
          reject(timeoutErr);
        }, perModelTimeoutMs);
      });

      const racePromises: Promise<any>[] = [callPromise, perModelTimeoutPromise];

      if (signal) {
        const abortPromise = new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          abortListener = () => {
            reject(new DOMException('Aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abortListener, { once: true });
        });
        racePromises.push(abortPromise);
      }

      const response: any = await Promise.race(racePromises);

      const text = response.response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const stripped = text.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
        parsed = JSON.parse(stripped);
      }
      if (parsed && typeof parsed === 'object') {
        parsed._ai_model_used = modelName;
      }
      return parsed;
    } catch (err: any) {
      lastError = err;

      // If aborted, exit immediately without retrying other models
      if (
        err?.name === 'AbortError' ||
        err?.message?.toLowerCase().includes('abort') ||
        signal?.aborted
      ) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Handle per-model timeout
      if (err?.isModelTimeout) {
        console.warn(`[aiExtractionClient] ${modelName} latency threshold reached.`);
        const hasNextModel = i < modelSequence.length - 1;
        if (hasNextModel) {
          onStatusUpdate?.(`${modelName} timed out. Failing over to next engine...`);
          continue;
        } else {
          throw new Error(`Model ${modelName} timed out and no more engines are available in pool.`);
        }
      }

      const errMsg = String(err?.message || '');
      const lowerMsg = errMsg.toLowerCase();
      const isInvalidApiKey =
        lowerMsg.includes('api_key_invalid') ||
        lowerMsg.includes('api key not valid') ||
        lowerMsg.includes('unauthenticated');

      if (isInvalidApiKey) {
        throw err;
      }

      // Treat 400, 404, 429, 500, 503, unsupported model, or network errors as immediate failover triggers (<100ms)
      if (i === modelSequence.length - 1 && !hasAttemptedLiveDiscovery) {
        hasAttemptedLiveDiscovery = true;
        onStatusUpdate?.('Discovering live Gemini models for failover...');
        const discovered = await discoverLiveGeminiModels(apiKey);
        const untried = discovered.filter((m) => !modelSequence.includes(m));
        if (untried.length > 0) {
          modelSequence.push(...untried);
        }
      }

      const hasNextModel = i < modelSequence.length - 1;
      if (hasNextModel) {
        onStatusUpdate?.(`${modelName} unavailable. Failing over immediately...`);
        console.warn(`[aiExtractionClient] ${modelName} failed (${errMsg}). Failing over immediately to next model...`);
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }

      throw err;
    } finally {
      if (modelTimeoutTimer) {
        clearTimeout(modelTimeoutTimer);
      }
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }

  throw lastError || new Error('All models in fallback cascade failed to extract enquiry.');
}

/**
 * Client-side fallback for AI Quick Assist (summarize_notes and draft_whatsapp)
 * when the Express backend endpoint is unreachable on static deployments.
 */
export async function quickAssistClientSide(
  action: 'summarize_notes' | 'draft_whatsapp',
  params: {
    apiKey?: string;
    companyName?: string;
    contactName?: string;
    channel?: string;
    outcome?: string;
    purpose?: string;
    notes?: string;
    salespersonName?: string;
  }
): Promise<string> {
  const resolvedKey =
    (params.apiKey && params.apiKey.trim()) ||
    (typeof window !== 'undefined' ? localStorage.getItem('omni_user_gemini_api_key')?.trim() : '') ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    '';

  if (!resolvedKey) {
    throw new Error('GEMINI_API_KEY_MISSING: No active Gemini API key found. Please configure your personal API key in Settings.');
  }

  const genAI = new GoogleGenerativeAI(resolvedKey);
  const prompt =
    action === 'summarize_notes'
      ? `You are an expert B2B CRM sales assistant.
Refine and structure the following rough activity notes into a clean, professional, concise CRM log entry (2-4 bullet points or short sentences, preserving all key facts, pricing, or commitments).
Company: ${params.companyName || 'Client'}
Contact: ${params.contactName || 'N/A'}
Channel: ${params.channel || 'Call'}
Purpose: ${params.purpose || 'Follow-Up'}
Outcome: ${params.outcome || 'Logged'}
Raw Notes: ${params.notes || 'Discussed quotation status and next steps.'}

Output ONLY the refined notes text without introductory filler.`
      : `You are an expert B2B sales executive in the UAE/GCC.
Draft a concise, polite, ready-to-send WhatsApp follow-up message based on this activity:
Company: ${params.companyName || 'Valued Client'}
Contact Name: ${params.contactName || 'Sir/Madam'}
Purpose: ${params.purpose || 'Quotation Follow-Up'}
Outcome: ${params.outcome || 'Follow-Up'}
Context / Notes: ${params.notes || 'Following up on our submitted commercial quotation.'}
Sender: ${params.salespersonName || 'Sales Team'}

Keep it warm, professional, and brief (3-5 sentences max). Output ONLY the WhatsApp message text.`;

  let lastErr: any = null;
  const triedModels = new Set<string>();

  for (const modelName of DEFAULT_MODEL_CASCADE) {
    triedModels.add(modelName);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err: any) {
      lastErr = err;
    }
  }

  const discovered = await discoverLiveGeminiModels(resolvedKey);
  for (const liveModel of discovered) {
    if (triedModels.has(liveModel)) continue;
    triedModels.add(liveModel);
    try {
      const model = genAI.getGenerativeModel({ model: liveModel });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Failed to generate AI Quick Assist response.');
}

