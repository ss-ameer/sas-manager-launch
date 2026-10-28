# Implementation Plan: End-to-End Enquiry ↔ Catalog ↔ Quotation Synchronization & Deep-Codebase Overhaul

## 1. Architectural & Functional Overview

This plan addresses the **6 core UI/workflow upgrades** alongside the **6 hidden data-integrity and state-synchronization issues** uncovered during our deep-codebase audit across `EnquiryList.tsx`, `EnquiryDetail.tsx`, `EnquiryForm.tsx`, `QuotationStudioModal.tsx`, `ProductManager.tsx`, `EnquiryRepository.ts`, and `types.ts`.

---

## 2. Pillar-by-Pillar Implementation Specification

### Pillar 1: Two-Way Catalog Sync ("Save Line Item to Catalog" & "Sync to Catalog")
- **Reusable `SaveToCatalogModal.tsx` Component (`/src/components/SaveToCatalogModal.tsx`):**
  - Triggered from any unlinked line item (`!item.product_id`) via a `[ + Save to Catalog ]` button in `EnquiryDetail.tsx` (`Line Items` tab), `EnquiryForm.tsx` (Line Items builder), and `QuotationStudioModal.tsx` (Items Inspector).
  - **Smart Pre-Fill Logic:**
    - Automatically populates `Name / Title` from `item.item_name`; if `item_name` is blank, intelligently splits the leading title phrase from `item.description` (before the first ` - `, ` – `, `: `, or newline) and places the remainder into `Description`.
    - Pre-fills `Category` (with existing category selector + inline new category input), `SKU` (auto-generated from category/name prefix or editable), `Brand / Make`, `Model / Part #`, `Selling Price` (`unit_price`), `Unit Cost Price` (`cost_price`), `Unit (UOM)`, `Lead Time / Availability` (`lead_time_note`), `Country of Origin`, `HS Code`, `Technical Attributes / Specs` (`attributes`), `Product Image` (`image_url` with Custom Bucket upload), and `Technical Datasheet` (`datasheet_attachment` with Custom Bucket upload).
  - **Two-Way Persistence & Linking:**
    - Writes the new `Product` document to Firestore (`products` collection) and updates top-level `products` state via `onProductsChange` / `setProducts` callback so it is immediately available across the app without a reload.
    - Links the newly created `product.id` (plus `sku`, `image_url`, `datasheet_attachment`, `brand_make`, `model_part_no`) back onto the current line item in `EnquiryDetail`, `EnquiryForm`, or `QuotationStudioModal`.
- **1-Click `[ Sync to Catalog ]` for Modified Linked Items (`item.product_id` exists):**
  - Compares the line item's current commercial/technical fields (`unit_price`, `cost_price`, `unit`, `brand_make`, `model_part_no`, `country_of_origin`, `hs_code`, `lead_time_note`, `image_url`, `datasheet_attachment`, `attributes`) against the linked `Product` in `products`.
  - Whenever any field differs from the master catalog product, displays a subtle `[ Sync to Catalog ]` button on that line item card/row.
  - Clicking `[ Sync to Catalog ]` updates the master `Product` record in Firestore and local `products` state in 1 click and shows a confirmation toast.

---

### Pillar 2: Inline Line Items Editor & Legacy Title Handling (`EnquiryDetail.tsx` & `EnquiryForm.tsx`)
- **Legacy Blank Title Helper & Auto-Display:**
  - When rendering or editing a line item whose `item_name` is empty while `description` contains a combined heading + specification (e.g., `"SAND MEDIA FOR 30x72 - Media per Tank: Silica Fine Sand..."`), display the parsed title in read view and provide a 1-click `[ Split Title & Spec ]` button inside `Quick Edit` (plus a bulk `[ Clean Up Legacy Titles ]` action in the Line Items toolbar when legacy items are detected) that cleanly extracts the leading title into `item_name` and retains the detailed spec body in `description`.
  - Add the `Item Name / Heading` input field to `EnquiryForm.tsx` line item cards so `EnquiryForm` and `EnquiryDetail` have 100% field parity.
- **Full Field Parity in `EnquiryDetail.tsx` Inline Editor (`Line Items` tab):**
  - Expand the inline `Quick Edit` panel on each line item card to support editing all commercial, technical, and media fields:
    - **Commercial & Option:** `Item Name / Heading`, `Option Designation` (`Baseline / All`, `Option A`, `Option B`, `Optional / Add-On`), `Item Type` (`Standard` / `Custom`), `Quantity`, `Unit (UOM)`, `Selling Price`, `Unit Cost Price`, `Lead Time / Availability`.
    - **Technical Metadata:** `Brand / Make`, `Model / Part #`, `Country of Origin`, `HS Code`.
    - **Media & Datasheets:** Direct **Product Image** upload (via Custom Bucket `uploadCustomFile` with client-side compression or URL input) and **Technical Datasheet** upload/link with the `Include in Quote Annex` checkbox.
    - **Technical Specification Attributes:** Interactive Key/Value attribute pill editor (`+ Add Spec`, edit key/value, remove pill).

