# Full-System Stabilization, Security & UI/UX Polish Plan

## 1. Executive Summary & User Decisions Alignment
This plan details the execution across all 5 workstreams to eliminate runtime hook violations, upgrade Gemini model cascades to valid production IDs with static-deployment fallbacks, harden IndexedDB & offline sync mutations, enforce strict multi-tenant workspace query isolation, refine RBAC & sequence baselines, and polish the Enquiry History Audit Trail and Won Quotation-to-Project handoff:

- **Enquiry History Audit Trail (`EnquiryDetail.tsx`)**: Hide internal system metadata fields (`updated_at`, `updatedAt`, `created_at`, `createdAt`, `version`, `sync_status`, `workspace_id`, `workspaceId`, etc.), filter out no-op `null -> null` diffs, deduplicate alias fields (e.g., `salesperson` / `sales_person`), and display only business fields with human-readable labels.
- **Won Quotation / Enquiry to Project Conversion Handoff (`EnquiryDetail.tsx` & `projectService.ts`)**: When a multi-option quotation or enquiry (`Option A`, `Option B`, etc.) is marked Won or converted to a Project, prompt the user to select the **winning option** so only the confirmed option's items (plus `Default / Included` baseline items) transfer into the Project scope and warehouse stock reservation.
- **Activity & Call Log Synchronization (`CallLogRepository.ts` & `EnquiryDetail.tsx`)**: Dual-write and synchronize mutations across both `activity_logs` and `call_logs` collections, and replace `ActivityLogRepository.saveLocalOnly` with `ActivityLogRepository.save` when issuing formal quotations.

---

## 2. Workstream 1: Critical Runtime Fixes, Gemini Model Upgrade & `App.tsx` Leaks

### 1.1 Fix React Rules of Hooks Violation in `QuotationStudioModal.tsx`
- **File**: `src/components/quotations/QuotationStudioModal.tsx`
- **Fix**: Wrap the modal body in an outer guard component (`QuotationStudioModal`) that checks `if (!props.isOpen) return null; return <QuotationStudioModalInner {...props} />;` so that `QuotationStudioModalInner` executes all `useState`, `useMemo`, `useCallback`, `useRef`, and `useEffect` hooks unconditionally on every render.

### 1.2 Upgrade Gemini Models & Client-Side Quick Assist Fallback
- **Files**:
  - `src/utils/aiExtractionClient.ts`
  - `server.ts`
  - `src/components/EnquiryForm.tsx`
  - `src/components/SettingsHub.tsx`
  - `src/components/QuickActivityDrawer.tsx`
- **Changes**:
  - Replace non-existent Gemini 3.x IDs (`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`) in `AVAILABLE_GEMINI_MODELS`, `DEFAULT_MODEL_CASCADE`, `server.ts` `modelsPool`, and `EnquiryForm.tsx` model selector dropdown with valid production models:
    - `['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']`
  - In `server.ts`, update `retryWithBackoffAndFallback` so `isTransient` also triggers model fallback on `404` / `NOT_FOUND` / `no longer available` errors in addition to `503` and `429`.
  - In `src/components/SettingsHub.tsx`, update the API key verification test model from `'gemini-1.5-pro'` to `'gemini-2.5-flash'`.
  - Add `quickAssistClientSide(apiKey, payload)` in `src/utils/aiExtractionClient.ts` supporting both `summarize_notes` and `draft_whatsapp` actions, and wire `src/components/QuickActivityDrawer.tsx` to fall back to `quickAssistClientSide` automatically when `/api/gemini/quick-assist` returns `404`/`502`/`503` or fails on static deployments.

### 1.3 Fix Listener Leaks, Visibility Scope & Blob URL Revocation
- **Files**: `src/App.tsx`, `src/components/EnquiryForm.tsx`
- **Changes**:
  - Remove the duplicate `useEffect` localStorage caching block in `src/App.tsx` (lines 1099–1105).
  - Add `workspaceMembers: (() => void) | null` to `activeUnsubscribersRef` and ensure `cleanupAllListeners` and workspace listener teardown always unsubscribe `refs.workspaceMembers`.
  - Update `visibleEnquiries` and `visibleCallLogs` `useMemo` hooks in `src/App.tsx` to check `dataVisibilityScope === 'ALL_DATA'` (`if (!user || isCurrentUserWorkspaceAdmin || dataVisibilityScope === 'ALL_DATA') return active;`) and include `dataVisibilityScope` in their dependency arrays.
  - In `src/components/EnquiryForm.tsx`, track object URLs in `dataUrlBlobCache` and revoke them (`URL.revokeObjectURL`) on unmount or attachment removal.

