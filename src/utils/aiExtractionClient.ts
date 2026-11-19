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
  "price_basis": null,
  "delivery_period": null,
  "payment_terms": null,
  "validity_days": null,
  "tax_mode": null,
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

HIGH-PRECISION EXTRACTION RULES FOR ENTITIES, CONTACTS & COMMERCIAL TERMS:
1. COMPANY NAME, SALESPERSON & SUBJECT:
   - Search headers, "To:", "Client:", "Customer:", "Messrs:", "for [Company Name]", letterheads, signature blocks, and tabular text.
   - If a header sentence says e.g. "A RFQ received by Nitin Srivastava for Metichem - Enquiry Details:", extract "Nitin Srivastava" as "salesperson" and "Metichem" as "company_name"!
   - Look for corporate names like "Apex Industrial Solutions LLC", "Al Reef Projects LLC", "Gulf Engineering Services", "Meridian Systems FZE", "Metichem".
   - Extract the legal entity name as company_name and clean suffix (LLC, FZE, FZC, Co. LLC, Ltd, W.L.L., Est., etc.) into legal_suffix.
   - subject: Extract the exact Subject line or primary equipment package title of the email, RFQ, or document if present (e.g., "SUBJECT: INDUSTRIAL CONTROL UNITS FOR PHASE II EXPANSION" or "DUPLEX WATER SOFTENER SYSTEM - Complete Skid Mounted").

2. CONTACT PERSON, EMAIL & PHONE NUMBER:
   - contact_name: Search "Attn:", "Attention:", "Kind Attn:", "Contact Person:", "Name:", "Mr.", "Ms.", "Eng.".
   - contact_designation: Extract the exact job title or role of the contact person (e.g., "General Manager - Sales & Projects", "Procurement Engineer").
   - contact_email: Extract valid email addresses (e.g. rajesh.menon@apexindustrial.com, purchase@arpco.ae). DO NOT leave empty if an email appears anywhere in the text or signature.
   - contact_phone: Extract mobile or landline numbers (e.g. "+971 55 267 0574", "+971 2 5591110", "050-1234567"). DO NOT leave empty if a phone/mobile string is present.

3. COMMERCIAL TERMS & VAT MODE:
   - price_basis: Extract Incoterms or Price Basis if mentioned (e.g., "Ex-Warehouse Ajman", "Ex-Works Warehouse", "DDP Client Site", "CIF", "FOB").
   - delivery_period: Extract delivery lead time or period if mentioned (e.g., "12-14 Weeks", "Ex-Stock", "4-6 Weeks from advance").
   - payment_terms: Extract payment terms if mentioned (e.g., "50% advance, 50% immediate upon readiness at factory", "100% Advance against PI", "30 days PDC").
   - validity_days: Extract offer validity in numeric days if mentioned (e.g., "Validity: 30 days" -> 30).
   - tax_mode: If price mentions "+ VAT", "Excl. VAT", or "5% VAT Extra", set "taxes_extra". If "Incl. VAT" or "VAT Included", set "tax_calculated". If "0% VAT" or "Zero-Rated / Export", set "tax_exempt".

