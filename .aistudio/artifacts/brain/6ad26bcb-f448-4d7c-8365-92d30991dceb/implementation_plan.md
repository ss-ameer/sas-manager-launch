# Standardized Block Customization & Unified Right Inspector Architecture

This plan eliminates the visual and functional disconnect across the Quotation Studio by standardizing how **Bank Remittance**, **Commercial Terms**, **Customer Acceptance**, **Financial Totals**, and **Signatures & Stamp** are rendered on the A4 document and customized in the Right Inspector.

## User Review & Critical Decisions

> [!IMPORTANT]
> All four architectural decisions below reflect your confirmed preferences from our clarification step and will be persisted in both **Quotation Presets** and individual **Quotations**.

- **Confirmed Decision 1 — Standardized Right Inspector Controls Across All Blocks**: Every bottom document block will share a unified customization structure:
  1. **Custom Section Heading & Header Banner Override** (edit section title, optional subtitle, icon toggle, and per-block header style: `Inherit Global`, `Underline`, `Tinted`, `Solid`, `Minimal`, or `Hidden`).
  2. **Field Layout Mode** (`Split Left/Right` key-value rows, `Inline` label-value rows, or `2-Column Grid`).
  3. **Row Dividers & Text Alignment** (toggle horizontal hairlines between rows and align values `Left` or `Right`).
  4. **Direct Row Toggles, Reordering, Inline Editing & Custom Rows** right inside the Right Inspector—no jumping back and forth to the Left Tab to edit content.
- **Confirmed Decision 2 — Bank Remittance Block Upgrade**:
  - Defaults to the **Split Left/Right** key-value layout (`Bank:` on the left, value right-aligned) so it visually matches **Commercial Terms & Conditions** out of the box, with one-click switching to `Inline` or `2-Column Grid`.
  - Individual visibility toggles, custom labels, and direct inline editing for `Bank Name`, `Beneficiary`, `Account No`, `IBAN`, `SWIFT / BIC`, `Branch`, and `Currency`, plus `+ Add Custom Bank Row` and a custom **Remittance Note** line.
- **Confirmed Decision 3 — Commercial Terms & Customer Acceptance Inspector Upgrades**:
  - **Commercial Terms**: Direct inspector editing and visibility toggles for `Price Basis`, `Payment Terms`, `Validity`, and `Clauses / Notes`, plus `+ Add Custom Term Row` (e.g., `Warranty`, `Delivery Lead Time`, `Origin`) and row reordering.
  - **Customer Acceptance**: Direct inspector editing for the heading, right-hand subtitle (`"Sign & Return Copy with Purchase Order"`), and legal acceptance statement, plus layout mode selector (`4-Column Row`, `2x2 Grid`, `Compact`) and toggleable/customizable signature slots (`Authorized Signature`, `Signatory Name`, `Title / Designation`, `PO Number`, `Date`, `Company Stamp`).
- **Confirmed Decision 4 — Signatory Details & Formatting in the Inspector**:
  - Edit `Single vs Dual Signatory` mode and **Primary / Secondary Signatory Name & Title** directly inside the `Signatures & Stamp` Right Inspector.
  - Choose how signatory contact details render (`Icon + Text`, `Label: Value`, or `Plain Text`), reorder or toggle detail lines (`Name`, `Title`, `Phone`, `Email`, `Custom Lines`), and set per-line font weight and color emphasis (`Bold`, `Regular`, `Muted`, `Brand Accent`).

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Quotation Studio Right Inspector from a collection of sparse, inconsistent controls into a standardized, self-contained block editor where every section of the quotation can be styled, formatted, reordered, and edited in one place.
- **Target Audience / Persona**: Multi-brand commercial teams, sales engineers, and operations managers who need complete control over how quotations look across different sister companies, tenders, and client formats.
- **Key Value**:
  - **Visual Harmony on the A4 Sheet**: Paired blocks like *Commercial Terms* and *Bank Remittance* share the same split key-value geometry, header styling, row dividers, and typography.
  - **Zero Context-Switching**: Clicking any block on the A4 preview opens its complete styling and content controls in the Right Inspector—eliminating dead-end buttons that force you to switch tabs.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Matching Commercial Terms & Bank Remittance**: Clicking the **Bank Remittance** card on the A4 preview opens the Right Inspector. By default, Bank Remittance now uses the **Split Left/Right** layout matching Commercial Terms. The user can toggle individual bank fields (`IBAN`, `SWIFT`, `Branch`), switch to a `2-Column Grid`, edit wire details inline, or add a custom row like `Correspondent Bank` without leaving the inspector.
  2. **Customizing Commercial Terms**: Clicking **Commercial Terms** opens the Right Inspector with direct inputs for `Price Basis`, `Payment Terms`, `Validity`, and `Clauses`, toggles for each row, a `+ Add Custom Row` button (for `Warranty`, `Delivery`, `Packing`), and layout/divider switches.
  3. **Customizing Customer Acceptance**: Clicking **Customer Acceptance** lets the user edit the acceptance statement, choose `4-Column Row` or `2x2 Grid`, and toggle fields like `PO Number`, `Designation`, `Company Stamp`, and `Date`.
  4. **Editing & Formatting Signatories**: Clicking **Signatures & Stamp** allows editing the Primary/Secondary Signatory Name and Title directly in the inspector, switching contact display between `Icon + Text`, `Label: Value`, or `Plain Text`, reordering detail lines, and setting font weight/color per line.