---

## 3. Workstream 2: Offline Sync Engine, IndexedDB v4 Stores & Multi-Tenant Query Isolation

### 2.1 Prevent Infinite Re-Enqueue Loops in `SyncEngine.ts`
- **File**: `src/services/SyncEngine.ts`
- **Changes**:
  - In `processQueue()`, call raw Firestore SDK functions (`setDoc(doc(db, item.entity, item.docId), cleanData, { merge: true })`, `updateDoc(doc(db, item.entity, item.docId), cleanData)`, and `deleteDoc(doc(db, item.entity, item.docId))`) instead of `safeSetDoc`/`safeUpdateDoc`/`safeDeleteDoc` so network/quota errors throw cleanly into `processQueue()`'s `catch` block without re-enqueuing duplicate mutations.
  - In the `catch` block, when `item.retryCount <= 10`, persist the updated `retryCount` via `await enqueueLocalMutation(item)` before breaking out of the loop.

### 2.2 Upgrade IndexedDB (`db.ts`) to Version 4 & Promise-Backed Transactions
- **File**: `src/services/db.ts`
- **Changes**:
  - Bump `DB_VERSION` to `4` and include `'quotations'`, `'quotation_presets'`, `'workspace_document_profiles'`, and `'projects'` in both `onupgradeneeded` and `clearAllLocalStores`.
  - Update `saveToLocalStore`, `enqueueLocalMutation`, `removeLocalMutation`, `clearAllLocalStores`, `saveAttachmentBlob`, and `deleteAttachmentBlob` so each `readwrite` transaction awaits `tx.oncomplete` and rejects on `tx.onerror` / `tx.onabort`.

### 2.3 Enforce Multi-Tenant Workspace Query Isolation
- **Files**:
  - `src/services/repositories/QuotationRepository.ts`
  - `src/services/projectService.ts`
  - `src/services/repositories/MetadataRepository.ts`
  - `src/services/AccountDeletionService.ts`
- **Changes**:
  - Add `where('workspace_id', '==', workspaceId)` (and dual `workspaceId` fallback where appropriate) to `getDeletedQuotations`, `getQuotationsForWorkspace`, `getPresets`, `getWorkspaceDocumentProfile`, `generateNextProjectNumber`, `getProjectForEnquiry`, `getWorkspaceProjects`, `fetchProductsOnce`, and `fetchAuditLogsOnce`.
  - In `src/services/AccountDeletionService.ts`, replace all `.forEach((d) => safeAddBatchOp(...))` calls with `for (const d of snap.docs) { await safeAddBatchOp(...); }` so batch commits at 350 operations never race.

---

## 4. Workstream 3: RBAC Permissions, Sequence Baselines, Outcomes & Activity Dual-Write Sync

### 3.1 Workspace Owner & SuperAdmin Resolution in `permissions.ts`
- **File**: `src/utils/permissions.ts`
- **Changes**:
  - In `getEffectiveWorkspaceRole`, check `if (isSuperAdmin(currentUser)) return 'admin';` and verify workspace ownership (`activeWorkspace?.owner_uid === currentUserId || activeWorkspace?.owner_id === currentUserId || activeWorkspace?.created_by_uid === currentUserId || activeWorkspace?.created_by === currentUserId || (currentUserEmail && activeWorkspace?.created_by?.toLowerCase() === currentUserEmail)`) before falling back to `'member'`.

### 3.2 Quotation Acceptance Status & Activity/Call Log Dual-Write Synchronization
- **Files**:
  - `src/services/repositories/EnquiryRepository.ts` & `src/services/__tests__/EnquiryRepository.test.ts`
  - `src/services/repositories/CallLogRepository.ts`
  - `src/components/EnquiryDetail.tsx`
- **Changes**:
  - In `EnquiryRepository.syncAcceptedQuotation`, set `const newStatus = 'Won / Approved';` (and update corresponding unit tests) to match `ENQUIRY_STATUS_OPTIONS` and `PIPELINE_STATUS_GROUPS.WON`.
  - In `CallLogRepository.ts` (`ActivityLogRepository`), ensure `save()`, `update()`, `softDelete()`, `restore()`, and `purgePermanent()` dual-write to both `'activity_logs'` and `'call_logs'` local stores and sync queues.
  - In `EnquiryDetail.tsx`, replace `await ActivityLogRepository.saveLocalOnly(...)` with `await ActivityLogRepository.save(...)` when a formal quotation is marked as `Sent`.

