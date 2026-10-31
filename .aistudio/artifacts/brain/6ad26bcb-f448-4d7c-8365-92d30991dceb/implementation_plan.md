# Implementation Plan: Permissions, Sequence Integrity, Operations Overhaul & UI/UX Standardization

## Overview
This plan details the architecture, data model extensions, and UI/UX upgrades across **Part A** (Permissions, Sequence Integrity, Team Roster & Projects Overhaul) and **Part B** (App-Wide Layout, Table Fit, Text Editors & Visual Standardization), incorporating your confirmed preferences:
1. **Creator Hand Over Scope**: Releasing creator-only access on an enquiry (`creator_access_released: true`) releases creator-only visibility on **both** the enquiry and any call logs linked to that enquiry.
2. **Project Soft-Delete Behavior**: Moving a Project to the Recycle Bin automatically releases any reserved warehouse stock and unlinks `project_id` / `project_number` from the parent Enquiry while keeping the parent Enquiry's commercial status unchanged.
3. **Team Roster Deduplication**: Duplicate `Salesperson` records in a workspace are both **auto-merged on workspace load** and cleanable on demand via a **1-Click Deduplicate Roster** button in Team Settings.

---

## Part A: Permissions, Sequence Integrity, Team Roster & Projects Overhaul

### 1. Sequence Integrity & Workspace-Wide Occupied S/N Tracking (`src/App.tsx`, `src/components/EnquiryList.tsx`)
- **Workspace Occupied S/N Set (`src/App.tsx`)**:
  - Compute `occupiedWorkspaceSns: Set<number>` across all non-deleted `workspaceEnquiries` (`!e.is_deleted`) **before** role/member visibility filtering (`visibleEnquiries`).
  - Pass `occupiedWorkspaceSns` down as a prop to `<EnquiryList />`.
- **Accurate Gap Detection (`src/components/EnquiryList.tsx`)**:
  - Update `GapDetectorRow` to filter candidate numbers between `curSn + 1` and `prevSn - 1` against `occupiedWorkspaceSns`, collecting only sequence numbers that are **genuinely unoccupied across the entire workspace**.
  - If all sequence numbers between two visible rows are already occupied by other reps' enquiries, render `null` (zero false-positive `Missing Sequence` banners for standard members).
  - When genuinely unoccupied S/Ns exist in that interval, display the exact missing S/N(s) (e.g., `#42` or `#42 – #44`) and pass the first genuinely unoccupied S/N (`firstMissingSn`) to `onFillGap`.
  - Guard `handleFillGap(missingSn)` against `occupiedWorkspaceSns.has(missingSn)` so a gap-fill action can never claim an S/N already used in the workspace.
  - Constrain the `Missing Sequence` banner flex container (`w-full max-w-full overflow-hidden justify-between gap-3 px-4 py-2`) with `shrink-0` on the right-hand `Fill Gap (#SN)` button so it never clips off the right edge of the table.

---

### 2. Creator Visibility Indicator & 1-Click Ownership Hand Over (`src/types.ts`, `src/utils/permissions.ts`, `src/App.tsx`, `src/components/EnquiryList.tsx`, `src/components/EnquiryDetail.tsx`)
- **Schema Extension (`src/types.ts`)**:
  - Add `creator_access_released?: boolean` and `creator_access_released_at?: string` to `Enquiry`.
- **RBAC & Call Log Visibility (`src/utils/permissions.ts`, `src/App.tsx`)**:
  - Update `isEnquiryCreator(user, enquiry)` (and `canAccessEnquiry`, `canEditEnquiry`, `canDeleteEnquiry`) so that when `enquiry.creator_access_released === true`, creator-based access evaluates to `false`. The user will only retain access if they are the assigned salesperson (`isEnquirySalesperson`), an explicit collaborator (`isEnquiryCollaborator`), or a Workspace Admin.
  - Add helper `isCreatorOnlyViewer(user, workspace, enquiry, salespersons)` that returns `true` when a non-admin user has access to `enquiry` **solely** because they logged/created it (`isEnquiryCreator` is true, while `isEnquirySalesperson` and `isEnquiryCollaborator` are false, and `!enquiry.creator_access_released`).
  - In `src/App.tsx` (`visibleCallLogs`), build a lookup map of `workspaceEnquiries` by ID / S/N / quote ref; if a call log is linked to an enquiry that has `creator_access_released === true`, ignore creator-only matching (`created_by_uid` / `logged_by`) unless the user is the assigned salesperson or collaborator on that enquiry.