4. CUSTOM ATTRIBUTE KEY-VALUE PAIRS, INCLUDED SUB-ITEMS & CURRENCY DETECTION FOR LINE ITEMS:
   - currency: Detect the document's primary commercial currency ("USD" or "AED"). If table headers or values say "Unit Price (USD)", "Total Price (USD)", "USD", or "$", set "currency": "USD". Otherwise default to "AED".
   - unit_price & unit_price_aed: Extract the exact numeric unit rate shown in the document table or text (e.g. "Unit Price - AED 207,150.00 + VAT" -> 207150.00) into BOTH "unit_price" and "unit_price_aed" WITHOUT performing any currency conversion. NEVER set unit_price to 0 when the text or table shows a package price!
   - item_name: Extract the primary bold heading or equipment name of the line item (e.g. "AUTOMATIC DUPLEX MMF SYSTEM 4.32m3/hr" or "RO PRESSURE VESSEL - 8\\" x 6E, 300PSI").
   - is_composite_set & sub_components: When a line item description lists "Including with followings:", "Includes:", "Complete Skid Mounted", or sub-items/accessories with quantities (e.g. "2 x Top and bottom distribution system", "1 x Vacuum Breaker", "1 x Riser Pipe"), set "is_composite_set": true and extract each sub-item into "sub_components" with "unit_price": 0 and "is_included_accessory": true, while keeping the main package selling price in the parent item's "unit_price"!
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
  { id: 'auto', label: '⚡ Auto-Cascade (4 Hydrogen → 3.8 Flash → 3.6 Flash)' },
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Fast Frontier Default — Free & Paid)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (High-Speed Agentic & BOQ — Free & Paid)' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (Deep Frontier Reasoning — Paid Tier)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Balanced Multimodal — Replaces 3.5 Flash)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Ultra-Fast High-Throughput)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Legacy Stable Fallback)' },
];

export const DEFAULT_MODEL_CASCADE = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
];

export const DEEP_MODEL_CASCADE = [
  'gemini-4-argon',
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
];

export function isModernFrontierGeminiModel(modelName: string): boolean {
  const m = String(modelName || '').toLowerCase().trim();
  return (
    m.startsWith('gemini-4-') ||
    m.startsWith('gemini-3.8-') ||
    m.startsWith('gemini-3.6-') ||
    m.startsWith('gemini-3.5-')
  );
}

