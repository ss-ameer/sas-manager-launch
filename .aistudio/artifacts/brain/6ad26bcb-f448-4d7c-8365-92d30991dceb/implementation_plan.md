# Executive Presentation-Readiness & End-to-End Workflow Polish Plan

## 1. Seamless End-to-End Procurement Pipeline (`PO -> GRN -> BILL -> PV`)
**Target Files:** `src/components/ProcurementPayablesHub.tsx`, `src/services/inventoryService.ts`

- **Fix `Pending Stock Receipts (0)` & `PENDING GRN LINES` Empty State Trap:**
  - Normalize ordered quantity resolution across all PO line items (`Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0`) so POs created in the quick modal or edited and saved inside `QuotationStudioModal` always report accurate ordered and remaining unreceived quantities.
  - Include all active, non-cancelled Supplier POs (`draft`, `sent`, `approved`, `issued`, `partially_received`) that have remaining unreceived line quantities (`ordered > received`) inside both the `PENDING GRN LINES` KPI counter and the `Pending Stock Receipts` tab.
  - Support receiving GRN quantities for **all** PO line items (both catalog-linked items with `product_id` and custom/manual PO items). Catalog-linked items will update warehouse stock and landed cost in `inventoryService.processPoBatchGrn`, while custom items will update `qty_received` on the PO line items and create a traceable receipt record.
  - When confirming `Receive Stock (GRN)` on a `Draft` PO, automatically promote its commercial status to `Approved` / `Issued` along with updating `receiving_status` to `Partially Received` or `Fully Received`.
- **Both `Save PO` & `Save & Open in Studio` Actions:**
  - In the `Create Outbound Supplier Purchase Order (PO)` modal, provide both **`Save PO`** (persists immediately to `QuotationRepository` and updates the hub tables) and **`Save & Open in Studio`** (persists immediately to `QuotationRepository` and launches `QuotationStudioModal` with the saved PO).