---

### Pillar 3: Unified & Modernized Catalog Picker (`EnquiryForm.tsx` & `EnquiryDetail.tsx`)
- **Clean Commercial Formatting:**
  - Replace legacy `"On Request"` and `"Unit: Custom Unit"` strings with clean tabular formatting: `AED 0.00 (Custom)` when `unit_price === 0` and clean UOM badges (`Unit: Nos`, `Unit: Set`, `Unit: Lot`, etc.).
- **Rich Product Cards in Both Pickers:**
  - Upgrade both the `Standard Component Catalog` modal in `EnquiryForm.tsx` and the inline `Quick Catalog Picker` drawer in `EnquiryDetail.tsx` so every catalog card displays:
    - Product Thumbnail image (with clean SVG fallback).
    - `SKU`, `Brand / Make`, and `Model / Part #`.
    - Up to 3 Technical Specification pills preview (`key: value`).
    - Selling Price, Cost Price, and Gross Margin % indicator.
    - Color-coded **Live Stock Badges** (`Available: X`, `Low Stock: X`, `Out of Stock: 0`, or `Order / Non-Stock`).
- **Category & Stock Filter Bar:**
  - Add interactive Category filter buttons and Stock Availability filter buttons (`All Items`, `In Stock`, `Low Stock`) inside both Catalog Pickers for rapid filtering.

---

### Pillar 4: `EnquiryForm.tsx` Modal Layout & On-the-Fly Company / Contact Creation
- **Sticky Top Quick-Jump Section Bar:**
  - Preserve the left-hand split-pane RFQ PDF/Image viewer and add a sticky top **Quick-Jump Section Bar** inside the right-hand form pane:
    - `1. Metadata & Client` | `2. Scope & Specs` | `3. Line Items (N)` | `4. Terms & Files`
  - Clicking any tab smoothly scrolls the form container to that section (`scrollIntoView({ behavior: 'smooth' })`) and highlights the active section.
- **On-the-Fly Company & Contact Registry Saving (Inline Buttons + Auto-Prompt on Submit):**
  - **Inline Quick-Save Buttons:**
    - When the user types a `Client / Company Name` that does not match an existing company in `companies`, render a prominent `[ + Save to Companies Registry ]` button directly beside the Company input that creates the `Company` record in Firestore and links `company_id` immediately.
    - Replace the hidden 3-dot contact menu with a clean combo input/selector for `Contact Person` (`Name`, `Phone`, `Email`) and a visible `[ + Save Contact ]` button whenever a new contact name/phone/email is entered for the selected company.
  - **Auto-Prompt on Submit:**
    - If the user clicks `Save Enquiry` while a new unlinked Company name or new Contact Person is typed in the fields, instead of blocking with a browser alert, present a clean confirmation modal offering to **Auto-Register Company & Contact and Save Enquiry** in a single step.

---