- **Visual Identity & Theme**:
  - Clean, collapsible inspector sections with consistent `11px` uppercase section headers, compact segmented controls, and tabular monospace numerals (`tabular-nums`) for numbers and account codes.
  - Live 1:1 visual parity on the A4 canvas as controls are toggled.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Standardized Per-Block Configuration Schema (`QuotationBlockConfig`)**:
  - *Chosen Approach*: Extend the block configuration model so every block supports a standardized set of presentation and content properties (`titleOverride`, `subtitleOverride`, `showHeaderIcon`, `headerStyleOverride`, `fieldLayoutMode`, `showRowDividers`, `valueAlign`, `customRows`, and field visibility/order maps).
  - *Why*: Ensures any block can be styled identically or distinctly and saved cleanly inside any **Quotation Preset** or **Quotation**.
- **Decision 2 — Direct Content Editing in the Right Inspector**:
  - *Chosen Approach*: Embed the field editors for Commercial Terms, Bank Remittance, Customer Acceptance, and Signatory Names/Titles directly inside their respective Right Inspector panels while keeping them 100% synchronized with the quotation state.
  - *Why*: Removes the friction of clicking *"Edit in Deal Data"* and hunting through a separate drawer just to change a signatory's title, a bank IBAN, or a payment term.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Quotation Studio State Engine                       │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │   layoutBlocks[]     │  │    footerConfig      │  │ Quotation Data   │  │
│  │ (Per-Block Styling,  │  │ (Signatory Details,  │  │ (Terms, Bank,    │  │
│  │  Field Layout Mode,  │  │  Line Order, Format, │  │  Signatories,    │  │
│  │  Custom Rows, Header)│  │  Acceptance Config)  │  │  Totals)         │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└─────────────┼─────────────────────────┼───────────────────────┼────────────┘
              │                         │                       │
              ▼                         ▼                       ▼
┌────────────────────────────────────┐   ┌───────────────────────────────────┐
│   Standardized Right Inspector     │   │      A4 QuotationDocument         │
│ ┌────────────────────────────────┐ │   │ ┌───────────────────────────────┐ │
│ │ 1. Frame, Width & Padding      │ │   │ │ Unified Block Header Renderer │ │
│ │ 2. Section Heading & Banner    │ │   │ ├───────────────────────────────┤ │
│ │ 3. Field Layout & Row Dividers │◄┼───┼─┤ Standardized Field Layout     │ │
│ │ 4. Direct Field Editor,        │ │   │ │ (Split | Inline | 2-Col Grid) │ │
│ │    Toggles, Order & Custom Rows│ │   │ ├───────────────────────────────┤ │
│ └────────────────────────────────┘ │   │ │ Custom Rows & Signatory Lines │ │
└────────────────────────────────────┘   └─┴───────────────────────────────┴─┘
```

### Data Model & State Extensions

1. **Standardized Block Presentation & Content Options (`QuotationBlockConfig`)**:
   - `titleOverride?: string` & `subtitleOverride?: string`
   - `showHeaderIcon?: boolean`
   - `headerStyleOverride?: 'inherit' | 'solid' | 'tinted' | 'underline' | 'minimal' | 'none'`
   - `fieldLayoutMode?: 'split' | 'inline' | 'grid_2col'` (defaults to `'split'` for both Commercial Terms and Bank Remittance so they match seamlessly)
   - `showRowDividers?: boolean`
   - `valueAlign?: 'left' | 'right'`
   - `visibleFields?: Record<string, boolean>`
   - `fieldLabels?: Record<string, string>`
   - `fieldOrder?: string[]`
   - `customRows?: Array<{ id: string; label: string; value: string; enabled?: boolean }>`
   - `customNote?: string` (for custom remittance instructions or block footnotes)
   - `acceptanceLayout?: 'row_4col' | 'grid_2x2' | 'compact'`
   - `acceptanceStatementOverride?: string`
2. **Signatory Detail Formatting & Line Ordering (`QuotationFooterConfig`)**:
   - `signatoryContactFormat?: 'icon' | 'label' | 'plain'`
   - `signatoryLineOrder?: Array<'name' | 'title' | 'phone' | 'email' | 'custom' | 'date'>`
   - `signatoryLineStyles?: Record<string, { weight?: 'normal' | 'medium' | 'bold'; color?: 'default' | 'muted' | 'accent' }>`
   - `visibleSignatoryLines?: Record<string, boolean>`

### Interactive Component & State Mapping

- **Bank Remittance Inspector & Renderer**:
  - Switches between `Split Left/Right` (default), `Inline`, and `2-Column Grid`.
  - Toggles and inline label/value editors for `Bank Name`, `Beneficiary`, `Account No`, `IBAN`, `SWIFT / BIC`, `Branch`, and `Currency`, plus `+ Add Custom Row` and `Remittance Note`.
- **Commercial Terms Inspector & Renderer**:
  - Direct editors and toggles for `Price Basis`, `Payment Terms`, `Validity`, and `Clauses / Notes`, plus `+ Add Custom Row`, row reordering, and layout mode (`Split`, `Inline`, `2-Column Grid`).
- **Customer Acceptance Inspector & Renderer**:
  - Direct editors for section title, right subtitle, and acceptance statement text.
  - Layout selector (`4-Column Row`, `2x2 Grid`, `Compact`) and toggles/custom labels for `Authorized Signature`, `Signatory Name`, `Title / Designation`, `PO Number`, `Date`, and `Company Stamp`.
- **Signatories & Stamp Inspector & Renderer**:
  - Direct `Single / Dual Signatory` switcher and `Primary / Secondary Name & Title` inputs right inside the inspector.
  - Contact format switcher (`Icon + Text`, `Label: Value`, `Plain Text`), line visibility toggles, up/down line reordering, and per-line font weight/color controls.
