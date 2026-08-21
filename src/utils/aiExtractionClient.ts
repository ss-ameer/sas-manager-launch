import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';

export const getExtractionSystemPrompt = (salespersons: any[]) => {
  let salespersonExclusionPrompt = "";
  if (Array.isArray(salespersons) && salespersons.length > 0) {
    const salesInfoList = salespersons
      .map((sp: any) => `- Name: "${sp.full_name}" (Initials: "${sp.initials || 'N/A'}")${sp.email ? `, Email: "${sp.email}"` : ''}${sp.phone ? `, Phone: "${sp.phone}"` : ''}`)
      .join("\n");
    salespersonExclusionPrompt = `\n\nINTERNAL SALES REPRESENTATIVES (DO NOT EXTRACT AS CLIENT CONTACTS):\nThe following persons are internal sales team representatives:\n${salesInfoList}\n\nCRITICAL RULE FOR INTERNAL SALES DETAILS:\n- DO NOT extract any of the above internal salesperson emails or phone numbers as the client's contact_email or contact_phone!\n- If an email or phone in the document matches one of these internal sales reps, set the 'salesperson' field to that rep's initials or full name, and leave the client's contact_email/contact_phone clean.`;
  }

  return `You are a professional sales engineer and RFQ data extraction assistant for an Enquiry Management System.
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
   - For every line item, extract ALL technical specifications, model specs, materials, and parameters into the 'attributes' array as explicit key-value objects: [{ "key": "Model", "value": "63\\" x 67\\"" }, { "key": "Make", "value": "Aventura" }, { "key": "Design Pressure", "value": "10.5 Bar" }, { "key": "MOC", "value": "FRP" }].
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
     * Field 14 (Product SchemaType): Category name.
     * Field 15 (Product Detail): Detailed spec text & line items.
     * Field 16 (Value): package_value (e.g. 195500.00).

5. CLASSIFICATION OF LINE ITEMS (PRODUCT VS. CHARGE / SERVICE / DISCOUNT):
   - Every line item MUST be classified by 'item_type': 'product' | 'charge' | 'discount'.
   - Assign 'item_type': 'product' for physical components, equipment, or materials (e.g. Membranes, FRP Vessels, Pumps, Valves, Filters, Chemicals, Sand Media). Set 'product_type' to the specific product category name.
   - Assign 'item_type': 'charge' for non-product fees such as transportation, freight, delivery, installation, testing, commissioning, customs clearance, or mobilization. Set 'charge_type' (e.g. "Transportation", "Installation", "Customs", "Other Charge") and set 'product_type' to "Service / Charge".
   - Assign 'item_type': 'discount' for price deductions or commercial discounts. Set 'charge_type' to "Discount".

6. FEW-SHOT TRAINING EXAMPLES FOR ACCURATE EXTRACTION:
   Example Input:
   "2792\\t2751-300626AA\\tJul-2026\\t29/06/2026\\tPV\\tAquaEnviro Solutions\\tMukesh Katara\\tmukesh.katara@aquaenvirosolutions.com\\t\\t+971 55 267 0574\\tUAE\\tDubai\\tEMAIL\\tFRP Filter Vessels...\\t\\"PRICE & COMMERCIAL TERMS\\n1 FRP Filter Vessel 63”x67” 05 Nos. 12,500.00 62,500.00\\n2 Transportation 01 LS 100.00 100.00\\"\\t195,500.00"
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
       { item_type: "product", product_type: "FRP Filter Vessels", description: "FRP Filter Vessel 63”x67” Design Pressure 10.5 Bar", quantity: 5, unit: "Nos", unit_price_aed: 12500, attributes: [{ key: "Model", value: "63\\" x 67\\"" }] },
       { item_type: "charge", charge_type: "Transportation", product_type: "Service / Charge", description: "Transportation - Up to Muscat Transporter warehouse in Muscat", quantity: 1, unit: "LS", unit_price_aed: 100, attributes: [] }
     ]

Extract the details accurately into the requested JSON format.${salespersonExclusionPrompt}`;
};

