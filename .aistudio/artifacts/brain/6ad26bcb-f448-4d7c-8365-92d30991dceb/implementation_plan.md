# Outbound Supplier PO, Procurement, GRN, Vendor Settlement & 1GB Bucket Quota Protection — Implementation Plan

## 1. Architectural & SaaS Guardrails
- **100% Multi-Tenant & Industry-Agnostic**: All company names, warehouse addresses, tax IDs (`TRN / VAT / Tax ID`), currencies, and bank accounts resolve dynamically from the active Workspace Profile (`sender_snapshot` / `@our_company`) and Vendor profiles in `Companies & Contacts`. No company, warehouse, bank, or industry-specific strings are hardcoded.
- **Unified A4 Studio Architecture**: Extends the existing `QuotationStudioModal.tsx` and `QuotationDocument.tsx` engine cleanly without splitting into a new folder hierarchy. Uses standard decimal numbers with `QuotationRepository.roundCurrency` (`Math.round((val + Number.EPSILON) * 100) / 100`).
- **Strict Revenue & Revision Isolation**: Outbound procurement records (`purchase_order`, `supplier_bill`, `payment_voucher`, `material_return_note`, `debit_note`) and standalone Stock Replenishment POs (`enquiry_id: ''`) never mutate `enquiries.value_aed`, `enquiries.quoted_amount`, or client `QT` revision chains.
- **Enterprise UI/UX**: Compact 2-column drawer grids (`min-w-0`, `whitespace-nowrap`), progressive disclosure, `<HoverScrollText />` for constrained text, `<PageHeader>` and `<KpiStatCard>` inside `max-w-[1600px]` containers, and tabular monospace figures (`font-mono tabular-nums`) for all financial and quantity columns.

---

## 2. Pillar-by-Pillar Design & Key Workflows

### Pillar 1: Smart Supplier PO Creation, Vendor Directory Linking & Central Procurement Hub
1. **Vendor Profile Extensions (`src/types.ts`, `src/components/CompanyModal.tsx`, `src/components/CompanyDetailView.tsx`)**:
   - Extend `Company` with optional vendor procurement fields:
     - `tax_registration_no?: string` (`TRN / VAT / Tax ID`)
     - `default_currency?: string` (e.g., `AED`, `USD`, `EUR`, `GBP`, `SAR`)
     - `default_payment_terms?: string` (e.g., `30 Days Net`, `100% Advance`, `50% Advance / 50% on Delivery`)
     - `default_incoterms?: PurchaseOrderIncoterms | string`
     - `vendor_bank_details?: { beneficiary_name?: string; bank_name?: string; account_number?: string; iban?: string; swift_code?: string; branch_address?: string; currency?: string }`
   - In `CompanyModal.tsx` (Create/Edit Company) and `CompanyDetailView.tsx`, surface a collapsible **Vendor Procurement & Bank Details** section whenever the company relationship is `Vendor` / `Supplier` (or toggled on for any company).
2. **Smart Vendor Picker & Multi-Vendor Line Item Split (`src/components/EnquiryDetail.tsx` & `src/components/quotations/QuotationStudioModal.tsx`)**:
   - Upgrade the `+ Supplier PO` modal in `EnquiryDetail.tsx` and the PO Configuration drawer in `QuotationStudioModal.tsx`:
     - Selecting a Vendor from `Companies & Contacts` auto-fills `supplier_id`, `supplier_name`, primary contact person, email, phone, address, `supplier_tax_id` (`TRN / VAT`), default `currency`, `payment_terms`, `incoterms`, and snapshots `vendor_bank_details` onto `purchase_order_metadata`.
     - **Multi-Vendor Line Item Split**: Display all Enquiry / Quotation line items (including Composite BOM sub-components) with checkboxes, ordered quantities, and an **"Already Ordered on PO-XXXX"** badge calculated from existing non-deleted Supplier POs for that enquiry so procurement officers can split items across multiple vendors without double-ordering.
     - Automatically initialize each PO line item's unit rate from `lineItem.cost_price ?? catalogProduct.cost_price ?? 0.00`.