export function buildCompatibleGenerationConfig(
  modelName: string,
  _scanMode: 'fast' | 'deep' = 'fast'
): Record<string, any> {
  if (isModernFrontierGeminiModel(modelName)) {
    // Do NOT pass deprecated temperature, topP, topK, or thinkingLevel: 'minimal' to 3.5+, 3.6+, 3.8+, or 4.x models
    return {
      responseMimeType: 'application/json',
      maxOutputTokens: 65536,
    };
  }
  return {
    temperature: 0.1,
    responseMimeType: 'application/json',
    maxOutputTokens: 65536,
  };
}

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

    // Prioritize Gemini 4 Hydrogen -> 3.8 Flash -> 4 Argon -> 3.6 Flash -> 3.5 Flash-Lite -> 2.5 Flash
    candidates.sort((a, b) => {
      const score = (id: string) => {
        if (id === 'gemini-4-hydrogen') return 140;
        if (id === 'gemini-3.8-flash') return 135;
        if (id === 'gemini-4-argon') return 130;
        if (id === 'gemini-3.6-flash') return 125;
        if (id === 'gemini-3.5-flash-lite') return 120;
        if (id === 'gemini-2.5-flash') return 110;
        if (id.includes('hydrogen')) return 108;
        if (id.includes('flash') && !id.includes('lite')) return 95;
        if (id.includes('flash-lite')) return 85;
        if (id.includes('argon') || id.includes('pro')) return 75;
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

  const baseCascade =
    scanMode === 'deep'
      ? DEEP_MODEL_CASCADE
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

      const generationConfig = buildCompatibleGenerationConfig(modelName, scanMode);

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

// ============================================================================
// AI CATALOG & PRODUCT EXTRACTOR ENGINE (FILES, RAW TEXT, EXCEL & DATASHEETS)
// ============================================================================

export interface ExtractedCatalogSubComponent {
  item_name: string;
  quantity: number;
  unit: string;
  description?: string;
  brand_make?: string;
  model_part_no?: string;
  unit_price?: number;
  cost_price?: number;
  is_included_accessory?: boolean;
  attributes?: Array<{ key: string; value: string }>;
}

export interface ExtractedCatalogProductItem {
  name: string;
  sku?: string;
  category?: string;
  brand_make?: string;
  model_part_no?: string;
  country_of_origin?: string;
  hs_code?: string;
  unit?: string;
  cost_price?: number;
  unit_price?: number;
  currency?: string;
  availability?: string;
  description?: string;
  attributes?: Array<{ key: string; value: string }>;
  is_composite_set?: boolean;
  sub_components?: ExtractedCatalogSubComponent[];
  family_group_name?: string;
  variant_label?: string;
}

export interface ExtractedCatalogBatchResult {
  currency?: string;
  detected_document_type?: string;
  products: ExtractedCatalogProductItem[];
  _ai_model_used?: string;
}

export function canonicalizeCatalogAttributeKey(rawKey: string): string {
  const k = String(rawKey || '').trim();
  if (!k) return '';
  if (/^(lead\s*time|delivery|lead\s*time\s*\/\s*delivery|delivery\s*period|availability)$/i.test(k)) {
    return 'Delivery';
  }
  if (/^(dimension|dimensions|size|dimensions\s*\/\s*size|vessel\s*size)$/i.test(k)) {
    return 'Dimensions';
  }
  if (/^(design\s*pressure|operating\s*pressure|working\s*pressure|max\s*pressure|pressure\s*rating)$/i.test(k)) {
    return 'Design Pressure';
  }
  if (/^(moc|material|material\s*of\s*construction|material\s*\/\s*grade|body\s*material)$/i.test(k)) {
    return 'MOC';
  }
  if (/^(flow|flow\s*rate|rated\s*flow)$/i.test(k)) {
    return 'Flow Rate';
  }
  if (/^(capacity|volume|tank\s*capacity|capacity\s*\/\s*rating)$/i.test(k)) {
    return 'Capacity';
  }
  if (/^(operation|control|valve\s*operation)$/i.test(k)) {
    return 'Operation';
  }
  if (/^(standard|certification|approval|connection\s*\/\s*standard)$/i.test(k)) {
    return 'Standard';
  }
  return k;
}

export const getCatalogExtractionSystemPrompt = (existingCategories: string[] = []) => {
  const categoryListHint =
    existingCategories.length > 0
      ? `EXISTING WORKSPACE CATEGORIES (match one of these when appropriate, or propose a clean, concise Title-Case category name if the item belongs to a new category):\n${existingCategories
          .slice(0, 60)
          .map((c) => `- "${c}"`)
          .join('\n')}`
      : `Suggest a clean commercial category name (e.g. "FRP Filter Vessels", "Dosing Pumps", "RO Membranes", "Valves & Instruments", "Filter Media", "Chemical Dosing Tanks", "Control Panels").`;

  return `You are a Principal Engineering Catalog Architect and B2B Industrial Product Data Extractor.
Your task is to analyze the provided document (PDF datasheet, manufacturer catalog page, supplier quotation, price list, image/screenshot of a specification table, Word document, or raw multi-column Excel/text paste) and extract EVERY product, model, or size variant into a structured JSON catalog payload.

${categoryListHint}

CRITICAL EXTRACTION & STRUCTURING RULES:
1. MULTI-VARIANT & DATASHEET TABLE INTELLIGENCE (family_group_name & variant_label):
   - Datasheets, price tables, and inquiries often list multiple sizes, capacities, or models of the SAME equipment family (for example: 5 sizes of "AVENTURA FRP Pressure Vessel" like 36"x72", 42"x72", 48"x72", 63"x67"; or 4 models of "SEKO Tekna Evo Dosing Pump" like 5 LPH, 10 LPH, 20 LPH).
   - Whenever 2 or more rows belong to the same base product family:
     * Set "family_group_name" on each sibling to the shared clean Parent Family Name (e.g., "AVENTURA Multimedia FRP Filter Vessel" or "SEKO Tekna Evo Solenoid Dosing Pump") — WITHOUT the specific size/capacity suffix.
     * Set "variant_label" on each sibling to its concise differentiating size, dimension, flow, capacity, or model rating (e.g., "42\\" x 72\\"", "48\\" x 72\\"", "10 LPH @ 8 Bar", "100 Liters").
     * Set "name" on each sibling to a descriptive title (e.g., "AVENTURA Multimedia FRP Filter Vessel (48\\" x 72\\")").
   - If the document only has 1 standalone product with no sibling variants, leave "family_group_name": "" and "variant_label": "".

2. PRICING & CURRENCY DETECTION:
   - Detect the source currency ("AED", "USD", "EUR", "GBP", "SAR"). Default to "AED" if unspecified.
   - If a single price is given per item, populate it in "unit_price" (and if both cost/net price and list/selling price are shown, populate BOTH "cost_price" and "unit_price").
   - Never output NaN or formatted strings for prices; always output clean numbers (e.g., 12970).

3. TECHNICAL ATTRIBUTES & CANONICAL KEYS:
   - Extract technical parameters into the "attributes" array as [{ "key": "...", "value": "..." }].
   - Use clean canonical attribute keys:
     * "Dimensions" (for diameter x height, L x W x H, size, e.g. "48\\" x 72\\" (1200mm x 1800mm)")
     * "Design Pressure" (e.g. "6 Bar" or "10.5 Bar (150 PSI)")
     * "MOC" (Material of Construction, e.g. "FRP with PE Liner", "SS316L", "UPVC", "PVDF")
     * "Flow Rate" (e.g. "10 LPH", "15 m3/hr")
     * "Capacity" (e.g. "500 Liters", "45,000 Grains")
     * "Operation" (e.g. "Automatic Duplex", "Manual Multiport")
     * "Connection" (e.g. "4\\" Flanged Top & Bottom", "DN50 PN16")
     * "Power / Voltage" (e.g. "230V / 1Ph / 50Hz, 0.55 kW")
     * "Standard" (e.g. "ASME / NSF Certified", "CE")
     * "Delivery" (canonical key for any Lead Time / Delivery / Availability note, e.g. "Ex-Stock", "8-10 Weeks")
   - Do NOT repeat Brand/Make or Country of Origin inside "attributes" if already placed in "brand_make" and "country_of_origin".

4. COMPOSITE PACKAGES / KITS / SKIDS (is_composite_set & sub_components):
   - If a product is an assembly, package, skid, or vessel set that explicitly lists included sub-components or bill of materials (e.g. "Including: 1 x FRP Vessel, 1 x Top & Bottom Distributor Set, 1 x Internal Riser Pipe, 5 x Media Bags"), set "is_composite_set": true and populate "sub_components":
     [{ "item_name": "...", "quantity": 1, "unit": "Nos", "description": "...", "brand_make": "...", "model_part_no": "...", "unit_price": 0, "is_included_accessory": true, "attributes": [{ "key": "...", "value": "..." }] }].

5. SKU GENERATION:
   - Extract the explicit SKU / Part Number / Item Code if present in the source.
   - If no SKU is present, leave "sku": "" (or if model_part_no is an exact part code like "AKA6002", you may use it in model_part_no).

REQUIRED JSON OUTPUT FORMAT:
{
  "currency": "AED",
  "detected_document_type": "Datasheet / Price List / Quotation / Spec Table",
  "products": [
    {
      "name": "string",
      "sku": "string",
      "category": "string",
      "brand_make": "string",
      "model_part_no": "string",
      "country_of_origin": "string",
      "hs_code": "string",
      "unit": "Nos",
      "cost_price": 0,
      "unit_price": 0,
      "currency": "AED",
      "availability": "Ex-Stock",
      "description": "Concise technical subtitle without repeating every attribute",
      "family_group_name": "string (shared family name if multiple variants exist, else empty)",
      "variant_label": "string (differentiating size/capacity/model label if part of a family, else empty)",
      "is_composite_set": false,
      "sub_components": [
        {
          "item_name": "string",
          "quantity": 1,
          "unit": "Nos",
          "description": "string",
          "brand_make": "string",
          "model_part_no": "string",
          "unit_price": 0,
          "is_included_accessory": true,
          "attributes": [
            { "key": "string", "value": "string" }
          ]
        }
      ],
      "attributes": [
        { "key": "Dimensions", "value": "48\\" x 72\\"" },
        { "key": "Design Pressure", "value": "6 Bar" },
        { "key": "MOC", "value": "FRP" }
      ]
    }
  ]
}`;
};

/**
 * Lightweight zero-dependency browser .xlsx (OpenXML ZIP) parser using native DecompressionStream('deflate-raw').
 * Extracts sharedStrings.xml and worksheet XML cells into tab-separated text lines for AI consumption.
 */
async function extractTextFromXlsxBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, Uint8Array>();

  // Walk ZIP Local File Headers (PK\x03\x04 = 0x04034b50)
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      break;
    }
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
    const entryName = decoder.decode(nameBytes);
    const dataStart = offset + 30 + fileNameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    const rawSlice = bytes.subarray(dataStart, dataEnd);
    if (
      entryName === 'xl/sharedStrings.xml' ||
      entryName.startsWith('xl/worksheets/sheet')
    ) {
      if (compression === 0) {
        entries.set(entryName, rawSlice);
      } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(rawSlice);
          writer.close();
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          entries.set(entryName, new Uint8Array(decompressedBuf));
        } catch {
          // ignore decompression failure on individual entry
        }
      }
    }
    offset = dataEnd;
  }

  const sharedStrings: string[] = [];
  const sharedBytes = entries.get('xl/sharedStrings.xml');
  if (sharedBytes) {
    const xml = decoder.decode(sharedBytes);
    const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      const combined = tMatches
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join('')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      sharedStrings.push(combined);
    }
  }

  const sheetTexts: string[] = [];
  const sortedSheets = Array.from(entries.keys())
    .filter((k) => k.startsWith('xl/worksheets/sheet'))
    .sort();

  for (const sheetKey of sortedSheets) {
    const sheetBytes = entries.get(sheetKey);
    if (!sheetBytes) continue;
    const xml = decoder.decode(sheetBytes);
    const rowMatches = xml.match(/<row[\s\S]*?<\/row>/g) || [];
    const lines: string[] = [];
    for (const rowXml of rowMatches) {
      const cellMatches = rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) || [];
      const rowCells: string[] = [];
      for (const cellXml of cellMatches) {
        const typeMatch = cellXml.match(/\bt="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : '';
        const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const isMatch = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
        let val = '';
        if (cellType === 's' && vMatch) {
          const idx = parseInt(vMatch[1], 10);
          val = !isNaN(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : vMatch[1];
        } else if (isMatch) {
          val = isMatch[1];
        } else if (vMatch) {
          val = vMatch[1];
        }
        val = val
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        if (val) rowCells.push(val);
      }
      if (rowCells.length > 0) {
        lines.push(rowCells.join('\t'));
      }
    }
    if (lines.length > 0) {
      sheetTexts.push(`--- Sheet (${sheetKey.replace('xl/worksheets/', '')}) ---\n${lines.join('\n')}`);
    }
  }

  return sheetTexts.join('\n\n');
}

