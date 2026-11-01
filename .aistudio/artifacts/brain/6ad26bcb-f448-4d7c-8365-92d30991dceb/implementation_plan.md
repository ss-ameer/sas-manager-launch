# Comprehensive Codebase Audit & Production Hardening Plan

Following a full-repository inspection across Enquiries, Commercial Document Suite (`QT`, `DO`, `PO`, `REC`, `BILL`, `PV`, `MRN`/`DN`), Outbound Procurement, Inventory, Projects, Team Roster, Recycle Bin, and Cloud Bucket Storage, this plan addresses every state desync, data-model mismatch, quota bottleneck, and lifecycle edge case discovered.

---

## Workstream 1: Canonical Company Name & Contact Resolution in Procurement & Studio
**Files:** `src/components/quotations/QuotationStudioModal.tsx`, `src/components/ProcurementPayablesHub.tsx`, `src/components/CompanyDetailView.tsx`

### Audit Findings
- Normalized `Company` records store their primary name in `display_name` and `canonical_name` (while `name` is an optional alias that is frequently `undefined` on existing directory records).
- Several vendor dropdowns and auto-fill handlers in `QuotationStudioModal.tsx` (`PO`, `PV`, `MRN`/`DN` drawers) and `ProcurementPayablesHub.tsx` (Create PO modal, Record Supplier Bill modal, Vendor Payables ledger) reference `comp.name` directly, causing blank labels or empty supplier names when `comp.name` is unset.
- Contact lookups in `QuotationStudioModal.tsx` and `ProcurementPayablesHub.tsx` inspect `vendor.contacts` instead of resolving linked contacts from the workspace `contacts` collection (`c.company_id === vendor.id`) with fallback to `vendor.contacts`.

### Planned Upgrades
1. **Unified Company Name & Contact Resolver:**
   - Standardize vendor display name resolution everywhere via `comp.display_name || comp.canonical_name || comp.name || 'Unnamed Vendor'`.
   - Resolve primary vendor contacts across both workspace `contacts` (`ct.company_id === vendor.id && !ct.is_deleted`) and any embedded `vendor.contacts`, mapping `ct.full_name || ct.name`, `ct.email`, and `ct.mobile || ct.phone`.
2. **Pass Workspace Contacts to Studio & Procurement Hub:**
   - Ensure `QuotationStudioModal` and `ProcurementPayablesHub` resolve primary contact name, email, and phone cleanly when a user selects a registered Vendor in any `PO`, `BILL`, `PV`, or `MRN`/`DN` drawer.

---

## Workstream 2: Deterministic Supplier Bill Balance & Debit Note Credit Recalculation
**Files:** `src/services/repositories/ProcurementRepository.ts`, `src/services/repositories/QuotationRepository.ts`, `src/components/quotations/QuotationStudioModal.tsx`, `src/components/ProcurementPayablesHub.tsx`

### Audit Findings
- `ProcurementRepository.applyDebitNoteCreditToBill` currently adds `creditClaimAmount` to the existing `bill.credit_applied_amount` on every save. Saving the same Debit Note twice in A4 Studio (e.g., Draft -> Issued) double-counts the credit.
- Similarly, if a Payment Voucher (`PV`) or Debit Note (`DN`) is edited to a different amount, soft-deleted to the Recycle Bin, or restored from the Recycle Bin, the linked Supplier Bill's `amount_paid`, `credit_applied_amount`, `balance_due`, and `payment_status` are not recomputed.

### Planned Upgrades
1. **Deterministic `recalculateWorkspaceSupplierBillBalances(workspaceId, targetBillIds?)` Engine:**
   - Add a single source-of-truth recalculation method in `ProcurementRepository` that inspects all active (non-deleted) `payment_voucher` and `debit_note` / `material_return_note` documents in the workspace:
     - **Total Paid (`amount_paid`):** Sums `allocated_bills` entries matching `bill.id` (or `bill.bill_number` / `vendor_invoice_no`) plus direct single-bill `PV` links (`payment_voucher_metadata.supplier_bill_id === bill.id`) across all non-deleted `PV` documents.
     - **Total Credit Applied (`credit_applied_amount`):** Sums `credit_claim_amount` (or `grand_total`) across all non-deleted `DN` documents where `vendor_return_metadata.supplier_bill_id === bill.id` or `vendor_invoice_no === bill.vendor_invoice_no`.
     - **Balance Due & Status:** Recomputes `balance_due = max(0, roundCurrency(grand_total - credit_applied_amount - amount_paid))` and sets `payment_status` (`unpaid` | `partially_paid` | `paid`).
