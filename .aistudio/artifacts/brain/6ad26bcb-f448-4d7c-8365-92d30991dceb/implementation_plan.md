# Forensic UI/UX & Standardization Remediation Plan (UX-C1 through UX-L1)

## 1. Executive Summary & Preservation Mandate
This plan resolves all 15 UI/UX, metadata-binding, layout, RBAC confidentiality, dark-mode contrast, and standardization defects identified in the forensic audit (**UX-C1 through UX-L1**) while strictly preserving 100% of the Company Code, Country Code, Quick-Resolve Modal, and Sequence Engine work completed in the previous run.

---

## 2. Critical Studio & A4 Canvas Bindings (UX-C1 & UX-C2)

### UX-C1: Synchronize Disconnected Right Inspector Keys Across All 7 Modular Blocks
We will implement **dual-write** in `src/components/quotations/QuotationStudioModal.tsx` (lines ~19038–20075) and **fallback-read** in `src/components/quotations/QuotationDocument.tsx` (lines ~5632–6272) across all 7 modular blocks:
1. **`do_dispatch_party`**:
   - Sync `vehicle_number` $\leftrightarrow$ `vehicle_plate_no`
   - Sync `driver_contact` $\leftrightarrow$ `driver_phone`
2. **`do_receiving_party`**:
   - Sync `received_by_designation` $\leftrightarrow$ `received_by_title`
3. **`vendor_return_claim`**:
   - Sync `returned_by_title` $\leftrightarrow$ `dispatched_by_title`
   - Sync `carrier_details` $\leftrightarrow$ `carrier_or_vehicle` / `vehicle_or_courier`
4. **`vendor_return_ack`**:
   - Sync `vendor_signatory_name` $\leftrightarrow$ `received_by_vendor` / `accepted_by_vendor_name`
   - Sync `credit_note_ref` $\leftrightarrow$ `vendor_credit_note_no`
5. **`pv_treasury_details`**:
   - Sync `transaction_ref` $\leftrightarrow$ `utr_or_cheque_no` / `bank_txn_ref`
   - Sync `paid_from_bank_name` $\leftrightarrow$ `disbursing_bank_name` / `disbursing_bank_label`
   - Wire the 4 visibility checkboxes (`show_pv_method` $\leftrightarrow$ `show_payment_mode`, `show_pv_bank` $\leftrightarrow$ `show_disbursing_account`, `show_pv_tx_ref` $\leftrightarrow$ `show_utr_ref`, and `show_pv_po_ref`) so toggling them in the Right Inspector updates the A4 canvas live.
6. **`pv_beneficiary_details`**:
   - Sync `beneficiary_bank_details.account_name` $\leftrightarrow$ `beneficiary_name`
   - Sync `beneficiary_bank_details.swift` $\leftrightarrow$ `beneficiary_bank_details.swift_code`
7. **`pv_approval_matrix`**:
   - Honor `blockConfig.visibleFields?.col1..col4` alongside `pvMeta?.approval_columns[idx].visible`
   - Honor `pvMeta?.col1_heading..col4_heading` alongside `approval_columns[idx].label`
   - Read `verified_by_name` (for Column 2) and `received_by_name` (for Column 4) alongside `approval_columns` signatory fields.

### UX-C2: Fix Typography & Color Overrides for Modular Blocks (`renderBlocksGrid`)
- **File**: `src/components/quotations/QuotationDocument.tsx` (`renderBlocksGrid`, lines ~6470–6490)
- **Fix**: Resolve `blockElemFmt` by checking both `resolvedRecipientConfig.elementStyles?.[\`block:${b.id}\`]` AND the legacy mapped key:
  - `do_dispatch_party` $\rightarrow$ `'do_signoff_left'`
  - `do_receiving_party` $\rightarrow$ `'do_signoff_right'`
  - `vendor_return_claim` $\rightarrow$ `'return_signoff_left'`
  - `vendor_return_ack` $\rightarrow$ `'return_signoff_right'`
  - `pv_treasury_details` $\rightarrow$ `'pv_treasury_card'`
  - `pv_beneficiary_details` $\rightarrow$ `'pv_beneficiary_card'`
  - `pv_approval_matrix` $\rightarrow$ `'pv_approval_matrix'`
- Merge any custom font family, size, weight, color, and alignment overrides so Right Inspector typography controls apply immediately on the A4 canvas.

---

## 3. Enquiries Registry Layout, RBAC Confidentiality & Dark Mode (UX-C3, UX-C4, UX-H1, UX-H3)

### UX-C3 & UX-H1: Fix `table-fixed` Column Overflow & Metadata Wrapping (`EnquiryList.tsx`)
- Rebalance the 8 column widths in `src/components/EnquiryList.tsx` to prevent cell collisions while maintaining 100% viewport fit:
  - `S/N`: `w-[5%]`
  - `Company Account`: `w-[23%]`
  - `Quote Ref No`: `w-[19%]`
  - `Rep`: `w-[6%]`
  - `Received Date`: `w-[10%]`
  - `Status`: `w-[14%]`
  - `Enquiry Value`: `w-[12%]`
  - `Actions`: `w-[11%]`
- Add `overflow-hidden` to every `<td>` cell in `EnquiryRow`.
- Add `truncate` to the secondary metadata sub-line under `Enquiry Value` (`4 items · 2 files...`).
- Replace `overflow-hidden whitespace-nowrap` on the status timestamp with `truncate` (`overflow-hidden text-ellipsis whitespace-nowrap`).

