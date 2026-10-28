# Implementation Plan: Enquiries & Quotes Module Overhaul

## 1. Architectural Overview & Goals
This plan modernizes, declutters, and connects the **Enquiries & Quotes** module (`EnquiryList.tsx`, `EnquiryDetail.tsx`, `EnquiryForm.tsx`, and `types.ts`) with the upgraded **Products Catalog**, **Custom Bucket Storage**, and **Quotation Studio**.

### Core Objectives
1. **Two-Tier Enquiry Detail Header & Navigation (`EnquiryDetail.tsx`)**: Eliminate title truncation (`"R.."`) by separating the full-width client title, subject, and window controls (Row 1) from a dedicated, well-proportioned action bar (`Quotation Studio`, `Log Activity`, `Clone Enquiry`, `Share`, `Edit`, `Delete`) on Row 2, paired with live badge counters on the tab bar (`Details`, `Line Items (N)`, `Revisions (N)`, `History`).
2. **Enquiry List KPI Summary Strip & High-Density Pipeline Table (`EnquiryList.tsx`)**: Add a 4-card top KPI summary strip (`Total Pipeline Value`, `Active / Pending Quotes`, `Won / Accepted Value & Win Rate`, `Follow-Up Action Required`) and enrich table rows with quick-glance indicators (line item count, attachment count, gross margin indicator, and formal quotation revision status).
3. **Interactive Line Items, Cost/Margin Analytics & Inline Editing (`EnquiryForm.tsx` & `EnquiryDetail.tsx`)**: Surface `cost_price` and live **Gross Margin %** per line item and at the deal level (role-aware so basic viewers don't see confidential cost data), display product thumbnails and live stock availability (`Avail: X`, `Low Stock`, `Order / Non-Stock`) on every line item card, and empower users to **inline-edit quantities, selling prices, cost prices, reorder rows, or quick-add catalog products directly inside the Enquiry Detail `Line Items` tab**.
4. **Quotation & Revision (`R1 -> R2`) Sync Prompt & Unified Revisions Tab (`EnquiryDetail.tsx`)**: When line items are edited on an Enquiry that already has Formal Quotations, present an interactive sync banner/prompt allowing the user to **1-click sync changes into an active `Draft` quotation** or **fork a new Quotation Revision (`R2`, `R3`)** with the updated items. Upgrade the `Revisions` tab to show both **Formal Quotations (`QT-...-R1`, `R2`)** with status selectors, PDF preview/print, and Studio launch alongside **Cloned Enquiry Revisions**.
5. **Unified Custom Bucket RFQ Attachments & Quotation Annex Toggles (`EnquiryDetail.tsx` & `EnquiryForm.tsx`)**: Replace legacy Supabase-only attachment checks in `EnquiryDetail.tsx` with our unified `uploadWorkspaceMediaAsset` Custom Bucket service, add drag-and-drop file upload directly inside `EnquiryDetail`, and provide a per-attachment **`Include in Quote Annex`** toggle so client RFQ drawings/specs flow automatically into Quotation Studio.
6. **Multi-Tenant SaaS Standardization & Zero-Null Controlled Inputs**: Ensure all `<input>`, `<textarea>`, and `<select>` elements across `EnquiryDetail.tsx`, `EnquiryList.tsx`, `EnquiryForm.tsx`, and `ProductManager.tsx` coalesce nullable values with `?? ''`, and replace industry-specific hardcoded placeholders with clean, multi-tenant commercial phrasing.

---

## 2. Detailed Implementation By Pillar

### Pillar 1: Enquiry Detail Two-Tier Header, Split-Pane Layout & Tab Polish (`src/components/EnquiryDetail.tsx`)
- **Row 1 (Identity & Window Controls)**:
  - Left side (`min-w-0 flex-1`): `#SN` badge, full Client / Company Display Name (`text-lg sm:text-xl font-bold text-slate-900 truncate` with full horizontal breathing room), Company quick-badges (`GoogleSearchButton`, `TemperatureBadge`, `IndustryBadge`), Customer Ref badge, and full Subject line below.
  - Far right (`shrink-0`): Drawer width toggle (`Expand / Compress`) and `Close (X)` button.
- **Row 2 (Primary & Secondary Action Toolbar)**:
  - Left group (Primary Workflow Actions):
    - `Quotation Studio` / `Create Quotation` (primary indigo CTA with active revision badge e.g. `R1 • Sent`).
    - `Log Activity` (blue CTA).
    - `+ Add / Edit Items` quick-jump button to the interactive `Line Items` tab.
  - Right group (Record Actions):
    - `Clone Enquiry`, `Share (N)`, `Edit Enquiry`, and `Delete` (with clear labels on desktop and clean icon+label responsive sizing).
- **Tab Bar Enhancements**:
  - Display live counts on tabs: `Details`, `Line Items (${lineItems.length})`, `Revisions (${quotations.length + (revisionChain.length > 1 ? revisionChain.length : 0)})`, and `History (${recordLogs.length})`.

### Pillar 2: Enquiry List KPI Strip & Pipeline Table UX (`src/components/EnquiryList.tsx`)
- **Top 4-Card KPI Summary Strip**:
  - Rendered above the filter bar using tabular numerals (`font-mono tabular-nums`) and single-elevation borders:
    1. **Active Pipeline Value**: Sum of active/pending enquiries + count of active deals.
    2. **Pending Formal Quotes**: Count and total value of `Draft` / `Sent` quotations awaiting client decision.
    3. **Won / Converted Deals**: Total won value and conversion win-rate percentage.
    4. **Follow-Up Attention**: Count of overdue or due-today follow-ups (clickable to toggle the `Overdue` urgency filter).
- **Table Row Quick-Glance Indicators (`EnquiryTableRow`)**:
  - Under the Company / Subject cell or Quote Ref cell, display clean unboxed metadata indicators with `·` separators:
    - Line items count (e.g. `6 items`), attachment count (`2 files`), and—for authorized Admin/Owner/Full-tier users—live deal **Gross Margin %** (`Margin: 28.4%`) when cost prices are present.
    - Formal Quotation badge showing the latest revision number (`R1`, `R2`), status (`Draft`, `Sent`, `Approved`), and 1-click preview trigger.

### Pillar 3: Interactive Line Items Builder, Catalog Integration & Gross Margin (`src/types.ts`, `src/components/EnquiryForm.tsx`, `src/components/EnquiryDetail.tsx`)
- **Data Model (`src/types.ts`)**:
  - Add optional `cost_price?: number` to `EnquiryLineItem` (propagated automatically from `Product.cost_price_aed` when picking or linking a catalog product, converted by currency rate if `USD`).
  - Add optional `include_in_quote_annex?: boolean` to `Attachment` so Enquiry RFQ attachments can be flagged for Quotation Studio annexes.
- **Enquiry Form Line Items (`src/components/EnquiryForm.tsx`)**:
  - Add `Unit Cost` input alongside `Qty`, `Unit`, and `Unit Selling Price`, with an automatic live **Line Margin %** indicator (`((Selling - Cost) / Selling) * 100`) and color-coded health text (emerald $\ge 25\%$, amber $10\text{–}24\%$, rose $< 10\%$).
  - Display a **Deal Profitability Summary** bar in the Line Items footer showing `Total Cost`, `Total Selling Value`, `Net Profit`, and `Overall Gross Margin %`.
  - In the Catalog Picker Modal, display `Cost Price` and estimated `Margin %` alongside `Selling Price`, `SKU`, `Brand / Make`, `Model / Part No.`, product thumbnail, and live warehouse stock badge.
- **Interactive Line Items Tab in Enquiry Detail (`src/components/EnquiryDetail.tsx`)**:
  - Add an **`Inline Edit / Manage Items`** mode directly inside the `Line Items` tab of `EnquiryDetail`:
    - **Product Thumbnail & Stock Badge**: Every line item card displays its product thumbnail (or fallback icon), `Brand / Make`, `Model / Part No.`, `Origin`, `Datasheet` badge, and live warehouse stock badge (`Avail: X`, `Low Stock`, or `Order / Non-Stock`).
    - **Inline Quick-Edit Controls**: Users with edit permission can directly adjust `Qty`, `Unit Selling Price`, `Unit Cost`, `Lead Time`, `Option Designation`, and `Include Datasheet in Quote` or **Reorder lines (`Move Up` / `Move Down`)** and **Remove lines** without leaving the drawer.
    - **Quick-Add from Catalog / Custom Row**: Add `+ Add from Catalog` and `+ Add Custom Item` buttons directly in the `Line Items` tab header so reps can build or adjust the bill of materials on the fly and save with 1 click.
    - **Deal Gross Margin Summary Strip**: Show `Total Selling`, `Total Cost`, `Gross Profit`, and `Gross Margin %` at the top of the `Line Items` tab (respecting role visibility).

### Pillar 4: Quotation & Revision (`R1 -> R2`) Lifecycle & Data Sync (`src/components/EnquiryDetail.tsx`)
- **Post-Line-Item Edit Quotation Sync Prompt**:
  - Whenever line items are saved inline in `EnquiryDetail` (or when Enquiry items differ from the latest Quotation), if the Enquiry has existing Formal Quotations:
    - Show a prominent **Quotation Sync Banner** with two 1-click actions:
      1. **Update Active Draft (`QT-...-R1`)**: If the latest quotation is still in `Draft`, sync the updated Enquiry line items and recalculated totals directly into that Draft quotation.
      2. **Create New Revision (`R2` / `R(N+1)`)**: If the latest quotation was already `Sent` or `Approved`, or if the user wants a separate revision, clone the latest quotation into `R(N+1)` with the updated Enquiry line items and open it in Quotation Studio.
- **Unified `Revisions` Tab (`src/components/EnquiryDetail.tsx`)**:
  - Upgrade the `Revisions` tab so it serves as the complete **Commercial Revisions Hub**:
    - **Section A — Formal Quotations (`R1`, `R2`, ...)**: Rich cards for every formal quotation showing revision badge (`R1`, `R2`), formatted quote reference, issue date, validity date, line item count, total amount, document preset name, interactive status actions (`Edit in Studio`, `Accept / Won`, `Decline`, `Fork as R(N+1)`, `Preview`, `Print PDF`), and a diff indicator if Enquiry line items were modified after the quote was issued.
    - **Section B — Linked Enquiry Sheet Revisions**: The chronological Enquiry revision chain (`Original`, `Rev 1`, `Rev 2`) with `+ Clone Enquiry Revision` button.

### Pillar 5: Unified Custom Bucket RFQ Attachments & Quotation Annex Integration (`src/components/EnquiryDetail.tsx`, `src/components/quotations/QuotationStudioModal.tsx`)
- **Direct Drag-and-Drop Upload in `EnquiryDetail.tsx`**:
  - Add an `+ Upload RFQ / Attachment` dropzone and button directly in the `Source Proposal Attachments` section of `EnquiryDetail` so users can attach client RFQs, BOQs, or drawings without opening the full edit form.
  - Route uploads and the `Upload to Cloud` promotion button through `uploadWorkspaceMediaAsset` (`src/services/customBucketStorage.ts`), supporting both the Custom Bucket endpoint and Supabase Storage with clean local fallback.
- **Per-Attachment `Include in Quote Annex` Toggle**:
  - Add an interactive checkbox/toggle (`Include in Quote Annex`) on each attachment card in `EnquiryDetail` and `EnquiryForm`.
  - When opening **Quotation Studio** (`QuotationStudioModal.tsx`), automatically include any Enquiry attachment marked `include_in_quote_annex: true` (alongside line-item product datasheets) in the Quotation's Technical Annexes list.

### Pillar 6: Multi-Tenant SaaS Polish & Zero-Null Controlled Inputs
- **Controlled Input Safety Sweep**:
  - Audit all `<input>`, `<textarea>`, and `<select>` controls across `EnquiryDetail.tsx`, `EnquiryList.tsx`, `EnquiryForm.tsx`, and `ProductManager.tsx` to guarantee every `value` prop uses `?? ''` (never `null`).
- **Neutral Commercial Placeholders**:
  - Replace overly narrow water-treatment-only placeholder hints in line item descriptions and search bars with versatile commercial & engineering examples suitable for any B2B trading, industrial, or project-based tenant.

---

## 3. Verification Plan
1. Run `compile_applet` and `lint_applet` to verify zero TypeScript or React controlled-input warnings.
2. Verify the new Two-Tier Header in `EnquiryDetail` across standard desktop and split-pane widths to confirm client names and subjects never truncate to 1–2 characters.
3. Test inline line-item editing, catalog quick-add, cost/margin calculation, and the Quotation `Draft` / `R2` sync workflow in `EnquiryDetail`.
4. Test direct attachment upload to the Custom Bucket and the `Include in Quote Annex` toggle carrying over into Quotation Studio.
