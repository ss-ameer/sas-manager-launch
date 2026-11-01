# Presentation-Ready Procurement & A4 Document Studio Polish Plan

Deliver a seamless, self-explanatory B2B Procurement, Vendor Settlement, and A4 Document Studio experience for live executive presentation—eliminating prop/mode mismatches, mystery `AED 0.00` dummy records, locked A4 preview sections, chained reference prefixes, and synthetic ID leaks on printed documents.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> All three interactive workflow decisions have been confirmed and are locked into this plan:

- **Confirmed Decision 1 — Guided Setup Modals First**: Clicking **Issue Payment Voucher**, **+ Material Return (MRN)**, or **+ Vendor Debit Note (DN)** in the Procurement & Payables Hub opens a clean, guided Setup Modal first (to select Vendor, linked Supplier Bill/PO, line items, and settlement amount) with both **[ Save ]** and **[ Save & Open in A4 Studio ]** actions—eliminating mystery `Vendor / Supplier` dummy rows with `AED 0.00`.
- **Confirmed Decision 2 — Direct A4 Canvas Click-to-Edit (`Deal Data & Content`)**: Opening any `PO`, `PV`, `MRN`, `DN`, `DO`, or `REC` automatically expands the left controls drawer to the **Deal Data & Content** tab. Clicking any card or section directly on the A4 preview highlights that block, opens **Deal Data & Content**, and scrolls directly to the corresponding input fields.
- **Confirmed Decision 3 — Separated Client vs. Vendor Mode Tabs**: The A4 Studio top mode switcher cleanly separates **Inbound Client Documents** (`Quotation (QT)`, `Delivery Note (DO)`, `Receipt (REC)`) from **Outbound Vendor / Procurement Documents** (`Purchase Order (PO)`, `Payment Voucher (PV)`, `Material Return (MRN)`, `Debit Note (DN)`), and strips existing prefixes before generating linked document references so hybrid codes like `PO-PV-0002-01` or `MRN-PV-0002-01` can never occur.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies the end-to-end outbound B2B procurement lifecycle (Supplier POs $\rightarrow$ Warehouse GRNs $\rightarrow$ 3-Way Matched Supplier Bills $\rightarrow$ Outbound Payment Vouchers & Material Returns/Debit Notes) with the live WYSIWYG A4 Document Studio.
- **Target Audience / Persona**: Executive stakeholders, procurement managers, finance controllers, and warehouse operations teams evaluating the platform during a live product demonstration.
- **Key Value**: Every button click leads to a predictable, pre-populated workflow; every number in the Hub table matches the A4 Studio document; and every section on the physical A4 sheet is directly clickable and editable without hunting through hidden menus.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Opening Any Procurement Document in A4 Studio (`PO`, `PV`, `MRN`, `DN`)**:
   - Clicking **Studio** or **Open in A4 Studio** passes the canonical `editingQuotation` record and `initialDocumentType` into the Studio modal.
   - Studio launches directly in the exact document mode (`Purchase Order Studio`, `Payment Voucher Studio`, `Material Return Studio`, or `Debit Note Studio`), expands the left drawer to **Deal Data & Content**, and never injects dummy fallback equipment items into a Payment Voucher.
2. **Guided Outbound Payment Voucher (`PV`) Creation**:
   - Clicking **$ Issue Payment Voucher** (from the top bar, a Supplier PO row, or a Supplier Bill row) opens the **Issue Outbound Payment Voucher Modal**.
   - Selecting a Vendor filters unpaid/partially paid Supplier Bills and open POs; checking one or more bills auto-calculates the **Total Amount Disbursed** and populates beneficiary bank details.
   - Users can click **Save Payment Voucher** (saving immediately to the registry and updating Supplier Bill balances) or **Save & Open in A4 Studio**.
3. **Guided Vendor Return (`MRN`) & Debit Note (`DN`) Creation**:
   - Clicking **+ Material Return (MRN)** or **+ Vendor Debit Note (DN)** opens the **Create Vendor Return / Debit Note Modal**.
   - Users pick the Vendor and linked Supplier PO or Bill, select which line items and return quantities to include, choose the Return Reason and Resolution Type, and either **Save** or **Save & Open in A4 Studio**.