### UX-C4: Gate Confidential Supplier Costs & Profit Margins Behind Admin/Manager RBAC
- **Files**: `src/components/EnquiryList.tsx` and `src/components/ProductManager.tsx`
- **Fix**: Compute `const canViewConfidentialMargins = canManageWorkspace(user, activeWorkspace) || isAdmin(user, activeWorkspace?.id, activeWorkspace);` and gate `{marginPct}% margin` in `EnquiryList.tsx` and `Landed: ...` cost badges in `ProductManager.tsx` behind `canViewConfidentialMargins`.

### UX-H3: Dark Mode Contrast Parity (`ProductManager.tsx`, `EnquiryList.tsx`, `EnquiryDetail.tsx`)
- Add explicit `dark:bg-slate-900`, `dark:border-slate-800`, `dark:text-slate-100`, `dark:text-slate-300`, and `dark:hover:bg-slate-800/60` pairs across `ProductManager.tsx` cards/tables/headers and audit remaining light-only surfaces in `EnquiryList.tsx` and `EnquiryDetail.tsx`.

---

## 4. High & Medium Priority Refinements (UX-H2, UX-H4, UX-H5, UX-M1 to UX-M5, UX-L1)

### UX-H2: Fix Half-Width Grid Crushing on `pv_approval_matrix` (`QuotationDocument.tsx`)
- In `renderPvApprovalMatrixBlock`, check `const isHalfWidth = blockConfig.placement === 'left' || blockConfig.placement === 'right';`.
- When `isHalfWidth && visibleApprovalCols.length > 2`, use `'grid-cols-2'` instead of `'grid-cols-4'` so signatory boxes stack cleanly in a $2 \times 2$ grid without crushing horizontal width.

### UX-H4: Prune Dead Legacy Renderer Functions (`QuotationDocument.tsx`)
- Remove unmounted legacy `renderDeliveryNoteSignOffBlock` and `renderVendorReturnSignOffBlock` functions and unused `pvTreasuryFmt` / `pvBenFmt` / `pvMatrixFmt` local variables in `QuotationDocument.tsx`.

### UX-H5: Require Confirmation Before Soft-Deleting Procurement Records (`ProcurementPayablesHub.tsx`)
- Add a clean custom confirmation modal in `src/components/ProcurementPayablesHub.tsx` before soft-deleting Supplier POs, Supplier Bills, or Payment Vouchers / Returns when clicking the trash icon, displaying the record reference and type before committing deletion.

### UX-M1: Fix Direct Print Portal Missing Props & Stale DOM (`EnquiryDetail.tsx`)
- Pass `bankAccount={workspaceBankAccounts.find(b => b.id === viewingQuotation.selected_bank_account_id) || workspaceBankAccounts.find(b => b.isDefault) || workspaceBankAccounts[0] || null}`, `salespersons={salespersons}`, and `layoutBlocks={viewingQuotation.layout_blocks}` to `<QuotationDocument>` inside `#quotation-print-portal`.
- Clear `viewingQuotation` automatically after printing (`window.addEventListener('afterprint', ...)` / cleanup timeout).

### UX-M2: Remove Redundant Inner Action Buttons in Commercial Documents Hub (`EnquiryDetail.tsx`)
- Remove the duplicate `[Create Revision]` and `[Open Quotation Studio]` buttons inside the `Commercial Documents Hub` card header in `src/components/EnquiryDetail.tsx`, keeping the hub header clean with its title, document count badge, and `+ Generate Auxiliary Doc` dropdown.

### UX-M3: Eliminate Double Firestore Counter Read & Fix Rep Initials Fallback (`EnquiryForm.tsx`)
- In `src/components/EnquiryForm.tsx`, prevent the secondary `useEffect` from re-fetching `previewNextEnquiryRef` on initial mount when `initialMountRef` has already triggered it, and ensure `repInitials` falls back to `salesPerson.trim().slice(0, 3).toUpperCase()` when `selectedSp` is undefined. Preserve all Company Code / Country Code / Quick-Resolve functionality.

### UX-M4: Add Search Result Counter & Pagination (`ProcurementPayablesHub.tsx` & `ProjectRegistry.tsx`)
- Add `<SearchResultCounter>` and pagination controls (default **25 rows per page** with a **25 / 50 / 100** page-size selector and Prev/Next navigation) to `ProcurementPayablesHub.tsx` and `ProjectRegistry.tsx`.

### UX-M5: Close `··· More Actions` Dropdown on Escape Key (`EnquiryDetail.tsx`)
- In `src/components/EnquiryDetail.tsx`, update the `Escape` keydown handler to close `isMoreActionsOpen` first (calling `e.stopPropagation()`) before closing the drawer.

### UX-L1: Neutralize Hardcoded `"ANRW Corporate"` Preset Button (`SettingsHub.tsx` & `WorkspaceDocumentProfileSettings.tsx`)
- Rename the `"ANRW Corporate"` preset button in `src/components/SettingsHub.tsx` to `"Corporate Slash"` using dynamic workspace initials (`(activeWorkspace?.name || 'CORP').slice(0, 4).toUpperCase()`) instead of hardcoded `'ANRW'`, and verify `src/components/WorkspaceDocumentProfileSettings.tsx` has no hardcoded tenant strings.