3. **Centralized Procurement & Payables Hub (`src/components/ProcurementPayablesHub.tsx`, `src/components/Sidebar.tsx`, `src/components/ProductManager.tsx`, `src/App.tsx`)**:
   - Accessible from **both** a top-level **Procurement & Payables** tab in `Sidebar.tsx` and a quick-navigation button inside `ProductManager.tsx` (`Product Catalog & Inventory`).
   - Features 4 segmented sub-views with live KPI summary cards (`Open Supplier POs`, `Pending Stock Receipts`, `Unpaid Vendor Bills`, `Total Payables Balance`):
     1. **Supplier Purchase Orders (`PO`)**: Filterable by status, receiving state, vendor, or linked Enquiry/Project; includes `[+ New Stock Replenishment PO]` (standalone PO without requiring a client Enquiry) and 1-click `[Receive Stock (GRN)]`, `[Record Supplier Bill]`, and `[Open in A4 Studio]`.
     2. **Pending GRN / Stock Receipts**: Shows all issued POs with undelivered quantities (`qty_pending > 0`) and recent PO-linked GRN logs.
     3. **Supplier Bills & 3-Way Match (`BILL`)**: Lists recorded vendor invoices with 3-Way Match status badges (`3-Way Matched`, `Price Variance`, `Qty Over Receipt / Order`), approval workflow (`draft | under_review | approved | cancelled`), payment status (`unpaid | partially_paid | paid`), and dispute/hold toggle (`is_on_hold` + `hold_reason`).
     4. **Outbound Payment Vouchers (`PV`) & Vendor Returns (`MRN` / `DN`)**: Lists all issued Payment Vouchers, Material Return Notes, and Debit Notes with 1-click A4 Studio preview/print.

---

### Pillar 2: PO-to-Warehouse Stock Receipt (`GRN`) Linkage & Landed Cost Protection
1. **PO Line Item Receiving Tracking (`src/types.ts`)**:
   - Extend `QuotationLineItem` and `PurchaseOrderMetadata` with receiving & landed cost fields:
     - On `QuotationLineItem`: `qty_ordered?: number`, `qty_received?: number`, `qty_pending?: number`, `qty_returned?: number`, `allocated_freight_cost?: number`, `manual_landed_cost_override?: number`, `landed_unit_cost?: number`.
     - On `PurchaseOrderMetadata`: `receiving_status?: 'Pending Receipt' | 'Partially Received' | 'Fully Received'`, `freight_customs_cost?: number`, `landed_cost_allocation_mode?: 'proportional_value' | 'manual_override'`, `linked_grn_refs?: string[]`.
2. **1-Click `[Receive Stock (GRN)]` Workflow (`src/services/inventoryService.ts`, `src/components/ProcurementPayablesHub.tsx`, `src/components/ProductManager.tsx`)**:
   - Clicking `[Receive Stock (GRN)]` on any issued Supplier PO opens the **PO Goods Receipt (GRN) Modal** pre-populated with all undelivered PO line items (`qty_pending = qty_ordered - qty_received`).
   - Supports partial or full delivery per line item, entering the Supplier Delivery Note # and storage location, and entering **Freight / Customs / Duty Cost (`freight_customs_cost`)**.
   - **Landed Cost Allocation (Proportional by Value with Manual Per-Line Override)**:
     - Distributes `freight_customs_cost` across received lines proportionally by line subtotal value by default, while allowing the operator to manually override allocated freight or `landed_unit_cost` on any line.
     - Computes `landed_unit_cost = po_unit_cost + (allocated_line_freight / received_qty)`.
     - **Base Catalog Cost Protection**: Records `landed_unit_cost` on the `StockMovement`, the PO line item, and `product.last_landed_cost` for inventory valuation and project margin tracking **without overwriting** the product's base catalog `cost_price` (unless the user explicitly checks an optional "Update base catalog unit cost" box).
   - Creates `STOCK_IN` movements in `stock_movements` linked to `po_id`, `po_ref`, and `grn_ref`, increments `products.stock_on_hand`, and updates the PO's `receiving_status` (`Pending Receipt` -> `Partially Received` -> `Fully Received`).