- **UI Badge & 1-Click Hand Over (`src/components/EnquiryList.tsx`, `src/components/EnquiryDetail.tsx`)**:
  - In `EnquiryList.tsx` (under the Salesperson badge cell), if `isCreatorOnlyViewer` is true, render a compact badge: `Logged by You` (amber/slate pill with tooltip explaining why the record is visible).
  - In `EnquiryDetail.tsx` (in the top header bar and inside the `Team Access` card), when `isCreatorOnlyViewer` is true (or when the creator is viewing a record assigned to another rep), display a `Logged by You (Assigned to [Rep])` banner with a 1-click **Hand Over to Assigned Rep** button.
  - Clicking **Hand Over to Assigned Rep** persists `{ creator_access_released: true, creator_access_released_at: new Date().toISOString() }` to Firestore/local state, closes the detail drawer if the user no longer has access, and triggers a confirmation toast.

---

### 3. Team Roster Deduplication & Deal Metrics Accuracy (`src/App.tsx`, `src/components/UserManagementHub.tsx`, `src/components/SalespersonProfiles.tsx`)
- **Prevent Duplicate Auto-Provisioning (`src/App.tsx`)**:
  - In the silent salesperson auto-provisioning `useEffect` (`src/App.tsx`), match existing workspace `Salesperson` records not only by `uid` / `linked_user_id` / `email`, but also by normalized `full_name` (`trim().toLowerCase()`) or matching `initials` when the existing profile has no conflicting `linked_user_id`.
  - When an unlinked profile matches by name or initials, update that existing `Salesperson` record in place with `uid`, `linked_user_id`, and `email` instead of creating a duplicate `sp_${wsId}_${userUid}` document.
- **Auto-Merge on Load + 1-Click Deduplicate Button (`src/App.tsx`, `src/components/SalespersonProfiles.tsx`, `src/components/UserManagementHub.tsx`)**:
  - Create a shared utility `deduplicateWorkspaceSalespersons(salespersons, activeWorkspaceId, activeWorkspace)` that groups workspace `Salesperson` records by normalized `full_name` (and exact `initials` + same first/last name), elects the primary record (preferring the record with `linked_user_id`, `email`, `phone`, and non-default `role`), merges any missing fields (`email`, `phone`, `role`, `linked_user_id`, `uid`), updates `workspace.members` / `workspace_members` `linked_salesperson_id` references if needed, and removes the redundant duplicate document via `MetadataRepository.deleteSalesperson` / `safeDeleteDoc`.
  - Run this deduplication automatically once per workspace load when duplicate profiles are detected, and expose a **Deduplicate Roster** button in `SalespersonProfiles.tsx` and `UserManagementHub.tsx` whenever duplicates exist.
- **Fix Active Deals Counter in Team & Access (`src/components/UserManagementHub.tsx`)**:
  - Update `getActiveRecordsForMember` so `ACTIVE DEALS` only counts non-deleted, non-released active enquiries where the member is the **assigned salesperson** (matching their linked `Salesperson` `id`, `initials`, or `full_name`, or `salesperson_id === member.uid`) and the status is not Lost/Cancelled/Dead—removing the `e.created_by_uid === member.uid` check that falsely inflated admin/creator deal counts.
- **Fix Win/Loss Pipeline Metrics & Heading Clip (`src/components/SalespersonProfiles.tsx`)**:
  - Update `getSalespersonMetrics` to use canonical status helpers (`isWonStatus(e.status)` and `isLostOrCancelledStatus(e.status)`) so all Won statuses (`Won`, `Order Received`, `Approved`) and Lost statuses (`Lost`, `Cancelled`) are accurately counted in `wonDeals`, `wonRevenue`, `lostDeals`, and `winRate`.
  - Fix the selected salesperson header in `SalespersonProfiles.tsx` by increasing container top padding and using `leading-normal py-0.5` on the `h3` name heading so tall ascenders never clip.

---

### 4. Projects / Operations Module Overhaul (`src/types.ts`, `src/services/projectService.ts`, `src/components/ProjectRegistry.tsx`, `src/components/TrashBinModal.tsx`, `src/App.tsx`)
- **Soft-Delete Project & Automatic Stock Release (`src/types.ts`, `src/services/projectService.ts`, `src/components/ProjectRegistry.tsx`)**:
  - Add soft-delete metadata fields (`is_deleted?: boolean`, `deleted_at?: string`, `deleted_by_uid?: string`, `deleted_by_name?: string`) to `Project` in `src/types.ts`.
  - Filter out `p.is_deleted` in `getWorkspaceProjects`, `getProjectForEnquiry`, `ProjectRegistry.tsx`, and `App.tsx`.
  - Add a `Delete Project` (Move to Recycle Bin) button in both the `ProjectRegistry.tsx` table row actions and the Project detail modal footer/header.
  - On confirmation, `softDeleteProject`:
    1. Releases any reserved inventory for the parent enquiry via `releaseEnquiryStock(parentEnquiry, currentUser)`.
    2. Updates the parent enquiry (`project_id: null`, `project_number: null`, `stock_reserved: false`, `stock_reserved_at: null`) while **keeping the parent enquiry's commercial status unchanged**.
    3. Marks the project document with `is_deleted: true, deleted_at, deleted_by_uid, deleted_by_name`.