export const extractEnquiryClientSide = async (
  apiKey: string,
  content: string,
  isBase64: boolean,
  mimeType: string,
  fileName: string,
  salespersons: any[]
) => {
  if (!apiKey) {
    throw new Error('No active Gemini API Key found. Please enter your personal API key in Settings or AI Studio.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const systemInstruction = getExtractionSystemPrompt(salespersons);

  const responseSchema: Schema = {
    type: SchemaType.OBJECT,
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
      sn: { type: SchemaType.NUMBER, description: "Serial number or legacy ID if present (e.g. 2792)." },
      quote_ref_no: { type: SchemaType.STRING, description: "Quote reference number if present." },
      received_date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format." },
      proposal_option: { type: SchemaType.STRING, description: "Proposal designation / option e.g. 'PV'." },
      company_name: { type: SchemaType.STRING },
      legal_suffix: {
        type: SchemaType.STRING,
        description: "Must be: 'LLC' | 'FZE' | 'FZC' | 'Co. LLC' | 'Ltd' | 'W.L.L.' | 'Est.' | 'None / Other'",
      },
      contact_name: { type: SchemaType.STRING },
      contact_email: { type: SchemaType.STRING },
      contact_phone: { type: SchemaType.STRING },
      country: { type: SchemaType.STRING },
      project_location: { type: SchemaType.STRING },
      salesperson: { type: SchemaType.STRING },
      enquiry_source: { type: SchemaType.STRING },
      category: { type: SchemaType.STRING },
      package_value: { type: SchemaType.NUMBER },
      probability: { type: SchemaType.STRING },
      expected_award_date: { type: SchemaType.STRING },
      status: { type: SchemaType.STRING },
      remarks: { type: SchemaType.STRING },
      line_items: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          required: ["item_type", "description", "quantity", "unit", "unit_price_aed", "attributes"],
          properties: {
            item_type: { type: SchemaType.STRING, description: "'product' | 'charge' | 'discount'" },
            charge_type: { type: SchemaType.STRING },
            product_type: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            quantity: { type: SchemaType.NUMBER },
            unit: { type: SchemaType.STRING },
            unit_price_aed: { type: SchemaType.NUMBER },
            margin_percentage: { type: SchemaType.NUMBER },
            margin_amount: { type: SchemaType.NUMBER },
            cogs_amount: { type: SchemaType.NUMBER },
            remarks: { type: SchemaType.STRING },
            attributes: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                required: ["key", "value"],
                properties: {
                  key: { type: SchemaType.STRING },
                  value: { type: SchemaType.STRING },
                },
              },
            },
          },
        },
      },
      confidence_scores: {
        type: SchemaType.OBJECT,
        required: ["company_name", "contact_name", "project_location", "line_items"],
        properties: {
          company_name: { type: SchemaType.STRING, description: "'high' | 'medium' | 'low'" },
          contact_name: { type: SchemaType.STRING, description: "'high' | 'medium' | 'low'" },
          project_location: { type: SchemaType.STRING, description: "'high' | 'medium' | 'low'" },
          line_items: { type: SchemaType.STRING, description: "'high' | 'medium' | 'low'" },
        },
      },
    },
  };

  const filePart = isBase64
    ? {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: content,
        },
      }
    : {
        text: `Document Name: ${fileName}\n\nDocument Plain Text:\n${content}`,
      };

  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema,
  };

  // Note: the `systemInstruction` in @google/generative-ai goes in `generationConfig`? 
  // Wait, systemInstruction goes into `genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction })` 
  // OR into the method params depending on the version. Let's put it in both places just to be safe, or just in getGenerativeModel.
  const modelWithSystemPrompt = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction,
  });

  const response = await modelWithSystemPrompt.generateContent({
    contents: [
      { role: 'user', parts: [filePart as any, { text: "Analyze the attached document or raw Excel copy-pasted text and extract the enquiry details into the requested JSON format." }] }
    ],
    generationConfig,
  });

  const text = response.response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    // Strip backticks just in case
    const stripped = text.replace(/^```json\n/, '').replace(/\n```$/, '');
    return JSON.parse(stripped);
  }
};