async function downsampleCatalogImageToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
      resolve(dataUrl.split(',')[1] || dataUrl);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

export async function prepareCatalogFileForAiExtraction(
  file: File,
  onStatus?: (msg: string) => void
): Promise<{
  content: string;
  isBase64: boolean;
  mimeType: string;
  fileName: string;
  extractedPlainTextPreview?: string;
}> {
  const lowerName = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(lowerName)) {
    onStatus?.(`Optimizing image "${file.name}" for AI vision scan...`);
    const b64 = await downsampleCatalogImageToBase64(file);
    return {
      content: b64,
      isBase64: true,
      mimeType: 'image/jpeg',
      fileName: file.name
    };
  }

  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    onStatus?.(`Encoding PDF "${file.name}" for multimodal inspection...`);
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
    return {
      content: b64,
      isBase64: true,
      mimeType: 'application/pdf',
      fileName: file.name
    };
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    onStatus?.(`Extracting specification tables & text from Word document "${file.name}"...`);
    const arrayBuffer = await file.arrayBuffer();
    const mammothMod = await import('mammoth');
    const mammoth = (mammothMod as any).default || mammothMod;
    const rawRes = await mammoth.extractRawText({ arrayBuffer });
    const text = String(rawRes?.value || '').trim();
    return {
      content: text || `Word Document: ${file.name}`,
      isBase64: false,
      mimeType: 'text/plain',
      fileName: file.name,
      extractedPlainTextPreview: text
    };
  }

  if (
    lowerName.endsWith('.xlsx') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    onStatus?.(`Parsing Excel workbook "${file.name}"...`);
    const arrayBuffer = await file.arrayBuffer();
    const extractedSheetText = await extractTextFromXlsxBuffer(arrayBuffer);
    if (extractedSheetText.trim()) {
      return {
        content: extractedSheetText,
        isBase64: false,
        mimeType: 'text/plain',
        fileName: file.name,
        extractedPlainTextPreview: extractedSheetText
      };
    }
  }

  // Fallback for .csv, .tsv, .txt, .xls
  onStatus?.(`Reading "${file.name}"...`);
  const textContent = await file.text();
  return {
    content: textContent,
    isBase64: false,
    mimeType: 'text/plain',
    fileName: file.name,
    extractedPlainTextPreview: textContent
  };
}