- **Recycle Bin Support for Projects (`src/components/TrashBinModal.tsx`, `src/App.tsx`)**:
  - Add a `Projects` tab (`'projects'`) to `TrashBinModal.tsx` so admins can inspect, **Restore**, or **Permanently Purge** soft-deleted projects.
- **Fix Duplicate Line Item Text in Project Modal (`src/components/ProjectRegistry.tsx`)**:
  - In `ProjectRegistry.tsx` (Scope of Supply & BOM table), compute `primaryTitle = (it.item_name || it.product_type || '').trim()` and `secondaryDesc = (it.description || '').trim()`. If `primaryTitle` is empty, use `secondaryDesc` as the bold title and do **not** render `secondaryDesc` a second time underneath. Also suppress `secondaryDesc` if `secondaryDesc.toLowerCase() === primaryTitle.toLowerCase()`.
- **Resolve Lead Engineer Display Name (`src/components/ProjectRegistry.tsx`)**:
  - Add helper `resolveEngineerDisplayName(rawName, engineerId)` in `ProjectRegistry.tsx` that matches against `salespersons` and `workspaceMembers` by ID, UID, email prefix, full name, or initials, formatting e.g. `pawan.verma` into `Pawan Verma (PV)`.
- **Editable Project Metadata, Custom Milestones & Quick Handoffs (`src/components/ProjectRegistry.tsx`)**:
  - Inside the Project detail modal, allow authorized users to edit **Lead Engineer** (dropdown of workspace team members + custom input), **Target Delivery Date**, **Site Location**, and **Operational Notes**, plus **Add / Rename / Delete Milestones** inline with instant Firestore persistence.
  - Add quick-action buttons in the Project modal header to **Open Source Enquiry** and **Issue Delivery Note (DO)** (opening Quotation Studio directly in `delivery_note` mode for the linked enquiry).

---

## Part B: App-Wide Layout, Table Fit, Text Editors & Visual Standardization

### 5. Enquiries Table 100% Zoom Fit & Reserved Gap Row Cleanup (`src/components/EnquiryList.tsx`)
- **Zero Horizontal Scroll at 100% Zoom**:
  - Optimize column paddings (`px-2.5 py-2.5`), compact badge widths, and action column spacing in `EnquiryList.tsx` so all columns (`S/N`, `Date`, `Client & Subject`, `Status & Stage`, `Value`, `Rep`, `Actions`) fit comfortably inside a standard desktop viewport at 100% zoom without horizontal scrolling or clipping the right-hand `Trash2` delete icon.
- **Clean Reserved Sequence Rows**:
  - When `isGapReservedRow` is true (`status === 'GAP / RESERVED'` or company name starts with `[Reserved Sequence`), hide `<GoogleSearchButton />`, `<TemperatureBadge />`, and `<IndustryBadge />`, and display a clean, structured badge `Reserved Sequence #{enquiry.sn}` with a `Complete Enquiry` action button.

---

### 6. Hover-to-Auto-Scroll for Long Titles & Labels (`src/components/common/HoverScrollText.tsx`)
- Create `src/components/common/HoverScrollText.tsx`:
  - Measures `scrollWidth > clientWidth` on mouse enter.
  - At rest, displays clean single-line `truncate` (`overflow-hidden text-ellipsis whitespace-nowrap`).
  - On hover (only when overflowing), smoothly translates horizontally (`transform: translateX(-${overflowPx}px)`) with a gentle CSS transition and resets on mouse leave.
- Apply `<HoverScrollText />` to single-line constrained labels across:
  - `EnquiryList.tsx` (company names and enquiry subjects)
  - `EnquiryDetail.tsx` (drawer company title, subject line, attachment filenames)
  - `ProductManager.tsx` (catalog product titles and descriptions)
  - `ProjectRegistry.tsx` (project client names and scope titles)
  - `UserManagementHub.tsx` & `SalespersonProfiles.tsx` (member names and email addresses)

---