---

### Pillar 3: Supplier Bill Recording & Lightweight 3-Way Match (`PO` vs `GRN` vs `BILL`)
1. **Supplier Bill Schema & Repository (`src/types.ts`, `src/services/repositories/ProcurementRepository.ts`)**:
   - Define `SupplierBill` (`supplier_bills` Firestore collection):
     - `id`, `workspace_id`, `bill_number` (e.g., `BILL-2026-0001`), `vendor_invoice_no` (with duplicate invoice number detection per vendor), `invoice_date`, `due_date`
     - `supplier_id`, `supplier_name`, `supplier_trn`
     - `po_id?`, `po_ref?`, `enquiry_id?`, `project_id?`, `grn_refs?: string[]`
     - `currency` & `exchange_rate` (default `1.0`, converting foreign currency bills to workspace base currency for reporting)
     - `line_items: SupplierBillLineItem[]` (tracking `po_line_id`, `product_id`, `item_name`, `po_ordered_qty`, `grn_received_qty`, `billed_qty`, `po_unit_cost`, `billed_unit_cost`, `tax_rate`, `line_total`)
     - `subtotal`, `freight_customs_amount`, `tax_amount`, `grand_total`, `credit_applied_amount`, `amount_paid`, `balance_due`
     - `approval_status: 'draft' | 'under_review' | 'approved' | 'cancelled'`
     - `payment_status: 'unpaid' | 'partially_paid' | 'paid'`
     - `is_on_hold?: boolean`, `hold_reason?: string`
     - `match_status: 'matched' | 'price_variance' | 'qty_variance' | 'both_variance' | 'no_po'`
     - `variance_summary?: { has_price_variance: boolean; has_qty_variance: boolean; total_variance_amount: number; line_variances: Array<{ item_name: string; po_rate: number; billed_rate: number; po_qty: number; grn_qty: number; billed_qty: number }> }`
     - `attachment?: Attachment` (vendor invoice PDF/scan uploaded via `uploadWorkspaceMediaAsset` with PDF/image compression and automatic bucket deletion on replacement/removal)
2. **Automatic 3-Way Match Engine & Variance Handling**:
   - Automatically compares each Bill line against the linked `PO` (`qty_ordered`, `unit_cost`) and `GRN` (`qty_received`):
     - **3-Way Matched (Emerald Badge)**: Billed Qty <= Received/Ordered Qty AND Billed Unit Rate == PO Unit Rate (within 0.01 rounding tolerance).
     - **Price Variance (Amber Badge)**: Billed Unit Rate != PO Unit Rate.
     - **Qty Over Receipt / Order (Crimson Badge)**: Billed Qty > GRN Received Qty (or PO Ordered Qty if not yet received).
   - **Variance Approval Behavior**: Flags the variance badge clearly on the Bill and offers a 1-click **Place Bill on Hold** toggle (`is_on_hold` + `hold_reason`), while allowing Workspace Admins / Approvers to review and approve with an explicit variance override confirmation.

---

