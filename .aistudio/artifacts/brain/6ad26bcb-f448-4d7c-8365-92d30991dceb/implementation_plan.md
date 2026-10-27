# Multi-Brand Quotation Studio & Document Settings Standardization

Streamlines `Settings > Documents` and the `Quotation Studio` into a public-ready, multi-brand B2B SaaS experience by separating company identity data from visual template design, adding deep customization for the Signatures & Stamp block, enabling sister-company differentiation per preset, unifying Bank Account cards with Preset cards, and establishing a crystal-clear 3-Save workflow.

## User Review & Critical Decisions

> [!IMPORTANT]
> All four product and design choices from the clarification step have been locked into this plan:

- **Confirmed Decision 1 — Signature & Stamp Alignment Controls**: Add full horizontal block layout alignment (`Left`, `Center`, `Right`, `Space Between`), per-signatory text alignment (`Left`, `Center`, `Right`), stamp placement relative to the signature (`Left`, `Center`, `Right`, `Overlay`), and vertical spacing + signature line width controls.
- **Confirmed Decision 2 — Custom Signatory Details & Deal Owner Auto-Fill**: Support optional direct phone number and email address toggles (with one-click auto-fill from the assigned Deal Owner), custom text lines per signatory (e.g., Department, Employee/Engineer ID, License #), a `"For and on behalf of [Company Name]"` prefix toggle, and a `"Date Signed"` line toggle.
- **Confirmed Decision 3 — Sister-Company & Multi-Brand Preset Differentiation**: Store per-preset visual identity controls—Document Font Family (`Modern Sans`, `Classic Editorial Serif`, `Technical Engineering`), Table & Block Header Styles (`Solid Fill`, `Tinted Surface`, `Underline Border`, `Minimal Clean`), Top Letterhead Accent Bar Style (`Thick Bar`, `Double Line`, `Side Accent`, `None`), and optional Per-Preset Company Identity Overrides (alternate trading name, logo, and stamp)—so two presets look like completely independent companies.
- **Confirmed Decision 4 — Unified Remittance Bank Account Cards & Decluttered Settings**: Remove the redundant `"Default Header Logo Style"` and `"Executive Theme Swatches & Default Document Presentation"` sections from `Settings > Documents`, keep the Header as a single unified section, redesign Remittance Bank Account cards to match the clean key-value card structure of the Quotation Template Presets, and enforce a strict 3-Save architecture (`Save Company Info` in Settings, `Update Preset` in the Studio preset bar, and `Save Quotation` at the bottom of the Studio).

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the quotation builder from a rigid single-company layout into a flexible, multi-brand B2B document engine where each template preset can carry its own typography, table/card header treatment, letterhead bar geometry, signature block layout, and optional brand identity overrides.
- **Target Audience / Persona**: B2B commercial teams, multi-division enterprises, and operators managing multiple trading identities or sister companies who need distinct, unlinked commercial offers without switching accounts.
- **Key Value**: Eliminates visual clutter in Settings, removes confusion over multiple competing Save buttons, and empowers users to craft distinct, print-perfect commercial offers directly inside the interactive Studio.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Configuring Company Info & Bank Accounts (`Settings > Documents`)**:
   - The user manages only core workspace data in Settings: **1. Company Details** (legal name, TRN, address, contact details, default logo/stamp/signature uploads, and default signatory names), **2. Bank Accounts**, **3. Quotation Presets**, and **4. Live Quotation Preview**.
   - Redundant styling blocks (`Default Header Logo Style` and `Executive Theme Swatches & Default Document Presentation`) are removed from Settings so visual styling lives exclusively inside the Studio/Preset builder.
   - Bank accounts are displayed in the same clean, unified card layout as Quotation Presets: a crisp top row with the bank name, currency badge, `DEFAULT` badge, and compact `Set Default` / `Edit` / `Delete` actions, followed by a clean `border-t` divider and right-aligned horizontal key-value rows (`Beneficiary:`, `Account No:`, `IBAN:`, `SWIFT / BIC:`, `Branch:`).
   - Clicking **`Save Company Info`** saves the workspace profile data clearly and predictably.

2. **Designing Distinct Sister-Company Presets (`Quotation Studio → Structure & Theme`)**:
   - In the left pane under **Global Theme & Presentation**, the user can pick:
     - **Document Font Family**: `Modern Sans` (Plus Jakarta Sans / DM Sans), `Classic Serif` (Playfair Display / Georgia editorial), or `Technical Mono-Accent` (Outfit / JetBrains Mono tabular).
     - **Top Accent Bar**: `Thick Bar` (classic top stripe), `Double Line` (executive dual rule), `Side Accent` (left vertical header bar), or `None` (clean paper top).
     - **Table & Section Header Style**: `Solid Fill` (high-contrast accent fill with white text), `Tinted Surface` (soft accent tint with dark accent text), `Underline Accent` (clean bottom border in accent color), or `Minimal` (subtle typographic header).
     - **Preset Brand Identity Override (Optional)**: An expandable section allowing a preset to specify an alternate Company/Trading Name, alternate Logo, and alternate Stamp so a sister company's preset renders its own identity automatically.
   - In the top preset bar, clicking **`Update Preset`** (or **`+ Save as New Preset`**) saves all visual styling, layout blocks, and preset overrides directly to the selected preset.

3. **Customizing the Signatures & Stamp Area (`Quotation Studio → Right Inspector`)**:
   - Clicking the Signatures & Stamp block on the A4 preview opens the streamlined Right Inspector.
   - Controls are organized into clean, scannable groups with short single-line labels:
     - **Block & Column Alignment**: Horizontal distribution (`Left`, `Center`, `Right`, `Space Between`) and Signatory Text Alignment (`Left`, `Center`, `Right`).
     - **Stamp Placement**: Position the stamp `Left of Signature`, `Centered`, `Right of Signature`, or `Overlapping Signature` (with free-floating size, rotation, and X/Y offset sliders that never stretch the card height).
     - **Signature Line & Spacing**: Adjust vertical signature height (`Compact`, `Standard`, `Spacious`) and signature line width (`Narrow`, `Standard`, `Wide`, or `Hidden`).
     - **Signatory Details & Prefix**: Toggle `"For and on behalf of [Company Name]"` header text, toggle `"Date Signed"` line, toggle direct **Phone** and **Email** display (with a **`Auto-Fill from Deal Owner`** button), and add **Custom Lines** per signatory (e.g., `Department: Projects Division`, `License / ID: ENG-4092`).

4. **Saving a Quotation (`Quotation Studio Bottom Bar`)**:
   - When creating or editing an enquiry quotation, the bottom bar features one primary **`Save Quotation`** action (and status selector). When opened from `Settings > Documents` as a Sandbox preview, the bottom bar clearly indicates Sandbox mode and focuses on **`Update Preset`** so there are never three ambiguous save buttons competing for attention.

### Visual Identity & Theme

- **Aesthetic Direction**: High-craft B2B SaaS workspace following the 60-30-10 neutral-to-accent discipline—crisp white cards (`#FFFFFF`), cool slate structural surfaces (`#F8FAFC`, `#E2E8F0` hairline borders), and purposeful blue/indigo primary actions.
- **Typography & Hierarchy**:
  - Single-line section titles (`whitespace-nowrap truncate`) across all Settings cards and Right Inspector groups—eliminating multi-line wrapped headers and mechanical jargon.
  - Strictly `tabular-nums` / `font-mono` for all account numbers, IBANs, SWIFT codes, prices, and dimensions.
- **Component Styling & Layout**:
  - Single-elevation card containers (`border border-slate-200 bg-white rounded-xl`) with horizontal `flex justify-between` key-value rows for Bank Accounts and Presets.
  - Segmented pill/button selectors in the Right Inspector with concise 1–2 word labels (`Left`, `Center`, `Right`, `Spread`) that never wrap onto two lines.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Removing Styling Controls from `Settings > Documents`**:
  - *Chosen Approach*: Remove `"Default Header Logo Style"` and `"Executive Theme Swatches & Default Document Presentation"` from the Settings form; manage all visual styling inside the interactive Quotation Studio and Presets.
  - *Why*: Having styling controls in both Settings and the Studio created confusion over which setting took precedence and cluttered the Settings page. Keeping Settings focused on factual company data (Info, Banks, Presets) and the Studio focused on visual design makes both screens cleaner and faster to use.
- **Decision 2 — Strict 3-Save Separation**:
  - *Chosen Approach*:
    1. **`Save Company Info`** (in `Settings > Documents` top bar) — saves only the workspace company details, default assets, and bank accounts.
    2. **`Update Preset`** / **`+ Save as New Preset`** (in the Studio Preset bar) — saves the active visual design, blocks, header/footer layout, and signature configuration to the template preset.
    3. **`Save Quotation`** (in the Studio bottom bar when working on a deal) — saves the commercial offer for the specific customer enquiry.
  - *Why*: Users always know whether they are updating their company profile, updating a reusable template preset, or saving a specific customer quote.
- **Decision 3 — Unified Header Block with Preset-Level Brand Overrides**:
  - *Chosen Approach*: Keep the Header as a single unified section while allowing any Preset to optionally store its own `companyNameOverride`, `logoUrl`, and `companySealUrl` alongside font family and header/table styling.
  - *Why*: Avoids the layout fragility of splitting the header into separate movable blocks while giving sister companies complete visual and brand independence per preset.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SETTINGS > DOCUMENTS VIEW                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐  │
│  │ 1. Company Details   │  │ 2. Bank Accounts     │  │ 3. Template Presets│  │
│  │ (Entity, TRN, Assets,│  │ (Unified Key-Value   │  │ (Unified Key-Value │  │
│  │  Default Signatories)│  │  Cards + Default)    │  │  Cards + Default)  │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └─────────┬──────────┘  │
│             └─────────────────────────┼────────────────────────┘             │
│                                       ▼                                      │
│                         [ Save Company Info (Button 1) ]                     │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         3-PANE QUOTATION STUDIO                              │
│  ┌─────────────────────────┐ ┌─────────────────────┐ ┌────────────────────┐  │
│  │ LEFT PANE               │ │ CENTER A4 CANVAS    │ │ RIGHT INSPECTOR    │  │
│  │ • Preset Bar:           │ │ • Multi-Brand Theme │ │ • Clean Collapsible│  │
│  │   [Update Preset (Btn2)]│ │   Engine (Font,     │ │   Control Groups   │  │
│  │ • Structure & Theme:    │ │   Top Bar, Table &  │ │ • Signature Block: │  │
│  │   - Font Family         │ │   Block Header Style│ │   - Block/Text Align│ │
│  │   - Top Accent Bar      │ │ • Unified Header    │ │   - Stamp Placement│  │
│  │   - Table/Block Headers │ │ • Enhanced Signatory│ │   - Line & Spacing │  │
│  │   - Sister Brand Override│ │   Block Renderer   │ │   - Phone/Email/   │  │
│  │ • Deal Data & Content   │ │                     │ │     Custom Lines   │  │
│  └─────────────────────────┘ └──────────┬──────────┘ └────────────────────┘  │
│                                         ▼                                    │
│                         [ Save Quotation (Button 3) ]                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Extensions

1. **Multi-Brand Visual Identity Fields (on Preset, Quotation, and Header/Footer Configs)**:
   - `documentFontFamily`: `'sans' | 'serif' | 'technical'` (maps to distinct font stacks across the A4 canvas).
   - `topAccentBarStyle`: `'thick' | 'double' | 'side_accent' | 'none'`.
   - `tableHeaderStyle`: `'solid' | 'tinted' | 'underline' | 'minimal'`.
   - `blockHeaderStyle`: `'solid' | 'tinted' | 'underline' | 'minimal'`.
   - Per-Preset Sister Brand Overrides (stored in `header_config` / `footer_config` / `QuotationPreset`):
     - `companyNameOverride?: string`
     - `logoUrl?: string`
     - `companySealUrl?: string`

2. **Enhanced Signature & Authorization Configuration (`QuotationFooterConfig`)**:
   - `signatoryBlockAlign`: `'left' | 'center' | 'right' | 'space_between'` (controls horizontal distribution of the stamp and signatory columns inside the block).
   - `signatoryTextAlign`: `'left' | 'center' | 'right'` (controls text alignment of the signatory name, title, contact details, and signature line).
   - `stampPlacement`: `'left' | 'center' | 'right' | 'overlay'` (positions the stamp box relative to the signatory columns or overlays it directly).
   - `signatureVerticalSpacing`: `'compact' | 'standard' | 'spacious'`.
   - `signatureLineWidth`: `'narrow' | 'standard' | 'wide' | 'none'`.
   - `showForAndOnBehalf`: `boolean` (renders `"For and on behalf of [Company Name]"` above the signature area).
   - `showDateSignedLine`: `boolean` (renders `"Date: ____________________"` under the signatory).
   - `showSignatoryPhone`: `boolean` & `signatoryPhone?: string` (plus secondary signatory phone).
   - `showSignatoryEmail`: `boolean` & `signatoryEmail?: string` (plus secondary signatory email).
   - `signatoryCustomLines`: `Array<{ id: string; label: string; value: string; target?: 'primary' | 'secondary' | 'both' }>` (custom lines such as Department, License #, Employee ID).

### Interactive Component & State Mapping

- **Settings > Documents Cleanup & Unified Bank Cards**:
  - Remove Sub-section 1C (`Default Header Logo Style`) and Sub-section 1D (`Executive Theme Swatches & Default Document Presentation`) from `WorkspaceDocumentProfileSettings`.
  - Simplify section headings to concise plain English: `1. Company Details`, `2. Bank Accounts`, `3. Quotation Presets`, and `4. Live Quotation Preview`.
  - Re-render each Bank Account card using the exact card header, action bar (`Set Default`, `Edit`, `Delete`), and `border-t` horizontal `flex justify-between` key-value rows (`Beneficiary`, `Account Number`, `IBAN`, `SWIFT / BIC`, `Branch`) used by Preset cards.
  - Keep a single primary **`Save Company Info`** button in the Settings header bar; remove the duplicate `"Save Changes to Profile & Preset"` button from the Settings preview bar (leaving `"Open in Quotation Studio"` to edit presets).
- **3-Save Action Wiring in Quotation Studio**:
  - **Preset Bar**: Displays **`Update Preset`** (updates the currently selected preset or creates/updates the default preset with all current theme, font, header, block, and signature settings) alongside **`+ Save as New Preset`**.
  - **Bottom Bar**: Displays **`Save Quotation`** when editing a real customer quotation; in Settings Sandbox mode, displays **`Update Active Preset & Close`** so the purpose of every button is unambiguous.
- **Signatory Block Renderer & Inspector**:
  - Update `renderSignatoryBlock` in `QuotationDocument` to apply `signatoryBlockAlign`, `signatoryTextAlign`, `stampPlacement`, `signatureVerticalSpacing`, `signatureLineWidth`, `"For and on behalf of"` company prefix, phone/email rows, custom signatory lines, and `"Date Signed"` line while keeping stamp/signature images `position: absolute` so changing their size never expands the block height.
  - Add a one-click **`Auto-Fill from Deal Owner`** handler in the Signatory Inspector that populates the signatory name, phone, and email from the assigned salesperson or active user profile.