function normalizeExtractedCatalogBatch(
  raw: any,
  modelUsed?: string
): ExtractedCatalogBatchResult {
  const rawList: any[] = Array.isArray(raw?.products)
    ? raw.products
    : Array.isArray(raw?.line_items)
    ? raw.line_items
    : Array.isArray(raw)
    ? raw
    : [];

  const detectedCurrency = String(raw?.currency || 'AED').toUpperCase().trim() || 'AED';

  const products: ExtractedCatalogProductItem[] = rawList
    .map((item: any): ExtractedCatalogProductItem | null => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || item.item_name || item.description || '').trim();
      if (!name) return null;

      const rawAttrs: any[] = Array.isArray(item.attributes) ? item.attributes : [];
      const seenKeys = new Set<string>();
      const cleanAttrs: Array<{ key: string; value: string }> = [];
      let extractedDeliveryFromAttr = '';

      for (const a of rawAttrs) {
        const key = canonicalizeCatalogAttributeKey(a?.key || '');
        const value = String(a?.value ?? '').trim();
        if (!key || !value) continue;
        if (/^(brand|make|manufacturer)$/i.test(key)) continue;
        if (key === 'Delivery' && !extractedDeliveryFromAttr) {
          extractedDeliveryFromAttr = value;
        }
        const normKey = key.toLowerCase();
        if (!seenKeys.has(normKey)) {
          seenKeys.add(normKey);
          cleanAttrs.push({ key, value });
        }
      }

      const rawSubs: any[] = Array.isArray(item.sub_components) ? item.sub_components : [];
      const cleanSubs: ExtractedCatalogSubComponent[] = rawSubs
        .map((sub: any) => {
          const subName = String(sub?.item_name || sub?.name || sub?.description || '').trim();
          if (!subName) return null;
          const subAttrs = Array.isArray(sub?.attributes)
            ? sub.attributes
                .map((sa: any) => ({
                  key: canonicalizeCatalogAttributeKey(sa?.key || ''),
                  value: String(sa?.value ?? '').trim()
                }))
                .filter((sa: any) => sa.key && sa.value)
            : [];
          return {
            item_name: subName,
            quantity: Math.max(1, Number(sub?.quantity) || 1),
            unit: String(sub?.unit || 'Nos').trim() || 'Nos',
            description: String(sub?.description || sub?.technical_Highlight || '').trim() || undefined,
            brand_make: String(sub?.brand_make || '').trim() || undefined,
            model_part_no: String(sub?.model_part_no || '').trim() || undefined,
            unit_price: Number(sub?.unit_price) >= 0 ? Number(sub?.unit_price) : 0,
            cost_price: Number(sub?.cost_price) >= 0 ? Number(sub?.cost_price) : undefined,
            is_included_accessory: sub?.is_included_accessory !== false,
            attributes: subAttrs.length > 0 ? subAttrs : undefined
          };
        })
        .filter(Boolean) as ExtractedCatalogSubComponent[];

      const unitPriceNum = Number(
        String(item.unit_price ?? item.unit_price_aed ?? 0).replace(/,/g, '')
      );
      const costPriceNum = Number(
        String(item.cost_price ?? item.cogs_amount ?? 0).replace(/,/g, '')
      );

      return {
        name,
        sku: String(item.sku || '').trim() || undefined,
        category: String(item.category || item.product_type || 'General Equipment').trim(),
        brand_make: String(item.brand_make || item.brand || item.make || '').trim() || undefined,
        model_part_no: String(item.model_part_no || item.model || '').trim() || undefined,
        country_of_origin: String(item.country_of_origin || item.origin || '').trim() || undefined,
        hs_code: String(item.hs_code || '').trim() || undefined,
        unit: String(item.unit || (cleanSubs.length > 0 ? 'SET' : 'Nos')).trim() || 'Nos',
        cost_price: !isNaN(costPriceNum) && costPriceNum > 0 ? costPriceNum : undefined,
        unit_price: !isNaN(unitPriceNum) && unitPriceNum >= 0 ? unitPriceNum : 0,
        currency: String(item.currency || detectedCurrency).toUpperCase().trim() || detectedCurrency,
        availability:
          String(item.availability || item.default_availability || extractedDeliveryFromAttr || '').trim() ||
          undefined,
        description: String(item.description || '').trim() || name,
        attributes: cleanAttrs,
        is_composite_set: Boolean(item.is_composite_set || cleanSubs.length > 0),
        sub_components: cleanSubs.length > 0 ? cleanSubs : undefined,
        family_group_name: String(item.family_group_name || item.product_family || '').trim() || undefined,
        variant_label: String(item.variant_label || '').trim() || undefined
      };
    })
    .filter(Boolean) as ExtractedCatalogProductItem[];

  return {
    currency: detectedCurrency,
    detected_document_type: String(raw?.detected_document_type || 'Catalog Extraction'),
    products,
    _ai_model_used: modelUsed || raw?._ai_model_used
  };
}