### 3.3 Unified Outcomes, Sequence Baselines & CSV / Ref ID Hardening
- **Files**:
  - `src/utils/activityLogic.ts`
  - `src/services/enquirySequences.ts`
  - `src/utils/exportUtils.ts`
  - `src/utils/refId.ts`
- **Changes**:
  - Align `POSITIVE_OUTCOMES`, `NEUTRAL_OUTCOMES`, and `NEGATIVE_OUTCOMES` in `src/utils/activityLogic.ts` with `UNIFIED_OUTCOME_GROUPS` in `src/utils/defaults.ts` while retaining backward compatibility with legacy outcome strings.
  - In `src/services/enquirySequences.ts`:
    - Update `getWorkspaceActiveCeilings` to accept `resetCadence` and `referenceDate` so `maxSeq` only considers enquiries within the active period when `resetCadence` is `'monthly'` or `'yearly'`.
    - Fix `claimNextEnquirySequence` so an admin-configured baseline (`counters.lastSnNumber` / `baseSeq`) is preserved (`Math.max(counters.lastSnNumber || 0, maxSn)` and `Math.max(baseSeq, maxSeq)`) rather than clamped down when an admin sets a higher starting sequence baseline.
  - In `src/utils/exportUtils.ts`, prefix cell strings starting with `=`, `+`, `-`, or `@` with a single quote (`'`) inside `escapeCsvCell` to prevent CSV formula injection.
  - In `src/utils/refId.ts`, fix `getReferenceId` fallback sequence calculation so items without explicit numbers increment cleanly above `maxExplicitNum` without colliding.

---

## 5. Workstream 4 & 5: Enquiry History Audit Trail Cleanup & Multi-Option Project Conversion Handoff

### 4.1 Enquiry History Tab Audit Trail Cleanup (`EnquiryDetail.tsx`)
- **File**: `src/components/EnquiryDetail.tsx`
- **Changes**:
  - Add a dedicated audit diff normalizer for the `History` tab (`Enquiry Revision Registry & Audit Trail`):
    - **Hide System Metadata**: Exclude internal system keys (`updated_at`, `updatedAt`, `created_at`, `createdAt`, `version`, `sync_status`, `workspace_id`, `workspaceId`, `id`, `_id`, `search_terms`, `statusUpdatedAt`, `statusUpdatedBy`, `statusHistory`, `last_modified_by_uid`, `last_modified_by_name`).
    - **Eliminate No-Op Diffs**: Filter out entries where both `old_value` and `new_value` normalize to empty (`null`, `undefined`, `""`, `[]`, `{}`) or are semantically identical.
    - **Deduplicate Alias Pairs**: Deduplicate canonical field groups (`salesperson` / `sales_person` / `assignedSalesperson` / `assigned_to`, `value_aed` / `package_value` / `quoted_amount`, `project_location` / `location`, `contact_person_name` / `concerned_person` / `contact_name`) so a single change only renders one diff card.
    - **Human-Readable Business Labels**: Map snake_case and camelCase keys to clean labels (`Salesperson`, `Source Text`, `Package Value (AED)`, `Est. Order Date`, `Line Items`, `Quote Ref No.`, `Company Name`, `Project Location`, `Client Reference`, etc.) and format complex values (such as `line_items` counts/totals or booleans) cleanly instead of raw JSON dumps.

### 4.2 Winning Option Prompt on Quotation Acceptance & Project Conversion (`EnquiryDetail.tsx` & `projectService.ts`)
- **Files**: `src/components/EnquiryDetail.tsx`, `src/services/projectService.ts`, `src/services/inventoryService.ts`
- **Changes**:
  - When accepting a quotation (`promptAcceptQuotation`) or converting a Won enquiry to a Project (`ConvertToProjectModal` / `createProjectFromEnquiry`) on an enquiry/quotation that contains multiple distinct option groups (e.g., `Option A`, `Option B`):
    - Present a clean **Select Winning Option** selector in the confirmation modal (listing detected options such as `Option A`, `Option B`, etc. with their respective option totals, plus an `All Options` choice if needed).
    - Pass `selectedWinningOption` into `reserveEnquiryStock(enquiry, user, { selectedOption })` and `createProjectFromEnquiry(enquiry, user, { ...options, selectedOption })` so that only the confirmed option's line items (along with `Default / Included` baseline items) are transferred into the Project deliverables and reserved from warehouse inventory, and update the enquiry's `value_aed` to match the winning option's total.
  - Verify all TypeScript types (`tsc --noEmit`), linter checks, and unit tests pass with zero errors.