### Pillar 4: Outbound Payment Voucher (`PV`) & Material Return / Debit Note (`MRN` / `DN`) in A4 Studio
1. **Commercial Document Type & Token Resolver Extensions (`src/types.ts`, `src/utils/quotationTokenResolver.ts`)**:
   - Extend `CommercialDocumentType` with `'payment_voucher' | 'material_return_note' | 'debit_note'`.
   - Add `PaymentVoucherMetadata` (`payment_voucher_metadata`) and `VendorReturnMetadata` (`vendor_return_metadata`) to `Quotation`:
     - `PaymentVoucherMetadata`:
       - `pv_ref`, `pv_date`, `payment_mode` (`Bank Wire Transfer`, `Cheque`, `Cash`, `Online / Corporate Card`), `payment_type` (`Single Bill / PO Settlement`, `Multi-Bill Allocation`, `Vendor Advance Payment`)
       - `supplier_id`, `supplier_name`, `supplier_trn`, `beneficiary_bank_snapshot` (`beneficiary_name`, `bank_name`, `account_number`, `iban`, `swift_code`)
       - `disbursing_bank_account` (workspace bank account used for payment), `bank_txn_ref`, `cheque_no`, `cheque_date`, `cheque_bank`
       - `allocations: PaymentVoucherAllocationRow[]` (`bill_id`, `po_id`, `bill_or_po_ref`, `vendor_invoice_no`, `invoice_date`, `bill_total`, `credits_applied`, `previously_paid`, `paid_this_voucher`, `remaining_balance`)
       - `amount_paid`, `currency`, `exchange_rate`, `total_payable_before`, `total_remaining_payable`
       - `prepared_by`, `verified_by`, `approved_by`, `payee_receiver_name`
     - `VendorReturnMetadata`:
       - `return_mode`: `'material_return_note' | 'debit_note'` (supports instant toggle in A4 Studio between unpriced physical **MRN** and priced financial **Debit Note**)
       - `mrn_ref` (e.g., `MRN-0042-01`), `dn_ref` (e.g., `DN-0042-01`), `return_date`
       - `linked_po_id`, `linked_po_ref`, `linked_grn_ref`, `linked_bill_id`, `linked_bill_ref`, `vendor_invoice_no`
       - `return_reason`: `'Damaged on Arrival' | 'Defective / Non-Conforming' | 'Wrong Item Supplied' | 'Over-Supplied Quantity' | 'Commercial Price Adjustment'`
       - `resolution_type`: `'Deduct from Supplier Bill' | 'Open Vendor Credit' | 'Physical Replacement'`
       - `dispatch_mode`, `vehicle_plate_no`, `driver_name`, `driver_phone`
       - `stock_deducted?: boolean`, `stock_deducted_at?: string`
   - Extend `QUOTATION_AT_TAGS` and `buildQuotationTokenMap` in `src/utils/quotationTokenResolver.ts` with `@pv_ref`, `@pv_date`, `@beneficiary_name`, `@beneficiary_bank`, `@beneficiary_iban`, `@beneficiary_swift`, `@vendor_invoice_no`, `@mrn_ref`, `@dn_ref`, `@return_reason`, and `@original_po_ref`.
2. **A4 Studio Renditions (`src/components/quotations/QuotationStudioModal.tsx` & `src/components/quotations/QuotationDocument.tsx`)**:
   - **Outbound Payment Voucher (`PV`) Mode**:
     - Renders an executive **PAYMENT VOUCHER** header, Beneficiary & Disbursing Bank summary cards, **Amount Disbursed Highlight Banner** with `@amount_in_words`, the **Outbound Settlement & Bill Allocation Table** (`Bill / PO Ref`, `Vendor Invoice #`, `Bill Total`, `Credits / DN`, `Previously Paid`, `Paid This Voucher`, `Remaining Payable Balance`), and a **4-Slot Signatory Block** (`Prepared By`, `Reviewed / Verified By`, `Approved By`, `Payee Receiver Signature / Stamp`).
     - Issuing/saving a Payment Voucher automatically updates the allocated `SupplierBill` records (`amount_paid`, `balance_due`, and `payment_status`: `unpaid -> partially_paid -> paid`).
   - **Material Return Note (`MRN`) & Debit Note (`DN`) Dual-Mode in Studio**:
     - Header toggle in Studio allows switching the same return record between:
       1. **Material Return Note (`MRN` — Unpriced)**: Hides pricing columns; displays `Item / Description`, `Return Reason`, `Unit`, `Return Qty`, transport/driver dispatch metadata, and a 1-click **`[Deduct Returned Stock from Warehouse]`** button that logs a `RETURN_TO_VENDOR` movement in `inventoryService.ts` (reducing `stock_on_hand` without affecting `stock_reserved` or client project delivery metrics).
       2. **Debit Note (`DN` — Priced Claim)**: Shows `Item / Description`, `Return Reason`, `Return Qty`, `Vendor Unit Cost`, `Tax`, and `Total Claim Value`, plus a financial summary box showing the reduction applied against the linked Supplier Bill (`credit_applied_amount`) or recorded as an open vendor credit.