### Pillar 5: Subtotal vs. VAT Financial Clarity (`EnquiryDetail.tsx`)
- **Summary Cards on Both `Details` and `Line Items` Tabs:**
  - Update the financial summary strip in both tabs to clearly break down:
    - **Subtotal (Excl. VAT):** Sum of baseline/active option selling prices (`tabular-nums`).
    - **VAT (5%):** Calculated at 5% (or synced with the active quotation's `tax_mode` / `tax_rate` when a formal quote exists).
    - **Total Package (Incl. VAT):** Grand total in AED (with secondary USD equivalent when currency is USD).
    - **Profitability Strip:** `Total Cost (Excl. VAT)`, `Gross Profit (Excl. VAT)`, and `Gross Margin %` (computed strictly on Excl. VAT subtotal vs. cost so VAT never distorts margin math).

---

### Pillar 6: Null-Safe Controlled Inputs (`?? ''`)
- **Zero React Controlled/Uncontrolled Warnings:**
  - Audit and update all `<input>`, `<textarea>`, and `<select>` elements across `ProductManager.tsx`, `EnquiryForm.tsx`, `EnquiryDetail.tsx`, and `QuotationStudioModal.tsx` so every `value` prop uses nullish coalescing (`value={field ?? ''}`) and numeric inputs safely format `value={numField ?? ''}`.

---

### Pillar 7: Proactive Deep-Codebase Bug Fixes & Pipeline Hardening
1. **Multi-Option & Optional Add-On Math Fix (`EnquiryDetail.tsx` & `QuotationStudioModal.tsx`):**
   - In `EnquiryDetail.tsx`, compute baseline deal totals (`Subtotal`, `Cost`, `Gross Profit`, `Margin %`) using the active selected option filter (or `Baseline / All` + `Option A` when viewing `'all'`), excluding alternative options (`Option B`, `Option C`) and `'Optional / Add-On'` items from the baseline sum while showing an explicit `+ Optional / Alternatives` note when present.
   - When creating a formal quote or syncing line items to `QuotationStudioModal.tsx`, map `item.option === 'Optional / Add-On'` or alternative options (`Option B`, `Option C`) to `is_optional: true` and `option_group: item.option` on `QuotationLineItem`, ensuring `QuotationRepository.calculateTotals` excludes them from the mandatory baseline subtotal and marks them clearly as Optional in the quotation table.
2. **Inline State Reactivity Fix (`EnquiryDetail.tsx`):**
   - Update `optionAnalysis` and `filteredLineItems` in `EnquiryDetail.tsx` to read from `currentEnquiry.line_items` (local state) instead of the parent `enquiry.line_items` prop so inline edits, catalog quick-adds, and title splits reflect instantaneously.
   - Pass `setProducts` / `onProductsChange` into `EnquiryDetail.tsx` and `QuotationStudioModal.tsx` so two-way catalog sync updates global state immediately.
3. **AI Extraction & Smart Clipboard Catalog Auto-Linking (`EnquiryForm.tsx`):**
   - Update `applyExtractedData` and `parseInstantSmartTextData` to populate `item_name` (splitting leading title from description if needed), `brand_make`, `model_part_no`, `country_of_origin`, `lead_time_note`, and `cost_price`.
   - Automatically cross-reference extracted line items against `products` (by matching `sku`, `model_part_no`, or exact `name`) to auto-link `product_id`, `image_url`, `datasheet_attachment`, and `cost_price` when a catalog match is found.
4. **USD / AED Currency Normalization (`EnquiryList.tsx` & `EnquiryDetail.tsx`):**
   - Fix `EnquiryList.tsx` KPI pipeline summation so USD quotations (`quote.currency === 'USD'`) convert `grand_total * 3.6725` before adding to `activePipelineValueAed`.
   - Fix `handleAcceptQuotation` in `EnquiryDetail.tsx` so accepting a USD quotation converts `value_aed` properly (`grand_total * 3.6725`) while preserving `currency: 'USD'` and `exchange_rate: 3.6725`.
5. **Enquiry Cloning & Revision Chain Cleanup (`EnquiryDetail.tsx`):**
   - Update `handleCreateRevision` so cloned revision enquiries reset `status: 'Active'`, `stock_reserved: false`, `project_id: undefined`, `project_number: undefined`, `wonAt: undefined`, `lostAt: undefined`, and initialize a clean `statusHistory` entry.
   - Filter out soft-deleted enquiries (`!e.is_deleted`) from `revisionChain`.
6. **Consistent Stock Reservation on Status Change (`EnquiryList.tsx`):**
   - Wire `reserveEnquiryStock` and `releaseEnquiryStock` into `EnquiryList.tsx` (`handleStatusChange`) so changing an enquiry's status to/from `'Won / Approved'` or `'Order Received'` from the main table reserves/releases stock identically to `EnquiryDetail.tsx`.

---

## 3. Files to Create / Modify

1. `/src/components/SaveToCatalogModal.tsx` *(New)* — Pre-filled modal for saving custom line items to the Products Catalog and syncing modified linked items back to Firestore.
2. `/src/components/EnquiryDetail.tsx` — Two-way catalog sync buttons, expanded inline `Quick Edit` with full field parity + media uploads, legacy title parser, unified catalog picker filters, Subtotal/VAT/Total summary cards, multi-option math fix, and local state reactivity fixes.
3. `/src/components/EnquiryForm.tsx` — Sticky Quick-Jump section bar, inline `[ + Save to Companies Registry ]` and `[ + Save Contact ]` buttons + submit auto-prompt modal, `item_name` field + `[ + Save to Catalog ]` on line items, upgraded Catalog Picker modal, AI extraction catalog auto-matching, and null-safe inputs.
4. `/src/components/quotations/QuotationStudioModal.tsx` — `[ + Save to Catalog ]` and `[ Sync to Catalog ]` actions in the Line Items inspector, plus multi-option / `is_optional` mapping from Enquiry line items.
5. `/src/components/EnquiryList.tsx` — USD-to-AED conversion fix in KPI pipeline calculations and consistent stock reservation in `handleStatusChange`.
6. `/src/components/ProductManager.tsx` & `/src/App.tsx` — Null-safe controlled inputs check and passing `setProducts` to `EnquiryDetail` / `QuotationStudioModal`.