### 7. Scrub Duplicate `+` Symbols on Icon Buttons
- Audit and remove literal `+ ` prefixes from button labels that already render a `<Plus />`, `<BookmarkPlus />`, `<UserPlus />`, or `<FilePlus />` icon across:
  - `src/components/EnquiryList.tsx` (e.g. `Fill Gap`, `Reserve Gap S/N`, `New Enquiry`)
  - `src/components/EnquiryDetail.tsx` (e.g. `Add Line Item`, `Add Attribute`, `Add Option`, `New Revision`)
  - `src/components/EnquiryForm.tsx` (e.g. `Add Item`, `Add Spec`, `Add Component`)
  - `src/components/quotations/QuotationStudioModal.tsx` (e.g. `Save as New Preset`, `Add Custom Block`, `Add Line`, `Add List Item`, `Add Field Row`)

---

### 8. Upgrade Text Editors Layout & Scrub Industry-Specific Placeholders (`src/components/EnquiryDetail.tsx`, `src/components/EnquiryForm.tsx`, `src/components/ProductManager.tsx`, `src/components/SaveToCatalogModal.tsx`, `src/components/quotations/QuotationStudioModal.tsx`)
- **100% Industry-Neutral Placeholders**:
  - Replace all remaining water-treatment / company-specific placeholders (`Pentair`, `Grundfos`, `Structural 30x72`, `Wave Cyber`, `Hydranautics`, `Seawater RO Membrane`, `SWC5-LD`, `RO Equipment`, `Nitin Srivastava`) across `ProductManager.tsx`, `EnquiryDetail.tsx`, `EnquiryForm.tsx`, `SaveToCatalogModal.tsx`, and `QuotationStudioModal.tsx` with universal B2B placeholders (`e.g. Acme Corp / Manufacturer`, `e.g. MDL-100 / Part No.`, `e.g. Industrial Control Module - Series X`, `e.g. Supply & Delivery of Commercial Equipment`).
- **Full-Width Line Item Description Editor (`src/components/EnquiryDetail.tsx`)**:
  - In the inline Line Items editor (`EnquiryDetail.tsx`), move `Country of Origin` and `HS Code` into the compact metadata row alongside Brand/Model/SKU, and give **Technical Description & Scope Notes** its own dedicated full-width (`col-span-12`) multi-row expandable textarea (`rows={3}`).
- **Quotation Studio Inspector & Toolbar Polish (`src/components/quotations/QuotationStudioModal.tsx`)**:
  - Remove the duplicate `[ Show Controls ]` button in the center preview toolbar (lines 8061–8070) since the top header bar already provides the primary `[ Show Controls ]` toggle right above it.
  - Consolidate `renderStandardTextToolbar` on `HEADING`, `RICH TEXT`, and `LIST` Lego pieces into a clean, compact single-row ribbon with inline compact selects for Color, Spacing, and Highlight so it doesn't stack into a tall multi-row box above every piece input.
  - Normalize specification attribute keys (`key.trim()`) with case-insensitive deduplication in `getItemAttributeKeys` and `availableAttributeKeys` (canonicalizing synonyms like `Brand` / `Brand / Make`) so duplicate attribute pills never appear.

---

### 9. Fix Product Catalog Header Overlap, Settings Tabs & Simplify Titles (`src/components/ProductManager.tsx`, `src/components/SettingsHub.tsx`, `src/components/EnquiryDetail.tsx`)
- **`ProductManager.tsx` Header & Table Polish**:
  - Ensure `<PageHeader>` and `<PageBody>` in `ProductManager.tsx` have clean vertical separation (`relative z-20` on header and proper top spacing in `PageBody`) so the sticky header never overlaps or slices the top border of the 4 `<KpiStatCard />` cards.
  - Replace legacy `Custom Unit` / `On Request / Variable` table text with clean commercial formatting (`p.unit || 'Unit'` and `POA / Variable`).
- **`SettingsHub.tsx` Compact Single-Line Tab Bar**:
  - Remove the repetitive `ADMIN` pill badge from inside each Settings sub-tab button (the page header already displays `Role: Admin`), and use compact button padding (`px-3 py-2 text-xs`) with `flex-wrap` so all Settings tabs fit cleanly without a horizontal scrollbar.
- **`EnquiryDetail.tsx` Badge & Section Header Simplification**:
  - Hide the purple `proposal_option` badge in the top drawer header when the value is `None`, `None / Single Option`, or `Default / Included` and `optionAnalysis.hasMultipleOptions` is false.
  - Simplify verbose section titles in `EnquiryDetail.tsx` to crisp executive labels: `Client Account`, `Commercial Summary`, `Package Value`, `Enquiry Details`, `Team Access`, and `Attachments`.

---

## Verification Plan
1. Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript errors across all modified files.
2. Run `compile_applet` (`npm run build`) to confirm a clean production bundle.