---

### Pillar 5: Vendor Payables Statement & Real Project Margin Integration
1. **Vendor Profile Payables Tab (`src/components/CompanyDetailView.tsx`)**:
   - Add a **Procurement & Payables** tab inside the Company Detail drawer whenever viewing a Vendor/Supplier (or any company with linked POs/Bills).
   - Displays 4 compact summary metrics (`Total POs Issued`, `Total Billed`, `Paid & Credited`, `Net Payable Balance`) and a unified ledger of linked Supplier POs, Vendor Bills, Payment Vouchers (`PV`), and Material Returns / Debit Notes (`MRN`/`DN`), plus a 1-click `[+ Issue Payment Voucher]` and `[+ New Supplier PO]` action.
2. **Enquiry & Project Procurement Cost Rollup (`src/components/EnquiryDetail.tsx` & `src/components/ProjectRegistry.tsx`)**:
   - **In `EnquiryDetail.tsx`**:
     - In the Commercial Documents Hub and Financial Summary, display a **Procurement & Actual Margin Card** showing:
       - `Client Contract / Quote Value` (untouched client revenue)
       - `Estimated Catalog / BOM Cost`
       - `Committed Procurement Cost` (sum of linked Supplier POs / Bills / Landed GRN costs: `landed_unit_cost ?? billed_unit_cost ?? po_unit_cost`, minus any Vendor Debit Notes)
       - `Realized Net Margin (AED & %)`
   - **In `ProjectRegistry.tsx`**:
     - Inside the Project Detail Modal, add a **Procurement, GRN & Net Margin** section displaying all Supplier POs, GRN receipt status, and Vendor Bills linked to the Project or its parent Enquiry, along with a live comparison of **Contract Value vs. Actual Landed Procurement Cost = Net Project Margin** and a 1-click button to create a Supplier PO or receive stock for the project.

---

### Pillar 6: 1GB Bucket Quota Protection, Automatic Bucket File Deletion & In-App Acrobat-Style PDF Compression (`src/services/attachmentStorage.ts`, `src/components/SettingsHub.tsx`, `src/components/TrashBinModal.tsx`)
1. **Zero Orphaned Files — Automatic Bucket Deletion (`deleteFromStorageBucket`)**:
   - Add `deleteFromStorageBucket(fileUrlOrPath, workspaceOrSettings)` in `src/services/attachmentStorage.ts` (wrapping Supabase Storage `DELETE` REST API / object path extraction and local IndexedDB blob cleanup) and invoke it automatically across all removal, replacement, and permanent purge flows:
     1. **Attachment Removal**: Deleting an RFQ/Spec attachment (`EnquiryDetail.tsx`, `EnquiryForm.tsx`), Quote Annex / Flyer (`QuotationStudioModal.tsx`), Product Datasheet (`ProductManager.tsx`), or Supplier Bill invoice attachment (`ProcurementPayablesHub.tsx`).
     2. **Asset Replacement or Removal**: Replacing or clearing a Product primary/secondary photo (`ProductManager.tsx`, `SaveToCatalogModal.tsx`), Line Item primary/secondary image (`EnquiryDetail.tsx`, `QuotationStudioModal.tsx`, `CompositePackageEditor.tsx`), or Workspace Brand Logo, Company Seal/Stamp, or Signatory Image (`WorkspaceDocumentProfileSettings.tsx`, `QuotationStudioModal.tsx`)—only deleting the old URL if it is not shared by another active record.
     3. **Recycle Bin Permanent Purge (`TrashBinModal.tsx`)**: When permanently purging an Enquiry, Quotation, Product, or Project from the Recycle Bin, collect all associated cloud URLs (attachments, flyer annexes, product photos/datasheets, unique line item images) and call `deleteFromStorageBucket` so zero orphaned files remain in the 1GB bucket.