4. **Interactive Click-to-Edit on the A4 Sheet**:
   - Hovering over any section on the A4 sheet (Vendor/Payee Card, PO/PV/MRN/DN Metadata Card, Amount Disbursed Banner, Bill Settlement & Allocation Schedule, Disbursing/Beneficiary Bank Card, Delivery/Return Sign-Off Block, or Line Items Table) displays an interactive focus ring and section badge.
   - Clicking the section opens the left drawer to **Deal Data & Content** and smoothly scrolls to and highlights the exact form card for that section.

### Visual Identity & Theme

- **Aesthetic Direction**: High-precision enterprise financial & commercial workspace (`Light Mode` primary surface `#F8FAFC` / `#FFFFFF` with crisp `1px` `#E2E8F0` structural borders).
- **Color Palette & Semantic Accents**:
  - **Supplier POs**: Indigo (`#4F46E5`)
  - **Warehouse GRNs & Matched Status**: Emerald (`#059669`)
  - **Supplier Bills & Outbound Payment Vouchers**: Amber (`#D97706`)
  - **Material Returns & Vendor Debit Notes**: Rose (`#E11D48`)
- **Typography & Hierarchy**: Tabular numerals (`font-mono tabular-nums`) across all currency columns, quantities, landed costs, and settlement schedules; `<HoverScrollText />` for constrained single-line table cells.
- **Layout Geometry & Viewport Integrity**:
  - Full-bleed sticky `<PageHeader>` at the root of the Procurement & Payables view (`w-full border-b sticky top-0 bg-white z-20`) with `<PageBody>` housing the KPI cards and data tables below it—preventing KPI card slicing on scroll and keeping the 3 primary header buttons (`+ New Supplier PO`, `Record Supplier Bill`, `$ Issue Payment Voucher`) aligned on a single non-wrapping row (`flex-nowrap whitespace-nowrap`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Guided Setup Modals vs. Instant Blank Studio Launch**
  - *Chosen Approach*: Open a structured setup modal when clicking **Issue Payment Voucher**, **+ Material Return (MRN)**, or **+ Vendor Debit Note (DN)**, pre-filled when triggered from a specific PO or Bill row.
  - *Why*: Prevents accidental creation of empty `Vendor / Supplier` records with `AED 0.00` when a user simply clicks the button to explore or cancels mid-way, while auto-linking Vendor, PO/Bill references, and real amounts before Studio ever opens.
- **Decision 2: Contextual Client vs. Vendor Mode Switcher in Studio**
  - *Chosen Approach*: Show Client modes (`QT | DO | REC`) when working on inbound client documents, and Vendor modes (`PO | PV | MRN | DN`) when working on outbound procurement documents, paired with universal prefix stripping (`QT|DO|PO|REC|PV|MRN|DN|LPO|PI|INV|STK`) in `generateLinkedDocumentRef`.
  - *Why*: Eliminates accidental cross-contamination between client revenue documents and vendor payable documents and prevents chained reference codes like `PO-PV-0002-01`.
- **Decision 3: Unified Financial Total Persistence Across Hub & Studio**
  - *Chosen Approach*: Synchronize both `grand_total` and `financial_totals` (plus `payment_voucher_metadata.amount_paid` from allocated bills or voucher total) whenever a document is saved in Studio or via a Setup Modal.
  - *Why*: Guarantees that the Procurement Hub table, KPI cards, Supplier Bill balances, and A4 PDF preview always display the exact same currency amount.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Interactive Workflow Diagram

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                         PROCUREMENT & PAYABLES HUB VIEW                           │
│  Root <PageHeader> (Single-Row Non-Wrapping Actions) + <PageBody> (4 KPI Cards)   │
└───────┬───────────────────────────┬───────────────────────────┬───────────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────────────┐  ┌──────────────────────────┐  ┌───────────────────────────┐
│ Create Supplier PO   │  │ Issue Outbound PV Modal  │  │ Vendor Return / DN Modal  │
│ • Vendor Picker      │  │ • Vendor & Unpaid Bills  │  │ • Mode: MRN vs Priced DN  │
│ • Enquiry Line Check │  │ • Auto-Sum Allocations   │  │ • PO/Bill Line Checklist  │
│ • UOM & Cost Preview │  │ • Bank & Instrument Info │  │ • Return Qty & Reason     │
│ • Save / Open Studio │  │ • Save / Open Studio     │  │ • Save / Open Studio      │
└───────┬──────────────┘  └─────────┬────────────────┘  └───────┬───────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                     A4 DOCUMENT STUDIO (QuotationStudioModal)                     │
│  • Canonical Props: editingQuotation={studioQuotation} + initialDocumentType      │
│  • Contextual Mode Bar: Client (QT | DO | REC) vs Vendor (PO | PV | MRN | DN)     │
│  • Dynamic Header: "Vendor: <Name>" + "Save / Issue <Document Type>"              │
│  • Auto-Open Left Drawer -> "Deal Data & Content" for PO / PV / MRN / DN / DO/REC │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                       LIVE A4 CANVAS (QuotationDocument)                          │
│  • Click-to-Edit Wiring: Clicking Vendor Card, PO/PV/MRN/DN Meta, PV Allocations, │
│    Bank Details, or Sign-Off Card opens Deal Data & Content & scrolls to section  │
│  • Clean Ref Sanitizer: Scrubs "standalone_qdoc_*" -> "Stock Replenishment" /     │
│    "Direct Settlement" across Header, Requisition Ref, Settlement Ref & Tokens    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Studio Launch Prop Fix & Empty-Line Guard**:
   - Pass `editingQuotation={studioQuotation as any}` and `initialDocumentType={studioQuotation.document_type}` when rendering `QuotationStudioModal` inside the Procurement Hub.
   - Update `QuotationStudioModalProps` to accept `existingQuotation?: Quotation | null` as a safe fallback alias (`const effectiveEditingQuotation = editingQuotation || existingQuotation || null`) so no caller can ever silently drop the document record.
   - When `documentType === 'payment_voucher'` and `rawItems.length === 0`, keep line items empty or mapped from bill allocations rather than injecting the `Commercial Grade Equipment Unit` fallback item.
   - Normalize `QuotationRepository.hydrateQuotationRecordForStudio` so `QuotationDocumentRecord` fields (`quote_ref_no`, `quotation_subject`, `financial_totals`, `revision_no`, `purchase_order_metadata`, `payment_voucher_metadata`, `vendor_return_metadata`) hydrate seamlessly whether opened from `EnquiryDetail` or `ProcurementPayablesHub`.

2. **Contextual Top Bar, Dynamic Button Labels & Clean Reference Prefixes**:
   - Separate the top mode switcher into **Client Document Modes** (`QT`, `DO`, `REC`) and **Outbound Vendor Modes** (`PO`, `PV`, `MRN`, `DN`) based on whether the active document is an outbound vendor document or launched from Procurement.
   - Update `saveButtonLabel` and `issueButtonLabel` to cover all 7 types (`Save Payment Voucher` / `Issue Payment Voucher`, `Save Material Return` / `Issue Material Return`, `Save Debit Note` / `Issue Debit Note`, `Save Purchase Order` / `Issue Purchase Order`, `Save Delivery Note` / `Issue Delivery Note`, `Save Receipt` / `Issue Receipt`).
   - Update the Studio header subtitle to display `Vendor: <Resolved Supplier/Payee Name>` for `PO`, `PV`, `MRN`, and `DN` (resolving from `purchase_order_metadata.supplier_name`, `payment_voucher_metadata.payee_name`, `vendor_return_metadata.supplier_name`, or `client_snapshot.entity_name`), and show appropriate status options (`Draft`, `Issued`, `Approved`, `Paid / Settled`, `Cancelled`).
   - Update `generateLinkedDocumentRef` to strip all document and stock prefixes (`^(?:(?:QT|DO|PO|REC|PV|MRN|DN|LPO|PI|INV|STK)[-_/\s]*)+` case-insensitively) before prepending the target prefix so chained prefixes never appear.

3. **Direct A4 Canvas Click-to-Edit & Auto-Open `Deal Data & Content`**:
   - Initialize `activeLeftTab` to `'content'` (`Deal Data & Content`) and `isLeftDrawerOpen` to `true` whenever `documentType !== 'quotation'` or when editing an existing document.
   - Wire `onClick` handlers on `QuotationDocument` for:
     - `po_metadata` (Purchase Order Vendor, Shipping & Requisition Card)
     - `pv_metadata` (Payment Voucher Payee, Disbursement Banner & Settlement Schedule)
     - `pv_bank` (Payment Voucher Disbursing & Beneficiary Bank Cards)
     - `return_metadata` (Material Return / Debit Note Metadata & Sign-Off Cards)
     - `do_metadata` (Delivery Note Dispatch & Receiver Sign-Off Cards)
     - `rec_metadata` (Receipt Voucher Metadata & Amount Received Banner)
   - When any of these canvas sections is clicked, automatically set `isLeftDrawerOpen(true)`, switch `activeLeftTab` to `'content'`, and smooth-scroll to and highlight the corresponding metadata editor card (`id="studio-content-card-..."`).

4. **Scrub Synthetic `standalone_qdoc_...` IDs from All Printed A4 Pages**:
   - Create a shared sanitizer `formatCleanDocumentEnquiryRef(rawRef, docType, fallbackRef)` that detects internal synthetic IDs (`standalone_*`, `qdoc_*`, UUIDs, or raw timestamps) and returns clean business labels:
     - `purchase_order` $\rightarrow$ `poMeta?.requisition_ref || 'Stock Replenishment'`
     - `payment_voucher` $\rightarrow$ `pvMeta?.vendor_invoice_no || 'Direct Vendor Settlement'`
     - `receipt` $\rightarrow$ `receiptMeta?.settlement_for_ref || 'Direct Account Settlement'`
     - `material_return_note` / `debit_note` $\rightarrow$ `returnMeta?.original_po_ref || 'Vendor Return'`
     - `quotation` / `delivery_note` $\rightarrow$ omitted or clean Enquiry number (`ENQ-XXXX`).
   - Apply this sanitizer across the A4 Header Bar, PO Requisition Ref cell, Receipt Settlement Ref cell and Amount Received banner, Payment Voucher Settlement Ref cell, and `@enquiry_ref` in `quotationTokenResolver.ts`.

5. **Guided Setup Modals, Enquiry Line Import & Amount Sync in `ProcurementPayablesHub`**:
   - **Issue Outbound Payment Voucher Modal**: Select Vendor $\rightarrow$ check one or more Unpaid Supplier Bills (or link a PO for advance payment) $\rightarrow$ set Payment Mode, Disbursing Bank, UTR/Cheque Ref, and Amount Paid $\rightarrow$ **Save Payment Voucher** or **Save & Open in A4 Studio**.
   - **Create Vendor Return (`MRN`) / Debit Note (`DN`) Modal**: Select Mode (`MRN` vs `DN`), Vendor, and linked Supplier PO/Bill $\rightarrow$ check line items and enter Return Qty & Return Reason $\rightarrow$ **Save** or **Save & Open in A4 Studio**.
   - **Upgrade Create Outbound Supplier PO Modal**:
     - Fix Enquiry line item quantity mapping (`Number(li.quantity ?? li.qty) || 1`) and initialize unit cost from catalog/line `cost_price`.
     - Add interactive checkboxes when an Enquiry is selected so users can split multi-vendor enquiries across different Supplier POs, showing which items were already ordered on another PO.
     - Add clear column headers (`Catalog Item`, `Description`, `UOM`, `Qty`, `Unit Cost`, `Line Total`), a live **PO Grand Total Preview**, and both **Save PO** and **Create PO & Open in Studio** buttons.
   - **Upgrade Record Supplier Bill & 3-Way Match Modal**:
     - Auto-populate Vendor, TRN, Currency, and all PO/GRN lines on PO selection, and add a live **Bill Financial Summary** (`Items Subtotal`, `Tax / VAT`, `Freight / Duty`, `Grand Total Payable`) at the bottom right.
   - **Fix `AED 0.00` Display & Studio Save Sync**:
     - When saving in `QuotationStudioModal`, always persist `financial_totals` alongside `grand_total`, and for `payment_voucher` ensure `payment_voucher_metadata.amount_paid` defaults to the sum of `allocated_bills` (`paid_this_voucher`) or `liveQuotation.grand_total`.
     - In `ProcurementPayablesHub`, read `Number(doc.payment_voucher_metadata?.amount_paid || doc.financial_totals?.grand_total || (doc as any).grand_total || 0)` so every voucher and return row displays its true amount.
   - **Fix Sticky `<PageHeader>` & Button Wrapping**:
     - Move `<PageHeader>` to the root of `ProcurementPayablesHub` and wrap the KPI cards and tabs inside `<PageBody>` so sticky scrolling never slices the KPI cards, and keep the 3 header action buttons on a single `flex-nowrap whitespace-nowrap` row.
