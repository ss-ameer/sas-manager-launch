# Structured Quote References & Company Codes Architecture

Introduces first-class **Company Codes** (`company_code`, e.g., `CWE`, `BME`, `VWT`) and **Country Codes** (`country_code`, e.g., `UAE`, `KSA`, `OMN`) across the data model, company directory, sequence pattern engine (`{COUNTRY}`, `{COMPANY_CODE}`), and enquiry/quotation workflows while preserving 100% manual editing freedom and multi-workspace compatibility.

## User Review & Critical Decisions

> [!IMPORTANT]
> The four architectural decisions below were confirmed during interactive clarification and govern the entire implementation:

- **Confirmed Decision 1 — Zero Presets & Zero Automatic Workspace Format Mutation**:
  - Do **not** add company-specific presets in `SettingsHub` and do **not** automatically alter any existing workspace's configured sequence pattern.
  - Build the underlying token engine (`{COUNTRY}`, `{COMPANY_CODE}`) and company code infrastructure so workspaces can manually define and configure any format (such as `AVENTURA/{COUNTRY}/{COMPANY_CODE}/{SEQ}-{DD}{MM}{YY}`) on their own terms.
- **Confirmed Decision 2 — `{COUNTRY}` Resolution via Auto-Mapping + Explicit Override**:
  - Automatically map standard country names on a company record to 3-letter ISO/commercial codes (`United Arab Emirates` / `U.A.E.` → `UAE`, `Saudi Arabia` → `KSA`, `Oman` → `OMN`, `Qatar` → `QAT`, `Kuwait` → `KWT`, `Bahrain` → `BHR`, etc.), while also supporting an optional explicit `country_code` override field on the company profile.
- **Confirmed Decision 3 — Missing `{COMPANY_CODE}` Behavior (`[COMPANY_CODE]` Chip + Quick-Resolve Modal)**:
  - Never silently guess or invent a company code from a company's name.
  - When a workspace's active format pattern includes `{COMPANY_CODE}` (or `{COUNTRY}`) and no company is selected yet—or the paired company lacks a registered code—render a visible `[COMPANY_CODE]` (or `[COUNTRY]`) placeholder in the Quote Reference preview alongside an interactive **Set Company Code** chip. Clicking the chip opens a lightweight Quick-Resolve popover/modal to register and save the code directly to the company profile (or skip and type manually).
- **Confirmed Decision 4 — Live-Update Until Manually Edited + Manual Reset Button**:
  - When creating a new enquiry or claiming a reserved sequence gap, changing the paired **Company**, **Country**, **Assigned Rep**, or **Enquiry Date** automatically live-updates the generated Quote Reference **until** the user manually types into the Quote Reference input.
  - Once manually edited (e.g., appending `AA` as in `AVENTURA/UAE/BME/2851-191026AA`), the field locks (`isQuoteRefCustom = true`) so subsequent form edits never overwrite the user's custom reference. Clicking the **Auto Pattern** reset button unlocks and re-syncs the field with the live pattern at any time.

---

## 1. Overview & Core Concept