/**
 * Extracts structured catalog products (including variant family grouping, canonical attributes, and BOM sub-components)
 * from an uploaded file or raw pasted text/Excel rows using the Gemini 4 / 3.8 / 3.6 Auto-Cascade with server-side fallback.
 */
export async function extractCatalogProductsWithAI(params: {
  apiKey?: string;
  content: string;
  isBase64: boolean;
  mimeType: string;
  fileName: string;
  existingCategories?: string[];
  signal?: AbortSignal;
  preferredModel?: string;
  onStatusUpdate?: (status: string) => void;
  scanMode?: 'fast' | 'deep';
}): Promise<ExtractedCatalogBatchResult> {
  const {
    content,
    isBase64,
    mimeType,
    fileName,
    existingCategories = [],
    signal,
    preferredModel = 'auto',
    onStatusUpdate,
    scanMode = 'fast'
  } = params;

  const resolvedKey =
    (params.apiKey && params.apiKey.trim()) ||
    (typeof window !== 'undefined' ? localStorage.getItem('omni_user_gemini_api_key')?.trim() : '') ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    '';

  const systemInstruction = getCatalogExtractionSystemPrompt(existingCategories);

  // 1. If a client-side / user key is present, run the direct multi-model cascade first
  if (resolvedKey) {
    const genAI = new GoogleGenerativeAI(resolvedKey);
    const filePart = isBase64
      ? {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: content.includes(',') ? content.split(',')[1] : content
          }
        }
      : {
          text: `Source File: ${fileName}\n\nRaw Content / Specification Table:\n${content}`
        };

    const baseCascade = scanMode === 'deep' ? DEEP_MODEL_CASCADE : DEFAULT_MODEL_CASCADE;
    const primaryModel =
      preferredModel && preferredModel !== 'auto' ? preferredModel : baseCascade[0];
    const modelSequence = Array.from(
      new Set([primaryModel, ...baseCascade.filter((m) => m !== primaryModel)])
    );

    const perModelTimeoutMs = scanMode === 'deep' ? 95000 : 48000;
    let hasAttemptedLiveDiscovery = false;

    for (let i = 0; i < modelSequence.length; i++) {
      const modelName = modelSequence[i];
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      onStatusUpdate?.(
        i === 0
          ? `Extracting catalog specs with ${modelName} (${scanMode === 'deep' ? 'Deep Scan' : 'Fast Scan'})...`
          : `Failing over to ${modelName} (${i + 1}/${modelSequence.length})...`
      );

      let modelTimeoutTimer: any = null;
      let abortListener: (() => void) | undefined;

      try {
        const modelWithSystemPrompt = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const generationConfig = buildCompatibleGenerationConfig(modelName, scanMode);

        const callPromise = modelWithSystemPrompt.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                filePart as any,
                {
                  text: 'Extract all products, variant families, technical specification attributes, pricing, and BOM sub-components into the required JSON format.'
                }
              ]
            }
          ],
          generationConfig
        });

        const perModelTimeoutPromise = new Promise<never>((_, reject) => {
          modelTimeoutTimer = setTimeout(() => {
            const timeoutErr: any = new Error(
              `Model ${modelName} exceeded ${Math.round(perModelTimeoutMs / 1000)}s latency threshold.`
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
            abortListener = () => reject(new DOMException('Aborted', 'AbortError'));
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

        return normalizeExtractedCatalogBatch(parsed, modelName);
      } catch (err: any) {
        if (
          err?.name === 'AbortError' ||
          err?.message?.toLowerCase().includes('abort') ||
          signal?.aborted
        ) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (i === modelSequence.length - 1 && !hasAttemptedLiveDiscovery) {
          hasAttemptedLiveDiscovery = true;
          const discovered = await discoverLiveGeminiModels(resolvedKey);
          const untried = discovered.filter((m) => !modelSequence.includes(m));
          if (untried.length > 0) {
            modelSequence.push(...untried);
          }
        }

        const hasNextModel = i < modelSequence.length - 1;
        if (hasNextModel) {
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }
        // If all client models failed, fall through to try the server endpoint
      } finally {
        if (modelTimeoutTimer) clearTimeout(modelTimeoutTimer);
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      }
    }
  }

  // 2. Server-side endpoint fallback (/api/gemini/extract-catalog-products)
  onStatusUpdate?.('Scanning via server AI extraction engine...');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolvedKey) {
    headers['x-user-gemini-api-key'] = resolvedKey;
  }
  const serverRes = await fetch('/api/gemini/extract-catalog-products', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName,
      mimeType,
      content: isBase64 && content.includes(',') ? content.split(',')[1] : content,
      isBase64,
      existingCategories,
      preferredModel,
      scanMode
    }),
    signal
  });

  if (!serverRes.ok) {
    let errPayload: any = null;
    try {
      errPayload = await serverRes.json();
    } catch {
      // ignore
    }
    throw new Error(
      errPayload?.error ||
        `AI Catalog extraction failed (${serverRes.status}). Please verify your Gemini API key in Settings.`
    );
  }

  const serverData = await serverRes.json();
  return normalizeExtractedCatalogBatch(serverData, serverData?._ai_model_used || 'server-cascade');
}


