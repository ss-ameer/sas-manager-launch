# Procurement, Payables & A4 Studio Reliability and UX Upgrade

Eliminate runtime console errors (`openCreatePvModal` and `QuotationRepository.listByWorkspace`), enable universal row click-to-open across all four Procurement tables, keep Save/Issue controls permanently visible in the A4 Studio header, add a live inline Line Items Editor inside the Studio's Deal Data & Content drawer, and refine creation modals for Supplier POs, Supplier Bills, Payment Vouchers, and Vendor Returns.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions have been confirmed and incorporated into this plan:

- **Confirmed Decision 1 — Supplier PO Row Click Behavior**: Clicking a row in the **Supplier POs** table opens a dedicated **Supplier PO Summary & GRN Status Viewer Modal** with quick actions (`Receive GRN`, `Record Bill`, `+ Payment Voucher`, `Return / DN`, and `Open in A4 Studio`), while row action buttons use `e.stopPropagation()`.
- **Confirmed Decision 2 — Mandatory Named Line Item on PO Creation**: Saving a new Outbound Supplier PO requires at least one named line item (`item_name` non-empty and `qty >= 1`), ensuring every created PO immediately populates **Pending Stock Receipts** and increments **PENDING GRN LINES**.
- **Confirmed Decision 3 — Legacy Zero-Value Test Vouchers**: Zero-value dummy test records (`AED 0.00` with generic `Vendor / Supplier` names) are automatically filtered out of the active **Payment Vouchers & Returns** table while providing a 1-click delete action on all rows.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a crash-free, responsive end-to-end procurement and commercial document workflow (`PO -> GRN -> 3-Way Match Bill -> PV / MRN / DN`) with interactive table rows, live modal financial calculators, and full inline line-item editing inside the A4 Document Studio.
- **Target Audience / Persona**: Procurement officers, warehouse storekeepers, finance controllers, and commercial executives conducting live operational reviews.
- **Key Value**: Eliminates runtime exceptions on bill payment and return creation, removes friction when inspecting or editing documents, and ensures every financial total and line item stays synchronized across modals, tables, and A4 printouts.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Universal Table Row Click-to-Open**:
     - **Supplier POs Tab**: Clicking any PO row opens the **Supplier PO Summary & Receiving Status Modal** displaying vendor details, linked enquiry, line-by-line ordered vs. received vs. pending quantities, and 1-click lifecycle actions.
     - **Pending Stock Receipts Tab**: Clicking any pending line row opens the **Receive Stock (GRN) & Landed Cost Modal** for that PO.
     - **Supplier Bills & 3-Way Match Tab**: Clicking any bill row opens the printable **3-Way Match Bill Summary & Voucher Sheet Modal** with embedded PDF/image scan preview and a streamlined action bar (`Approve`, `Pay Bill`, `Hold`, `Edit`, `Delete`).
     - **Payment Vouchers & Returns Tab**: Clicking any `PV`, `MRN`, or `DN` row launches that document directly in the **A4 Studio**.
  2. **A4 Studio Header & Inline Line Items Editor**:
     - Top header bar permanently displays `[ Save <Document> ]` and `[ Issue <Document> ]` regardless of whether the Left Controls Drawer or Right Inspector is open.
     - Opening **Deal Data & Content** shows the **Document Metadata Editor** and a new **Document Line Items Editor** (with Catalog Item selector, Description, Qty, UOM, Unit Rate, and Delete) at the top of the drawer, while the `Document Data & @ Fields` reference accordion starts collapsed by default.
     - Vendor documents (`debit_note`, `material_return_note`, `payment_voucher`) suppress client-only quotation blocks (`Commercial Terms & Conditions` and `* Taxes EXTRA to client account`) and display an interactive empty-table prompt (`"No line items added yet — click here to add items."`) that focuses the Line Items Editor.
  3. **Guided Modal Auto-Fill & Live Totals**:
     - **Create Outbound Supplier PO Modal**: Selecting a catalog item auto-fills description, part number, UOM, and unit cost (`cost_price` or `selling_price` fallback), shows column headers and per-line totals, displays a live **PO Total (AED)** bar, and validates that at least one named item is present before saving.
     - **Record Supplier Bill & 3-Way Match Modal**: Combines Vendor selection and legal name into a clean unified selector + editable input without redundant fields, fixes leading-zero numeric input behavior by parsing clean numbers and allowing empty transient strings while typing, populates PO/GRN quantities when linking a PO, and adds a live **Bill Financial Summary Bar** (`Items Subtotal + Tax / VAT + Freight / Duty = Grand Total Payable`).
     - **Issue Outbound Payment Voucher (PV) Modal**: Checking open bills automatically populates the vendor, sums checked `balance_due` into `Amount Paid (AED)`, and builds the payment narration (`Settlement against BILL-XXXX (Inv #...)`). Saving writes `amount_paid` to both `payment_voucher_metadata.amount_paid` and `grand_total`.
     - **Issue Vendor Debit Note (DN) & Material Return (MRN) Modal**: Selecting a linked PO or Supplier Bill populates `Return / Claim Line Items` with descriptions, quantities, and rates, adds column headers and a live **Total Claim / Debit Note Amount (AED)** summary bar, and persists all line items and calculated totals onto the `QuotationDocumentRecord`.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density enterprise SaaS ledger and A4 document studio following the 60-30-10 neutral slate canvas (`bg-slate-50`/`bg-white`), crisp `1px` structural borders (`border-slate-200`), and semantic status accents (Indigo for POs, Emerald for GRN/Matched, Amber for Bills/PVs, Rose for Returns/Holds).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` UI headers and controls paired with `JetBrains Mono` (`font-mono tabular-nums`) for all document references, quantities, rates, and currency totals.
  - *Single-Row Header Actions*: `PageHeader` action buttons use `flex-nowrap whitespace-nowrap shrink-0` so `Record Supplier Bill`, `Issue Payment Voucher`, and `+ New Supplier PO` remain on a single horizontal line.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Aliasing `listByWorkspace` on `QuotationRepository` & `ProcurementRepository`**
  - *Chosen Approach*: Expose `QuotationRepository.listByWorkspace(workspaceId)` (delegating to `getQuotationsForWorkspace`) and `ProcurementRepository.listByWorkspace(workspaceId)` (delegating to `getWorkspaceSupplierBills`), and define `openCreatePvModal` in `ProcurementPayablesHub`.
  - *Why*: Guarantees backward and forward compatibility across all modal save handlers and row action triggers without runtime `TypeError` or `ReferenceError` crashes.
- **Decision 2: Live Inline Line Items State in Studio (`customStudioLineItems`)**
  - *Chosen Approach*: Seed editable studio line items from the active document's `line_items` (or empty array for new standalone vendor docs rather than injecting dummy `MOD-100-PRO` sample items on vendor documents) and recalculate `subtotal`, `tax_amount`, and `grand_total` on every item addition, edit, or deletion.
  - *Why*: Allows users to add or adjust items directly inside Studio for `PO`, `DN`, `MRN`, `DO`, and `QT` with instant A4 preview updates.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Procurement & Payables Hub                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │PageHeader (1-Row)│  │ 4 Interactive    │  │ Guided Modals (PO, GRN,  │  │
│  │nowrap CTA buttons│  │ Tables (RowClick)│  │ Bill, PV, MRN/DN, Viewer)│  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
└───────────┼─────────────────────┼─────────────────────────┼────────────────┘
            │                     ▼                         ▼
┌───────────┴────────────────────────────────────────────────────────────────┐
│                    A4 Document Studio (QuotationStudioModal)               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Always-Visible Top Header: [Save <Doc>] [Issue <Doc>] [Hide Controls]│  │
│  ├──────────────────────────────────┬───────────────────────────────────┤  │
│  │ Deal Data & Content Drawer       │ Live A4 Canvas (QuotationDocument)│  │
│  │ • Document Metadata Editor       │ • Hides Client Terms on DN/MRN/PV │  │
│  │ • Inline Line Items Editor (NEW) │ • Interactive Empty Table Prompt  │  │
│  │ • Collapsed @Fields Accordion    │ • Synchronized Financial Totals   │  │
│  └──────────────────────────────────┴───────────────────────────────────┘  │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              Repository Layer (Firestore + Local Cache Sync)               │
│  • QuotationRepository.listByWorkspace() <-> getQuotationsForWorkspace()   │
│  • ProcurementRepository.recalculateBillSettlement()                       │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - `openCreatePvModal(bill?, po?)`: Closes `viewingBillSummary` if open, invokes `handleIssuePaymentVoucher(bill, po)` to pre-select vendor, allocate the bill's `balance_due`, populate `pvAmountPaid`, and open `showCreatePvModal`.
  - Numeric inputs in Bill, PO, PV, and Return modals use `value={val === 0 ? '' : val}` (or `String(val || '')` with `placeholder="0"`) so typing `50` never produces `050`.
  - Console cleanup: Removes `console.log('[Visibility Check]', ...)` from `App.tsx` and uses static imports for `aiExtractionClient` in `SettingsHub.tsx`.