- **What It Does**: Extends the Enquiry & Quotation sequence engine and CRM company records with structured **Company Codes** (`company_code`) and **Country Codes** (`country_code`), enabling dynamic multi-segment reference patterns such as `AVENTURA/{COUNTRY}/{COMPANY_CODE}/{SEQ}-{DD}{MM}{YY}`.
- **Target Audience / Persona**: Sales engineers, commercial coordinators, and workspace administrators managing multi-company portfolios where proposals require strict client-coded and date-stamped reference nomenclature.
- **Key Value**: Eliminates error-prone manual reference construction while guaranteeing that missing company codes are captured cleanly in-flow and saved permanently to the company registry for all future enquiries.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Configuring Dynamic Tokens in Settings Hub (`SettingsHub.tsx`)**:
     - Under **Settings → Enquiries & Numbering**, the Format Pattern helper bar documents `{COUNTRY}` and `{COMPANY_CODE}` alongside `{PREFIX}`, `{SEQ}`, `{DD}`, `{MM}`, `{YY}`, `{YYYY}`, and `{REP}`.
     - The live pattern preview dynamically simulates `{COUNTRY}` (e.g., `UAE`) and `{COMPANY_CODE}` (e.g., `CWE`) so administrators can verify their custom syntax immediately.
  2. **Managing Company & Country Codes Across All Company Modals**:
     - Every company creation and editing surface (`CreateCompanyModal`, `CompanyEditModal`, `CompanyModal`, `Company360Modal`, and `EnquiryForm`'s inline company creator & AI entity registration prompt) includes dedicated **Company Code** (uppercase monospace input, e.g., `CWE`, `BME`) and **Country / Country Code Override** fields.
     - Company directory tables, search bars, and selection dropdowns display the registered `[CWE]` badge next to the company name and allow instant filtering by company code.
  3. **Live Reference Generation & Quick-Resolve Flow (`EnquiryForm.tsx` & `QuickClaimModal.tsx`)**:
     - When creating a new enquiry or claiming a **Reserved Gap** (`Gap / Reserved`), selecting a company immediately resolves `{COUNTRY}` and `{COMPANY_CODE}` into the Quote Reference field (e.g., `AVENTURA/UAE/CWE/2848-161026`).
     - If the active workspace pattern requires `{COMPANY_CODE}` and the selected company does not have one registered, the Quote Reference displays `AVENTURA/UAE/[COMPANY_CODE]/2848-161026` and highlights an amber **Missing Company Code — Set Now** action pill directly below the input.
     - Clicking **Set Now** opens an inline Quick-Resolve popover pre-filled with the selected company's name and country. Entering `CWE` and clicking **Save to Company & Apply** updates the company record in Firestore and immediately replaces `[COMPANY_CODE]` with `CWE` in the Quote Reference without losing any form progress.
     - Users can also ignore the prompt and freely type or append custom suffixes (such as `AVENTURA/UAE/BME/2851-191026AA`) directly in the Quote Reference field.
- **Visual Identity & Theme**:
  - *Typography*: `font-mono tabular-nums uppercase` for all Company Code badges, Country Code pills, and Quote Reference inputs.
  - *Status Signaling*: Crisp indigo/blue monospace badges (`bg-indigo-50 text-indigo-700 border-indigo-200`) for registered company codes; actionable amber alert chips (`bg-amber-50 text-amber-800 border-amber-300`) when a pattern requires `{COMPANY_CODE}` and the paired company lacks one.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Explicit `[COMPANY_CODE]` Placeholder Instead of Silent Slash Stripping**
  - *Chosen Approach*: When a pattern explicitly contains `{COMPANY_CODE}` and no code is resolved yet, `formatPattern` preserves `[COMPANY_CODE]` in preview/draft mode instead of silently collapsing `AVENTURA/UAE//2848-161026` into `AVENTURA/UAE/2848-161026`.
  - *Why*: Silent slash stripping hides the fact that a required segment is missing and risks saving malformed references. Rendering `[COMPANY_CODE]` makes the missing token unmistakable while allowing one-click inline resolution.
- **Decision 2: Pattern-Aware Sequence Extraction & Suffix Preservation**
  - *Chosen Approach*: Harden `parseSequenceFromQuoteRef` and `QuotationRepository.sanitizeCanonicalQuoteRef` so date segments (`-161026`), custom alphanumeric suffixes (`-191026AA`), and company codes containing digits or hyphens never get misidentified as sequence numbers or stripped as auxiliary document counters.
  - *Why*: Executive references like `AVENTURA/UAE/BME/2851-191026AA` combine a 4-digit sequence (`2851`) with a 6-digit date (`191026`) and custom letters (`AA`). Pattern-anchored regex extraction ensures `{SEQ}` (`2851`) is always isolated accurately for high-water-mark ceiling checks, and revision cloning (`-R1`, `-R2`) cleanly produces `AVENTURA/UAE/BME/2851-191026AA-R1`.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Data Flow Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          COMPANY REGISTRY & FIRESTORE (`companies`)                 │
│  • company_name: "Celar Water Equipment Co. LLC"                                    │
│  • company_code: "CWE" (Explicitly registered, never guessed)                       │
│  • country: "United Arab Emirates" | country_code: "UAE" (Auto-mapped or override)  │
└──────────────────┬───────────────────────────────────────────────┬──────────────────┘
                   │                                               │
                   ▼ (Select / Pair Company)                       ▲ (One-Click Save)
┌──────────────────────────────────────────────────┐   ┌───────────┴──────────────────┐
│     ENQUIRY FORM / GAP CLAIM / QUICK CLAIM       │   │ INLINE QUICK-RESOLVE POPOVER │
│  • Watches: companyId, country, enquiryDate, rep │   │ • Prompts when pattern uses  │
│  • Live-updates Quote Ref while !isQuoteRefCustom│   │   {COMPANY_CODE} & company   │
│  • Manual typing sets isQuoteRefCustom = true    │   │   has no registered code     │
│  • "Auto Pattern" button resets to live sync     │   │ • Saves code to Firestore    │
└──────────────────┬───────────────────────────────┘   └──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                SEQUENCE & REFERENCE ENGINE (`enquirySequences.ts`)                  │
│  • formatPattern(pattern, tokens):                                                  │
│      Resolves {PREFIX}, {COUNTRY}, {COMPANY_CODE}, {SEQ}, {DD}, {MM}, {YY}, {YYYY}  │
│      Renders [COMPANY_CODE] if pattern requires it & token is empty                 │
│  • parseSequenceFromQuoteRef(quoteRef, pattern):                                    │
│      Extracts exact {SEQ} (2848) ignoring {COMPANY_CODE}, -DDMMYY, AA, and -R1      │
│  • sanitizeCanonicalQuoteRef(ref):                                                  │
│      Preserves -DDMMYY and custom suffixes (AA); only strips aux prefixes (DO-, PO-)│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model (`Company` & `SequenceFormatTokens`)**:
  - `Company` interface (`src/types.ts` & `firebase-blueprint.json`):
    - `company_code?: string`: Registered uppercase short code (e.g., `CWE`, `BME`, `VWT`).
    - `country_code?: string`: Optional explicit 3-letter country code override (e.g., `UAE`, `KSA`).
  - `SequenceFormatTokens` interface (`src/services/enquirySequences.ts`):
    - Adds `country?: string`, `companyCode?: string`, and `preserveUnresolvedPlaceholders?: boolean`.
  - Country Auto-Mapper (`resolveCountryCode(country?: string, countryCodeOverride?: string): string`):
    - Evaluates explicit `countryCodeOverride` first; falls back to a comprehensive dictionary of GCC, MENA, and global countries (`United Arab Emirates` → `UAE`, `Saudi Arabia` → `KSA`, `Oman` → `OMN`, `Qatar` → `QAT`, `Bahrain` → `BHR`, `Kuwait` → `KWT`, `India` → `IND`, `United Kingdom` → `GBR`, `United States` → `USA`, etc.).
- **Interactive Component & State Mapping**:
  - **Enquiry Creation & Gap Claiming (`EnquiryForm.tsx`)**:
    - Tracks `isQuoteRefCustom` (`boolean`). For new enquiries and when claiming a Reserved Gap (`is_gap_placeholder` or `status === 'Gap / Reserved'`), `isQuoteRefCustom` starts as `false` so selecting a company or changing the enquiry date dynamically formats the Quote Reference using the reserved gap's `seq_number` (or next sequence) + `{COUNTRY}` + `{COMPANY_CODE}` + `{DD}{MM}{YY}`.
    - Displays the inline **Quick-Resolve Company Code** card whenever `patternRequiresCompanyCode(activePattern)` is true and the selected company lacks `company_code`.
  - **Quick Claim Modal (`QuickClaimModal.tsx`)**:
    - Pairs with the workspace's `companies` list (showing `company_code` badges) and surfaces an inline **Company Code** field when the active workspace pattern requires `{COMPANY_CODE}` and the chosen company does not yet have one, saving the code directly to the company record upon claim.
  - **Enquiry Detail & Quotation Studio (`EnquiryDetail.tsx`, `QuotationStudioModal.tsx`, `QuotationRepository.ts`)**:
    - Pairing an unassigned company in `EnquiryDetail` automatically resolves any remaining `[COMPANY_CODE]` placeholder in `quote_ref_no`.
    - Revision generation (`-R1`, `-R2`) and auxiliary document numbering (`DO-...-01`) preserve trailing date segments (`-161026`) and custom suffixes (`AA`) without truncation.