2. **Lifecycle Triggers Across Save, Edit, Delete & Restore:**
   - Replace additive mutations in `applyPaymentVoucherAllocationsToBills` and `applyDebitNoteCreditToBill` with deterministic recalculation after persisting the `PV` or `DN`.
   - Hook `QuotationRepository.deleteQuotation`, `restoreQuotation`, and `permanentlyDeleteQuotation` so that deleting or restoring a `PV` or `DN` automatically recalculates affected Supplier Bills.

---

## Workstream 3: Recycle Bin Coverage for Supplier Bills & Cloud Storage Orphan Scanner Protection
**Files:** `src/components/TrashBinModal.tsx`, `src/services/repositories/ProcurementRepository.ts`, `src/components/SettingsHub.tsx`, `src/services/attachmentStorage.ts`

### Audit Findings
- `ProcurementRepository.deleteSupplierBill` performs a soft delete (`is_deleted: true`), but `TrashBinModal.tsx` has no `Supplier Bills` tab to view, restore, or permanently purge deleted Supplier Bills.
- **Critical Bucket Data-Loss Risk:** In `SettingsHub.tsx`, the "Scan & Purge Orphaned Bucket Files" utility collects active URLs from Enquiries, Quotations, Products, Projects, and Workspace Branding, but **omits `supplier_bills` (`bill.attachment.url`)**. Running the orphan scanner would mistakenly classify active Supplier Bill invoice PDFs as orphaned files and delete them from the cloud bucket!

### Planned Upgrades
1. **Protect Active Supplier Bill Attachments in Orphan Scanner (`SettingsHub.tsx`):**
   - Include all workspace `supplier_bills` (both active and soft-deleted in Recycle Bin) when building the `referencedUrls` set before scanning and purging orphaned cloud bucket files.
2. **Add `Supplier Bills` Tab to `TrashBinModal.tsx`:**
   - Add `getDeletedSupplierBills(workspaceId)` and `restoreSupplierBill(billId)` to `ProcurementRepository`.
   - Add a `Supplier Bills` category tab in `TrashBinModal.tsx` showing Bill #, Vendor Name, Vendor Invoice #, Grand Total, and Deleted timestamp.
   - Support **Restore** (restores the bill and runs deterministic balance recalculation) and **Permanent Purge** (deletes `bill.attachment` from the cloud storage bucket via `deleteFromStorageBucket` and removes the Firestore/local record).

---

## Workstream 4: Event-Driven Pub/Sub & Optional `onSnapshot` Sync (Eliminating 4-Second Polling)
**Files:** `src/services/repositories/QuotationRepository.ts`, `src/services/repositories/ProcurementRepository.ts`

### Audit Findings
- Both `QuotationRepository.subscribe` and `ProcurementRepository.subscribe` currently use `window.setInterval(load, 4000)`, firing full Firestore `getDocs` queries every 4 seconds whenever `ProcurementPayablesHub` or `CompanyDetailView` is mounted. This burns Firestore read quota rapidly even when no data changes.

### Planned Upgrades
1. **In-Memory Pub/Sub + Optional Real-Time `onSnapshot` Listener:**
   - Replace the 4-second `setInterval` polling loop in both `QuotationRepository` and `ProcurementRepository` with:
     - Immediate initial hydration + an internal workspace event bus (`notifySubscribers(workspaceId)`) that fires instantaneously whenever any quotation, PO, PV, MRN/DN, GRN, or Supplier Bill is created, updated, deleted, or restored.
     - Optional Firestore `onSnapshot` listener (when `localStorage.getItem('sas_quota_saver_mode') !== 'true'`) with automatic graceful fallback to local cache + event-driven updates if offline or in Quota Saver mode.

---

## Workstream 5: UI/UX Polish, Procurement Rollup Consistency & Guardrail Verification
**Files:** `src/components/ProcurementPayablesHub.tsx`, `src/components/EnquiryDetail.tsx`, `src/components/ProjectRegistry.tsx`, `src/components/quotations/QuotationDocument.tsx`

### Planned Upgrades
1. **Strict Revenue & Revision Guardrail Verification:**
   - Ensure outbound `PO`, `PV`, `MRN`, and `DN` documents saved from either `EnquiryDetail` or `ProcurementPayablesHub` never overwrite `enquiries.value_aed`, `quoted_amount`, or client `QT` revision numbers.
2. **GRN Reverse / Stock Rollback Safety on PO or Bill Edits:**
   - Ensure that editing a PO's metadata or notes in `QuotationStudioModal` preserves its existing `received_qty_by_line`, `grn_history`, and `receiving_status` so prior GRN receipts are never accidentally wiped when re-saving a PO in Studio.
3. **Viewport & Overflow Polish (`<HoverScrollText />`):**
   - Apply `<HoverScrollText />` to long vendor names, invoice references, and subject columns in `ProcurementPayablesHub` and `TrashBinModal` so tables remain 100% horizontal-scroll-free at default zoom.