- **1-Click Progressive Workflow Actions on Every Table Row:**
  - **Supplier POs Tab (`ACTION` column):**
    - `[ Receive GRN ]` (visible whenever unreceived quantity > 0; opens the GRN modal pre-loaded with that PO).
    - `[ Record Bill ]` (opens the Record Supplier Bill & 3-Way Match modal pre-linked to that PO and Vendor with all PO/GRN lines populated).
    - `[ Open in Studio ]` (opens the PO in `QuotationStudioModal`).
  - **Supplier Bills & 3-Way Match Tab (`ACTION` column):**
    - `[ Approve Bill ]` (one-click status promotion when bill is `draft` or `under_review`).
    - `[ Pay Bill (PV) ]` (opens the Guided Payment Voucher modal pre-populated with that Bill's Vendor, linked Bill allocation, and remaining unpaid balance).
    - `[ View / Print Bill Summary ]` (opens a printable **3-Way Match Bill Summary & Voucher Sheet** modal displaying Vendor metadata, Linked PO & GRN status, line-by-line PO vs. GRN vs. Billed comparison table, Tax/Freight/Landed Cost breakdown, Payment/Debit Note deductions, embedded Vendor Invoice PDF preview/download link, and a `Print Summary` button).

---

## 2. Single-Drawer Exclusivity in A4 Studio (Prevent Canvas Squeeze)
**Target File:** `src/components/quotations/QuotationStudioModal.tsx`

- **Enforce Single Open Drawer Across All Sections:**
  - Coordinate `isLeftDrawerOpen` (Left Controls Drawer) and `selectedSection` (Right Block Inspector Drawer) so only one drawer is ever open at a time, preserving generous horizontal breathing room for the centered A4 live preview across all screen sizes.
  - When a user clicks any metadata card on the A4 preview (`Vendor/Client`, `PO/PV/MRN/DN/DO/REC Metadata`, `Settlement Schedule`, `Bank Details`, `Sign-off Block`), open the Left Controls Drawer (`isLeftDrawerOpen = true`), switch `leftTab` to `'content'` (`Deal Data & Content`), clear `selectedSection` (`null`), and scroll smoothly to the corresponding form card with a visual focus ring.
  - When a user opens a Right Block Inspector (`selectedSection !== null`), automatically collapse the Left Controls Drawer (`isLeftDrawerOpen = false`). Conversely, clicking `Show Controls` in the top bar automatically closes `selectedSection`.

---

## 3. Automatic Self-Healing Sanitizer for Saved Drafts
**Target File:** `src/services/repositories/QuotationRepository.ts`

- **Self-Heal Legacy Records on Load (`docToQuotation` / `saveQuotation`):**
  - **Strip Dummy Fallback Line Items on Payment Vouchers:** When `document_type === 'payment_voucher'`, automatically filter out any legacy default `'Commercial Grade Equipment Unit'` (`MOD-100-PRO`) fallback line item if settlement allocations or `amount_paid` exist.
  - **Normalize Chained Reference Prefixes:** Automatically sanitize any double/chained document number prefixes (e.g., `PO-PV-...`, `REC-PV-...`, `MRN-PV-...`, `DN-PO-...`) so the reference cleanly matches the document's active prefix (`PO-`, `PV-`, `MRN-`, `DN-`, `DO-`, `REC-`, `QT-`).
  - **Synchronize Document Totals:** Ensure `grand_total`, `financial_totals.grand_total`, and `payment_voucher_metadata.amount_paid` stay deterministically synchronized on read and write so no table row ever displays `AED 0.00` for a funded voucher or PO.

---

## 4. Upgraded Procurement Flows & Margin Summary in Enquiries & Projects
**Target Files:** `src/components/EnquiryDetail.tsx`, `src/components/ProjectRegistry.tsx`

- **Enquiry -> Supplier PO Creation (`EnquiryDetail.tsx`):**
  - In the `+ Supplier PO` modal inside an Enquiry, ensure unit rates initialize strictly from item `cost_price` (falling back to catalog `cost_price`, never client selling price).
  - Provide both **`Save PO`** and **`Save & Open in Studio`** buttons, persisting the new Supplier PO via `QuotationRepository.saveQuotation` immediately so it appears in `Procurement & Payables` -> `Supplier POs` and `Pending Stock Receipts` right away.
- **Procurement & Margin Summary Bar (`EnquiryDetail.tsx` & `ProjectRegistry.tsx`):**
  - Display a clean **Procurement & Margin Summary** strip showing:
    - **Client Quoted / Order Value**
    - **Committed Supplier PO / Landed Bill Cost**
    - **Estimated Net Margin (AED & %)**
  - Ensure launching any commercial document from `EnquiryDetail.tsx` or `ProjectRegistry.tsx` passes the exact `editingQuotation` and `initialDocumentType` into `QuotationStudioModal`.

---

## 5. Vendor / Supplier 360° Payables & Bank Details in Companies Directory
**Target Files:** `src/components/CompanyModal.tsx`, `src/components/CreateCompanyModal.tsx`, `src/components/CompanyDetailView.tsx`

- **Editable Vendor Commercial & Beneficiary Bank Fields:**
  - Add dedicated fields in `CompanyModal.tsx` and `CreateCompanyModal.tsx` for:
    - **TRN / Tax Registration Number (`tax_registration_no`)**
    - **Default Payment Terms (`default_payment_terms`)**
    - **Beneficiary Bank Details (`vendor_bank_details`)**: `Bank Name`, `Account Holder Name`, `IBAN / Account No`, `SWIFT / BIC`, and `Currency`.
  - When a Vendor is selected in the **Payment Voucher** setup modal or **Supplier PO** modal, automatically pre-fill their saved TRN, Payment Terms, and Beneficiary Bank Details onto the document.

---

## 6. Final Visual & Runtime Smoke Verification
**Target Files:** Global layout & views

- Verify `<PageHeader>` spacing and top margin alignment above KPI cards across all modules (`ProcurementPayablesHub`, `EnquiryList`, `ProjectRegistry`, `CompanyDirectory`, `ProductCatalog`).
- Run `compile_applet` to confirm zero TypeScript or bundler errors.