2. **"Scan & Purge Orphaned Bucket Files" Maintenance Utility (`src/components/SettingsHub.tsx` & `src/services/attachmentStorage.ts`)**:
   - Add `listBucketObjects(storageConfig)` and `scanAndPurgeOrphanedBucketFiles(workspace, activeReferencedUrls, options)` in `src/services/attachmentStorage.ts` using the Supabase Storage `/storage/v1/object/list/${bucket}` endpoint across workspace folders (`enquiries`, `products/images`, `products/datasheets`, `quotations`, `branding`, `procurement/bills`).
   - In `Settings -> Workspace Cloud Storage` (`src/components/SettingsHub.tsx`), add a **1GB Quota & Orphaned File Scanner** panel with:
     - Live bucket usage summary (total objects, total MB used out of 1,024 MB / 1 GB quota, progress bar).
     - **`[Scan Bucket for Orphaned Files]`** button that compares every object in the bucket against all active URLs referenced across Firestore (`enquiries`, `products`, `quotations`, `workspace_document_profiles`, `supplier_bills`, `projects`).
     - **`[Purge Orphaned Files]`** button displaying the exact count and reclaimable size (e.g., `Reclaim 18.4 MB across 14 unreferenced files`) to clean the bucket in one click.
3. **In-App Acrobat-Style PDF Compression (`5 MB -> ~200 KB`) & Tighter Image Compression (`src/services/attachmentStorage.ts`)**:
   - Install `jspdf` (via `install_applet_package`) and leverage the PDF.js engine (`window.pdfjsLib` / `loadPdfJs`) to implement `compressPdfFile(file, preset)` in `src/services/attachmentStorage.ts`:
     - Supports 3 compression presets selectable in the upload UI and workspace defaults:
       - **`Standard` (Default for PDFs > 300 KB)**: Renders pages at `~150 DPI` (`scale: 1.55`) and re-encodes as `0.75` JPEG into a compact `jsPDF` document (shrinking a 5 MB scanned PDF or brochure to `~200–260 KB`).
       - **`Extreme`**: Renders at `~110 DPI` (`scale: 1.15`) and `0.60` JPEG quality (`~100–140 KB`).
       - **`Keep Original`**: Uploads the original unmodified PDF (also auto-selected if the compressed output is not smaller than the original).
     - Returns compression telemetry (`originalSize`, `compressedSize`, `savedPercent`, `presetUsed`) and displays a crisp before/after size badge (e.g., `5.1 MB -> 240 KB (-95%)`) on upload toasts and attachment rows.
   - **Tighter Image Compression**:
     - Upgrade `compressImageToDataUrl` / `compressImageFile` and `uploadWorkspaceMediaAsset` defaults in `src/services/attachmentStorage.ts`:
       - Standard product & line-item thumbnails: `maxDimension: 800`, WebP/JPEG quality `0.78` (keeping product photos between `20 KB` and `65 KB`).
       - Wide technical diagrams / secondary images: `maxDimension: 1200`, quality `0.78`.

---

## 3. Verification & Quality Checklist
- Verify that creating, editing, approving, or deleting a Supplier PO, GRN, Supplier Bill, Payment Voucher, Material Return Note, or Debit Note **never** modifies `enquiries.value_aed`, `enquiries.quoted_amount`, or client `QT` revision numbers.
- Verify that `processPoGrnReceipt` allocates landed cost proportionally by line value (with manual override support) without overwriting the base catalog `products.cost_price`.
- Verify that `RETURN_TO_VENDOR` stock movements deduct `stock_on_hand` cleanly without altering `stock_reserved` or client delivery note counters.
- Verify that deleting or replacing any attachment/image or purging from the Recycle Bin triggers `deleteFromStorageBucket`, and that PDFs > 300 KB compress cleanly with before/after size badges.
- Run `lint_applet` and `compile_applet` to ensure zero TypeScript or build errors.
