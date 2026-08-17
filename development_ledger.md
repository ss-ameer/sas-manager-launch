# Development Ledger

## Session: 2026-08-17 (V5 Surgical Strike 1.2: Smart Outcome Presets)

### Goals
- Supercharge "ONE-TAP OUTCOME PRESETS" button click handlers in `QuickActivityDrawer.tsx`.
- Automatically derive and update `status` and `outcome` based on preset keywords and active `interactionChannel`.
- Maintain clean compatibility with `activityLogic.ts` sanitization checks.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Injected intelligent keyword mapping logic into one-tap preset button `onClick` handlers. |
| `/package.json` | Bumped version to `0.72.2`. |
| `/CHANGELOG.md` | Added release notes for version `0.72.2`. |
| `/development_ledger.md` | Recorded session goals and modifications for V5 Surgical Strike 1.2. |

## Session: 2026-08-17 (V5 Surgical Strike 1.1: Queue UI & Follow-Up Wiring)

### Goals
- Clarify queue action button text from `"Log / Reschedule"` to `"Execute Task"`.
- Add `onScheduleFollowUp` prop to `CallLogDetailModal` and wire footer button to trigger it.
- Pass `onScheduleFollowUp` in `CallLogManager` to clear viewing modal state and open activity drawer for a new task for the company/contact context.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Renamed queue button to "Execute Task" and passed `onScheduleFollowUp` prop to `CallLogDetailModal`. |
| `/src/components/CallLogDetailModal.tsx` | Added `onScheduleFollowUp` to props interface and wired Schedule Follow-Up button `onClick`. |
| `/package.json` | Bumped version to `0.72.1`. |
| `/CHANGELOG.md` | Added release notes for version `0.72.1`. |
| `/development_ledger.md` | Recorded session goals and modifications for V5 Surgical Strike 1.1. |


## Session: 2026-08-17 (V4 Surgical Strike 2: Logic Decoupling & Advanced Dropdowns)

### Goals
- Extract channel purpose and outcome mapping logic into a standalone utility engine `src/utils/activityLogic.ts`.
- Wire PURPOSE and OUTCOME `<select>` elements in `QuickActivityDrawer.tsx` to use `getPurposesForChannel` and `getOutcomesForStatus`.
- Guarantee state sanitization on channel or status changes so `purpose` and `outcome` dropdowns never display stale or invalid options.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/activityLogic.ts` | Created logic engine exporting `getPurposesForChannel` and `getOutcomesForStatus`. |
| `/src/types.ts` | Exported `ActivityChannel` type. |
| `/src/components/QuickActivityDrawer.tsx` | Wired dropdowns to `activityLogic.ts` utilities and updated state sanitization handlers. |
| `/package.json` | Bumped version to `0.72.0`. |
| `/CHANGELOG.md` | Added version `0.72.0` release notes. |
| `/development_ledger.md` | Recorded development goals and modifications table for V4 Surgical Strike 2. |

## Session: 2026-08-17 (V4 Surgical Strike 1: Contextual UI Engine)

### Goals
- Define dynamic configuration dictionaries for statuses (`channelStatuses`) and outcome presets (`channelPresets`) across all interaction channels ('Call', 'WhatsApp', 'Email', 'Meeting', 'Site Visit').
- Dynamically format section labels using `{interactionChannel.toUpperCase()}` ("STATUS / DISPOSITION", "OUTCOME", "PURPOSE").
- Map status buttons and one-tap outcome preset chips dynamically based on selected channel.
- Implement channel switching auto-default logic to reset invalid status choices to the new channel's default item.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Added `channelStatuses` & `channelPresets` records, updated labels to use `{interactionChannel.toUpperCase()}`, mapped status buttons and presets dynamically, and added channel reset logic. |
| `/package.json` | Bumped version to `0.71.0`. |
| `/CHANGELOG.md` | Added version `0.71.0` release notes. |
| `/development_ledger.md` | Recorded development goals and modifications for V4 Surgical Strike 1. |

## Session: 2026-08-17 (V3 Surgical Strike 2: Modal Z-Index Dominance)

### Goals
- Dial down `PageHeader.tsx` sticky header z-index from `z-40` to `z-20`.
- Elevate System Health / Diagnostics Hub (`CloudSyncHub.tsx`) modal backdrop from `z-50` to `z-[100]`.
- Elevate core modal backdrops in `CompanyModal.tsx`, `QuickActivityDrawer.tsx`, and `CallLogDetailModal.tsx` to `z-[100]`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/layout/PageHeader.tsx` | Reduced sticky top header wrapper z-index from `z-40` to `z-20`. |
| `/src/components/CloudSyncHub.tsx` | Elevated System Health & Diagnostics Hub modal backdrop from `z-50` to `z-[100]`. |
| `/src/components/CompanyModal.tsx` | Upgraded add company form modal and merge modal backdrops from `z-50` to `z-[100]`. |
| `/src/components/QuickActivityDrawer.tsx` | Upgraded slide-over activity drawer backdrop from `z-50` to `z-[100]`. |
| `/src/components/CallLogDetailModal.tsx` | Upgraded call log detail modal backdrop from `z-50` to `z-[100]`. |
| `/package.json` | Bumped version to `0.70.1`. |
| `/CHANGELOG.md` | Logged version `0.70.1` entry. |
| `/development_ledger.md` | Logged development session goals and modifications. |

## Session: 2026-08-17 (V3 Surgical Strike 1: Mobile Responsiveness Core)

### Goals
- Introduce mobile menu state in `App.tsx` and drill `isOpen`/`onClose` to `Sidebar` and `onOpenMobileMenu` to all screen views.
- Implement responsive off-canvas drawer layout with backdrop blur and mobile close button in `Sidebar.tsx`.
- Add responsive hamburger toggle button (`md:hidden`) to `PageHeader.tsx` and wire to `onOpenSidebar`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Added `isMobileMenuOpen` state, mobile hamburger button to header, passed `isOpen`/`onClose` to `Sidebar`, and drilled `onOpenMobileMenu` to all 7 active tab screens. |
| `/src/components/Sidebar.tsx` | Added `isOpen` and `onClose` props, responsive mobile off-canvas drawer with backdrop blur overlay, close `X` button, and auto-dismiss on tab select. |
| `/src/components/layout/PageHeader.tsx` | Added `onOpenSidebar` prop, imported `Menu`, and rendered responsive mobile hamburger trigger button on far left of header. |
| `/src/components/Dashboard.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/CallLogManager.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/EnquiryList.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/CompanyModal.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/SalespersonProfiles.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/ProductManager.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/src/components/SettingsHub.tsx` | Accepted `onOpenMobileMenu` and passed `onOpenSidebar={onOpenMobileMenu}` to `PageHeader`. |
| `/package.json` | Bumped version to `0.70.0`. |
| `/CHANGELOG.md` | Added version `0.70.0` entry. |
| `/development_ledger.md` | Logged development session goals and modifications. |

## Session: 2026-08-16 (V2 Surgical Strike 6.2: Queue UI Overhaul)

### Goals
- Inject universal schedule date/time badge into every scheduled card in Operator Call Queue.
- Update queue item action button label from 'Fast Log Call Outcome' to 'Log / Reschedule'.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Injected `formatOverdueDisplayDate(item.date)` badge in queue cards and updated action button label to 'Log / Reschedule'. |
| `/package.json` | Bumped version to `0.69.3`. |
| `/CHANGELOG.md` | Added version `0.69.3` entry. |
| `/development_ledger.md` | Logged development session goals and modifications. |

## Session: 2026-08-16 (V2 Surgical Strike 6.1: Z-Index & Navigation Polish)

### Goals
- Dial down `PageHeader` outermost wrapper z-index from `z-[100]` to `z-40` so sticky page headers stay behind modal overlays (`z-50`).
- Ensure `[View Previous Logs]` button click handlers in `QuickActivityDrawer` call `onClose()` to dismiss drawer when opening company profile modals.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/layout/PageHeader.tsx` | Changed outermost wrapper z-index class from `z-[100]` to `z-40`. |
| `/src/components/QuickActivityDrawer.tsx` | Added `onClose()` call to `[View Previous Logs]` button click handlers. |
| `/package.json` | Bumped version to `0.69.2`. |
| `/CHANGELOG.md` | Logged version `0.69.2` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-16 (V2 Surgical Strike 5: Sticky Header Overflow Override)

### Goals
- Ensure main content area is explicitly configured as the scrolling container with `h-screen` and `overflow-y-auto` in `App.tsx`.
- Update `PageHeader.tsx` outermost wrapper to `sticky top-0 z-[100] w-full` to float above sticky columns and table headers.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Configured layout outer wrapper with `h-screen overflow-hidden` and `<main>` with `h-screen overflow-y-auto flex flex-col flex-1`. |
| `/src/components/layout/PageHeader.tsx` | Updated outermost div classes to `sticky top-0 z-[100] w-full`. |
| `/package.json` | Bumped version to `0.69.1`. |
| `/CHANGELOG.md` | Added version `0.69.1` entry. |
| `/development_ledger.md` | Logged development session goals and modifications. |

## Session: 2026-08-16 (V2 Surgical Strike 4: Core Architecture Overhaul - Scheduling vs. Logging)

### Goals
- Deprecate Fast Outcome Logger in `CallLogManager.tsx` and re-wire queue triggers to open `QuickActivityDrawer`.
- Implement Decoupling Engine in `QuickActivityDrawer.tsx` so completing a scheduled task mutates the original scheduled task to 'Completed'/'Cancelled' and creates a BRAND NEW document for the performed activity.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Removed FastOutcomeLogger modal JSX and re-wired `openFastQueueLogger` to launch `QuickActivityDrawer`. |
| `/src/components/QuickActivityDrawer.tsx` | Implemented `isCompletingScheduledTask` decoupling logic in `handleSubmit` to mark scheduled task completed and create a new activity log document. |
| `/package.json` | Bumped version to `0.69.0`. |
| `/CHANGELOG.md` | Logged version `0.69.0` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-16 (V2 Surgical Strike 3: Express Lead Company Saves)

### Goals
- Replicate green Call button in New Company Line input row inside `QuickActivityDrawer.tsx`.
- Explicitly invoke `CompanyRepository.updateCompany` during submission to persist newly created company phone lines into Firestore and local state safely without overwriting existing lines.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Added green Call button next to line phone input in New Company Line details section; explicitly invoked `CompanyRepository.updateCompany` when appending new company lines. |
| `/package.json` | Bumped version to `0.68.2`. |
| `/CHANGELOG.md` | Logged version `0.68.2` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-16 (V2 Surgical Strike 2: State Leaks & Dead Button Wiring)

### Goals
- Flush all localized form states in `CompanyModal.tsx` on modal closure or prop reset to prevent state leaks.
- Wire `[View Previous Logs]` text link in `QuickActivityDrawer.tsx` to open Company 360 view when company ID is valid.
- Wire "Schedule Follow-Up" button in `CallLogDetailModal.tsx` to call `onClose()` and trigger `onLogFollowup` or hand off `onEdit` to activity drawer.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Enhanced `closeCompanyModal()` and prop `useEffect` listeners to explicitly clear all form states and added a Cancel button in the modal footer. |
| `/src/components/QuickActivityDrawer.tsx` | Added `onOpen360`, `onInspectCompany`, and `onOpenCompanyModal` props and wired `[View Previous Logs]` click handlers. |
| `/src/App.tsx` | Passed `onOpen360` prop to `QuickActivityDrawer` to trigger Company 360 inspection. |
| `/src/components/CallLogDetailModal.tsx` | Unwrapped and wired "Schedule Follow-Up" footer button to call `onClose()` and trigger `onLogFollowup` or `onEdit`. |
| `/package.json` | Bumped version to `0.68.1`. |
| `/CHANGELOG.md` | Logged version `0.68.1` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-16 (V2 Surgical Strike 1: Global UI & UX Polish)

### Goals
- Make PageHeader wrapper sticky with `sticky top-0 z-50` and opaque background to lock headers during page/table scrolling.
- Strip phone numbers from Contact Person `<select>` dropdown options in `QuickActivityDrawer.tsx`, displaying strictly name and role.
- Standardize Temperature (Heat Level) selector options in `CompanyModal.tsx` to strictly use `Cold ❄️`, `Warm 🌤️`, `Hot 🔥`, and `DNC 🚫`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/layout/PageHeader.tsx` | Applied `sticky top-0 z-50` with solid non-transparent background to header wrapper. |
| `/src/components/QuickActivityDrawer.tsx` | Stripped `phonePart` from Contact Person select dropdown options, leaving name and designation. |
| `/src/components/CompanyModal.tsx` | Standardized temperature dropdown options in Canonical Company form to `Cold ❄️`, `Warm 🌤️`, `Hot 🔥`, and `DNC 🚫`. |
| `/package.json` | Bumped version to `0.68.0`. |
| `/CHANGELOG.md` | Logged version `0.68.0` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-15 (Surgical Strike 5.1: The Final Sweep)

### Goals
- Implement `sanitizeWhatsAppNumber` helper in `CompanyModal.tsx` and `Company360Modal.tsx` to handle 10-digit UAE mobile numbers starting with `05` by replacing leading `0` with `971` (e.g. `0501234567` -> `971501234567`).
- Remove redundant `+` text prefixes from button nodes rendering beside `<Plus />` icons in `CompanyModal.tsx` (`Add Contact`, `Add Phone`, `Add Email`) and `Company360Modal.tsx` (`Add Contact Person`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Added `sanitizeWhatsAppNumber` helper function, updated company and contact level WhatsApp link generation, and removed redundant `+` prefixes from button text labels. |
| `/src/components/Company360Modal.tsx` | Added `sanitizeWhatsAppNumber` helper function, updated contact phone WhatsApp link generation, and removed redundant `+` prefixes from button text labels. |
| `/package.json` | Bumped version to `0.67.1`. |
| `/CHANGELOG.md` | Logged version `0.67.1` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-15 (Surgical Strike 4.2: Batch Actions & History Injection)

### Goals
- Render a "Batch Actions" toolbar UI in `CallLogManager.tsx` whenever `selectedLogIds.length > 0`.
- Wire up red "Batch Delete" button with confirmation prompt, database deletion via `safeDeleteDoc`, state cleanup via `setCallLogs`, and selection clearing.
- Add "Batch Reassign" button UI element ready for future reassign workflows.
- Inject "Recent Interactions" section into `CompanyModal.tsx` showing the 3 to 5 most recent activity logs for the selected company with Date, Operator, Call Status, and Call Outcome.
- Display "No recent interactions found" placeholder when no logs exist for the company.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Added Batch Actions toolbar with selection count badge, "Batch Reassign" button, and "Batch Delete" button wired to confirmation and `safeDeleteDoc`. |
| `/src/components/CompanyModal.tsx` | Added `recentCompanyLogs` memoization and injected "Recent Interactions" section at bottom of company inspection view with Date, Operator, Status, Outcome, and "+ Log Interaction" shortcut. |
| `/package.json` | Bumped version to `0.67.0`. |
| `/CHANGELOG.md` | Logged version `0.67.0` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-15 (Surgical Strike 4.1: Call Log Visual Cleanup)

### Goals
- Exclude `Scheduled / Planned` items from the "Full Call History & Search" tab so that history only displays completed or past interactions.
- Ensure `Scheduled / Planned` status badges use sleek blue styling (`bg-blue-500/20 text-blue-400 border-blue-500/40`).
- Format raw ISO timestamps in overdue warning badges into clean human-readable date strings (e.g. "Aug 13, 10:51 AM" or "Aug 13").

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Added `formatOverdueDisplayDate` helper; updated `filteredHistoryLogs` to strictly filter out `scheduled` statuses; updated tab header counter; humanized overdue date badge formatting. |
| `/package.json` | Bumped version to `0.66.6`. |
| `/CHANGELOG.md` | Logged version `0.66.6` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-15 (Surgical Strike 3.2: Edit Flow Unification)

### Goals
- Convert `CallLogDetailModal.tsx` into a strictly read-only detailed viewer by removing redundant internal `isEditing` state, form inputs, and `handleSaveEdit` logic.
- Route all Edit action button triggers inside `CallLogDetailModal` and `CallLogManager` to close the modal and open `QuickActivityDrawer` in edit mode.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogDetailModal.tsx` | Converted center modal to read-only viewer. Removed internal `isEditing` state, form fields, and `handleSaveEdit` function. Connected Edit button to `onClose` and `onEdit` callback. |
| `/src/components/CallLogManager.tsx` | Updated `onEdit` prop handler for `CallLogDetailModal` to close the modal and trigger `onOpenActivityDrawer` in edit mode with `existingLog` and `logToEdit`. |
| `/package.json` | Bumped version to `0.66.5`. |
| `/CHANGELOG.md` | Logged version `0.66.5` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-14 (Fix Cramped Inline Inputs in QuickActivityDrawer)

### Goals
- Resolve cramped inline inputs in `QuickActivityDrawer.tsx` when selecting "+ Add New Contact Detail", "+ Create New Contact Person", or "+ Add New Company Line".
- Change input layouts from cramped side-by-side flex/grid sub-columns to full-width vertical stacks (`flex flex-col gap-2.5`).
- Ensure each dynamic input stretches to `w-full` with clear, uppercase section labels (`Full Name`, `Role / Designation`, `Phone Number`, `Line Phone Number`, `Line Tag / Label`).
- Apply `col-span-full` to `Company Line`, `Email` channel, and `Meeting` channel field wrappers inside the drawer layout grid.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Converted dynamic inputs for new contact person, phone number/contact detail, and company line to full-width vertical stacks with clear labels and `w-full` inputs. Applied `col-span-full` to full-width drawer sections. |
| `/package.json` | Bumped version to `0.66.4`. |
| `/CHANGELOG.md` | Logged version `0.66.4` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-14 (Fix CallLogDetailModal Edit Mode Form Full Width Layout)

### Goals
- Resolve 50% width form element squishing in `CallLogDetailModal.tsx` when in edit mode (`isEditing === true`).
- Ensure `Target Company`, `Contact Person`, and `Phone Tag / Label` form wrappers span the full modal width (`col-span-full`).
- Confirm zero layout squishing across all edit form inputs, dropdowns, datetime pickers, and toggles.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogDetailModal.tsx` | Updated edit mode form container wrappers (`Target Company`, `Contact Person`, `Phone Tag / Label`) to use `col-span-full`. |
| `/package.json` | Bumped version to `0.66.3`. |
| `/CHANGELOG.md` | Logged version `0.66.3` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-14 (Fix Call Log Table Action Handler Routing)

### Goals
- Decouple View and Edit action handlers across Operator Call Queue and Full Call History tables in `CallLogManager.tsx`.
- Ensure Eye icon ("View Call Log") opens the read-only Log Details modal (`CallLogDetailModal`) without opening the `QuickActivityDrawer`.
- Ensure Pencil icon ("Edit Activity Log") opens the dedicated `Edit Activity Log` sidebar (`QuickActivityDrawer`) pre-populated with log data (`CL-XXXX`).
- Align button tooltips and `onClick` handlers across both tables.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Fixed View (Eye icon) and Edit (Pencil icon) handlers and tooltips across Operator Call Queue and Full Call History tables. |
| `/package.json` | Bumped version to `0.66.2`. |
| `/CHANGELOG.md` | Logged version `0.66.2` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-14 (Target Mode & Phone Dropdown Overhaul)

### Goals
- Refine target mode toggle labels ("Contact Person" vs "Company Mainline") with clean state resets upon mode switches in `QuickActivityDrawer.tsx`.
- Add dedicated Company Line dropdown with options for saved front desk/main lines, custom line tags, "+ Add New Company Line" mode, and inline "Call" action buttons.
- Build dedicated Contact Person phone selector mapping saved numbers (`Mobile`, `Landline`, direct numbers) with "+ Add New Contact Detail" mode and inline "Call" action buttons.
- Add `cursor-pointer` utility class to Edit Log action button in `CallLogManager.tsx`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Refined target mode toggles, added state cleanup handlers on mode switch, implemented separated Company Line and Contact Detail phone dropdowns with inline Call buttons. |
| `/src/components/CallLogManager.tsx` | Added `cursor-pointer` to Edit Log button in log details. |
| `/package.json` | Bumped version to `0.66.1`. |
| `/CHANGELOG.md` | Logged version `0.66.1` release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-14 (Phase 4: UI Polish, Quick Actions, & Purpose Dropdowns)

### Goals
- Inject dynamic leading history symbols (`PhoneCall`, `Mail`, `MessageSquare`, `Calendar`) into log entries across Operator Queue, History table, Activity Details, and Company 360 Call Operations.
- Add 1-click Quick Action mini-buttons (Dial, Email, WhatsApp) to contact cards in `Company360Modal.tsx` with non-digit stripping regex for WhatsApp URLs.
- Implement list sorting controls ("Date: Oldest First" / "Date: Newest First") in `CallLogManager.tsx` for Operator Queue and Call History views.
- Expand `SYSTEM_CALL_PURPOSES` presets in `defaults.ts` and update `CallLogDetailModal.tsx` and `QuickActivityDrawer.tsx` purpose select dropdowns.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/defaults.ts` | Expanded `SYSTEM_CALL_PURPOSES` preset list to cover all standard interaction categories. |
| `/src/components/CallLogManager.tsx` | Added queue & history sorting states and controls; injected dynamic history symbol icons into Operator Queue and History table. |
| `/src/components/Company360Modal.tsx` | Added 1-click Contact Quick Action mini-buttons (Dial, Email, WhatsApp) and dynamic leading icons in Call Operations timeline. |
| `/src/components/CallLogDetailModal.tsx` | Updated modal header icon to dynamic interaction icon and wired Interaction Purpose select dropdown to `SYSTEM_CALL_PURPOSES`. |
| `/src/components/QuickActivityDrawer.tsx` | Updated Call Purpose select dropdown to support `SYSTEM_CALL_PURPOSES` and preserve custom values seamlessly. |
| `/package.json` | Bumped version to `0.66.0`. |
| `/CHANGELOG.md` | Logged version `0.66.0` release notes. |

## Session: 2026-08-14 (Phase 3: DNC & Temperature Restructure)

### Goals
- Extend `CompanyTemperature` model and defaults to include `'DNC'`.
- Upgrade 3-stage company heat badge cycling to a 4-stage cycle: Cold ❄️ -> Warm 🌤️ -> Hot 🔥 -> DNC 🚫 in `CompanyModal.tsx` and `Company360Modal.tsx`.
- Auto-set `is_dnc: true` on company records when temperature is set or cycled to DNC.
- Remove redundant "Is DNC" form checkbox from company creation/edit forms.
- Re-architect Contact DNC flag in `ContactModal.tsx` with a modern toggle switch and alert container.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Extended `CompanyTemperature` type definition to include `'DNC'`. |
| `/src/utils/defaults.ts` | Added `'DNC'` to `SYSTEM_COMPANY_TEMPERATURES` and configured rose color mapping in `SYSTEM_TEMPERATURE_COLORS`. |
| `/src/components/CompanyModal.tsx` | Updated 4-stage temperature badge rendering and cycling, mapped `is_dnc` on submit, and updated company card filters. |
| `/src/components/Company360Modal.tsx` | Implemented 4-stage temperature badge cycling (`Cold` -> `Warm` -> `Hot` -> `DNC`) and updated company header badge. |
| `/src/components/ContactModal.tsx` | Replaced legacy checkbox with modern toggle switch and styled warning container for DNC restrictions. |
| `/package.json` | Bumped version to `0.65.0`. |
| `/CHANGELOG.md` | Logged 0.65.0 release notes. |
| `/development_ledger.md` | Added session record. |

## Session: 2026-08-12 (Fix React Duplicate Key Error in Quick Activity Drawer)

### Goals
- Fix React duplicate key error (`ecp_1`) in `QuickActivityDrawer.tsx`.
- Replace static ID initializations with dynamic unique ID generation (`makeExpressId`).
- Add index-suffixed keys (`${item.id}_${idx}`) across all map loops for express phone, express email, company, contact, and enquiry lists.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Replaced static ID initializations (`ecp_1`, `ece_1`, etc.) with `makeExpressId` and updated all `.map()` rendering loops to guarantee unique React keys. |
| `/package.json` | Bumped version to `0.64.1`. |
| `/CHANGELOG.md` | Logged 0.64.1 release notes. |
| `/development_ledger.md` | Added session record. |

## Session: 2026-08-12 (Ultimate Express Cold Call & Auto-CRM Registration Workflow)

### Goals
- Overhaul "Unlinked Lead" tab into a dual-level Express Lead Entry form in `QuickActivityDrawer.tsx`.
- Separate Company Info from Contact Person Info with inline "Call Now" action buttons (`target="_blank"`, `rel="noopener noreferrer"`, `onClick={(e) => e.stopPropagation()}`).
- Implement flexible custom tagging for phones/emails via comboboxes/inputs with datalist suggestions.
- Fix duplicate assignment prompt issue by normalizing phone numbers (stripping spaces, dashes, and country codes) across lookup logic.
- Implement seamless Auto-CRM generation and linking in `handleSubmit` via `CompanyRepository.ts`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `normalizePhoneNumber` and `isSamePhoneNumber` helper functions. |
| `/src/components/CallLogManager.tsx` | Updated live phone lookup logic (`handlePhoneInputChange`) with normalized phone comparison to suppress duplicate assignment prompts. |
| `/src/components/QuickActivityDrawer.tsx` | Overhauled "Unlinked Lead" into dual-level Express Form with inline Call Now buttons, custom tag inputs, multi-phone/email support, and Auto-CRM generation. |
| `/package.json` | Bumped version to `0.64.0`. |
| `/CHANGELOG.md` | Logged 0.64.0 release notes. |
| `/development_ledger.md` | Added session record. |

## Session: 2026-08-12 (Universal Communication Link New-Tab & Event Protection)

### Goals
- Comprehensive codebase audit of all communication protocols (`tel:`, `mailto:`, `https://wa.me/`).
- Enforce universal `target="_blank"`, `rel="noopener noreferrer"`, and `onClick={(e) => e.stopPropagation()}` on every communication anchor tag.
- Prevent workspace tab redirection and stop event propagation so link clicks do not trigger underlying table row or modal selection handlers.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Enforced `target="_blank"` and `rel="noopener noreferrer"` across all 9 company phone/email links. |
| `/src/components/CallLogDetailModal.tsx` | Added `target="_blank"` and `rel="noopener noreferrer"` to phone and email action links. |
| `/src/components/CallLogManager.tsx` | Updated 5 phone/email links with `target="_blank"`, `rel="noopener noreferrer"`, and `onClick={(e) => e.stopPropagation()}`. |
| `/src/components/Company360Modal.tsx` | Updated 4 phone/email links with `target="_blank"` and `rel="noopener noreferrer"`, and updated `handleOutboundInteraction` to prevent duplicate tab spawning. |
| `/src/components/ContactDetailModal.tsx` | Added `target="_blank"` and `rel="noopener noreferrer"` to WhatsApp, Email, and Call action buttons. |
| `/src/components/Dashboard.tsx` | Added `target="_blank"`, `rel="noopener noreferrer"`, and `onClick={(e) => e.stopPropagation()}` to Call and WhatsApp action buttons. |
| `/src/components/QuickActivityDrawer.tsx` | Updated WhatsApp draft `window.open` call with `'noopener,noreferrer'`. |
| `/package.json` | Bumped version to `0.63.3`. |
| `/CHANGELOG.md` | Logged 0.63.3 release notes. |
| `/development_ledger.md` | Added session record. |

## Session: 2026-08-12 (Companies Contrast, Capitalization Preservation, Phone/Email Categorization, Name Cascade Sync & Ghost Log Guardrails)

### Goals
- Fix invisible company name text in Companies Registry list/table view with high-contrast Tailwind classes.
- Preserve user capitalization on display names while storing background lowercase `canonical_name` for duplicate matching.
- Upgrade Phone and Email array controls with category dropdown selectors and render category badges in Company Details view.
- Implement company name cascade sync in `CompanyRepository.ts` (`cascadeUpdateCallLogsCompanyName`) that updates matching call logs while strictly protecting historical phone numbers.
- Prevent blank ghost logs in `QuickActivityDrawer.tsx` with strict submit validation and safeguard Fast Outcome Logger in `CallLogManager.tsx` with optional chaining and Missing Lead Guard.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | High-contrast table styling, user capitalization preservation, and Phone/Email category selector & badge inspector. |
| `/src/services/repositories/CompanyRepository.ts` | Refined `cascadeUpdateCallLogsCompanyName` to update matching call logs across local stores (`activity_logs` and `call_logs`) and Firestore while preserving historical phone fields. |
| `/src/components/QuickActivityDrawer.tsx` | Enforced strict submit validation preventing ghost logs when no CRM Contact or Unsaved Lead is selected. |
| `/src/components/CallLogManager.tsx` | Hardened Fast Call Outcome Logger with optional chaining for legacy blank logs and inline Missing Lead Guard enforcement. |
| `/package.json` | Bumped version to `0.63.2`. |
| `/CHANGELOG.md` | Added 0.63.2 release entry. |
| `/development_ledger.md` | Logged session goals and modifications table. |

## Session: 2026-08-12 (Firestore Connection Resilience & Long Polling Fallback)

### Goals
- Resolve transient Firestore connection unavailable error log by enabling auto-detect long polling fallback.
- Configure `initializeFirestore` in `src/firebase.ts` with `experimentalAutoDetectLongPolling: true` to support sandboxed iframe network proxies without connection drops.
- Update `handleFirestoreError` to gracefully log offline/reconnecting states while local IndexedDB cache and `SyncEngine` maintain seamless offline operation.
- Bump package version to `0.63.1` and verify clean build with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Configured `initializeFirestore` with `experimentalAutoDetectLongPolling: true` and updated `handleFirestoreError` to gracefully handle offline/reconnecting states (`isUnavailable`). |
| `/package.json` | Bumped version to `0.63.1`. |
| `/CHANGELOG.md` | Added 0.63.1 release entry. |
| `/development_ledger.md` | Logged session goals and modifications table. |

## Session: 2026-08-12 (Activity Drawer Edit Hydration, Dropdown Eradication, Fast Outcome Logger Modernization & Timestamp Automation)

### Goals
- Hydrate form state in `QuickActivityDrawer.tsx` when editing existing logs and conditionally route submit to `safeUpdateDoc`.
- Add "Scheduled" status preset and automate `completedAt` timestamp recording when transitioning scheduled calls to completed.
- Eradicate native `<select>` dropdowns for status/outcome across `QuickActivityDrawer.tsx` and `CallLogManager.tsx` in favor of a uniform 1-Tap Pill Grid.
- Modernize Fast Outcome Logger in `CallLogManager.tsx` with dark theme, Missing Lead Guard (inline editable lead fields), and Smart Date Toggle chips.
- Wire pencil/edit buttons across `CallLogDetailModal.tsx`, `CompanyModal.tsx`, `CallLogManager.tsx`, and `Dashboard.tsx` to launch `QuickActivityDrawer` with full hydration.
- Bump package version to `0.63.0` and verify clean build with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Added `existingLog` / `logToEdit` form state hydration hook, conditional update routing for existing records, "Scheduled" status button preset, automated `completedAt` timestamping, and replaced native dropdowns with 1-Tap Pill Grids. |
| `/src/components/CallLogDetailModal.tsx` | Updated "Edit Log" trigger to pass `existingLog` / `logToEdit` directly into `QuickActivityDrawer`. |
| `/src/components/CallLogManager.tsx` | Redesigned Fast Outcome Logger drawer in Slate Dark theme with Missing Lead Guard inline fields, Pill Grid outcome selector, and Smart Date Toggle chips. Updated queue and history table edit triggers to pass `existingLog`. Added `getOffsetDateString` helper. |
| `/src/components/Dashboard.tsx` | Attached `originalLog` to queue items and passed `existingLog` in `onOpenActivityDrawer` calls. |
| `/package.json` | Bumped version to `0.63.0`. |
| `/CHANGELOG.md` | Documented 0.63.0 release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-12 (Activity Logic Sync, Duplicate Guards, IndexedDB Safety & Premium UI Unification)

### Goals
- Auto-sync Call Status buttons ('Busy', 'No Answer') with `outcome` text state in `QuickActivityDrawer.tsx`.
- Implement strict duplicate company name guard in `ActivityLogRepository.convertUnsavedLeadToClient` to prevent duplicate company creation during lead conversion.
- Register all required object stores explicitly in `db.ts` and guard transaction calls against unmounted stores with fallback to local storage.
- Apply Premium Slate Dark UI design system to all sub-modals in `CompanyModal.tsx` and `ContactModal.tsx`.
- Bump package version to `0.62.0` and verify clean compilation with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/QuickActivityDrawer.tsx` | Bound 'Busy' and 'No Answer' Call Status buttons to automatically update the `outcome` text state with matching labels upon selection. |
| `/src/services/repositories/CallLogRepository.ts` | Added strict query for existing company names in `convertUnsavedLeadToClient` before batch execution to throw a hard duplicate error. |
| `/src/services/db.ts` | Ensured `companies`, `contacts`, `activity_logs`, `call_logs`, `enquiries`, `products`, `metadata`, and `mutation_queue` object stores are registered and guarded against transaction errors. |
| `/src/components/LeadConversionModal.tsx` | Handled duplicate company error gracefully in UI and enforced submit button locking during `isSubmitting`. |
| `/src/components/CompanyModal.tsx` | Refactored all sub-modals (Add/Edit, Merge, Delete Choice, Confirmation, Duplicate Warning, Bulk Reassign) to Slate Dark UI. |
| `/src/components/ContactModal.tsx` | Refactored Add/Edit Contact Modal to Slate Dark UI. |
| `/package.json` | Bumped version to `0.62.0`. |
| `/CHANGELOG.md` | Documented 0.62.0 release notes. |
| `/development_ledger.md` | Logged development session goals and modifications table. |

## Session: 2026-08-11 (Unsaved Lead Conversion Workflow & Enterprise CRM Restructure for Companies & Contacts)

### Goals
- Implement "Unsaved Lead" to "CRM Client" Conversion Workflow with `LeadConversionModal.tsx` and atomic repository transaction `convertLeadToClient` in `ActivityLogRepository.ts`.
- Execute Enterprise CRM Restructure for Companies & Contacts with reusable `ContactMethod` type, dynamic array builders, on-mount legacy data migration, and refactored Company 360° view.
- Bump package version to `0.61.0` and verify clean build with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Defined reusable `ContactMethod` interface (`{ id: string; label: string; value: string; }`). Updated `Company` and `Contact` interfaces with array contact fields and overloaded helper functions (`getCompanyPhones`, `getCompanyEmails`, `getContactPhones`, `getContactEmails`). |
| `/src/services/repositories/ActivityLogRepository.ts` | Added `convertLeadToClient` repository method executing an atomic `writeBatch` to create Company and Contact documents while linking all matching activity logs in `call_logs`. |
| `/src/components/CallLogDetailModal.tsx` | Added prominent "🚀 Convert to CRM Client" button for unsaved leads (missing `company_id`) and opened `LeadConversionModal`. |
| `/src/components/LeadConversionModal.tsx` | Created modal form for converting unsaved leads into CRM Clients with pre-filled lead data and workspace scoping. |
| `/src/components/CompanyModal.tsx` | Replaced singular phone/email inputs with dynamic array builders, label dropdowns, trash icons, and on-mount legacy data migration logic. |
| `/src/components/ContactModal.tsx` | Updated state and UI to use `ContactMethod` for `phones` and `emails`, with dynamic label selection, trash controls, company phone/email reclaim actions, and on-mount legacy string migration. |
| `/src/components/Company360Modal.tsx` | Updated Company 360° view header and contact list to render labeled phone/email badges for both general company info and associated personnel, with fallback for legacy string fields. |
| `/package.json` | Bumped version to `0.61.0`. |
| `/CHANGELOG.md` | Documented 0.61.0 release notes. |
| `/development_ledger.md` | Logged development goals and modifications table. |

## Session: 2026-08-11 (God Mode Direct Workspace Lifecycle Management & Global Users Management)

### Goals
- Implement Direct Workspace Lifecycle Management in God Mode (`SuperAdminConsoleModal.tsx`, `SuperAdminEngine.ts`) with inline Rename, Change Owner, and Hard Delete/Cascade Wipe controls.
- Create Dedicated `👥 Global Users` tab in God Mode displaying all registered user accounts with real-time search, Super Admin toggle, and Profile Delete & Scrub actions.
- Expand Raw Collection Browser coverage to include all system collections (`users`, `workspaces`, `workspace_members`) alongside domain collections.
- Bump package version to `0.60.0` and verify clean build with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/services/SuperAdminEngine.ts` | Added `renameWorkspace`, `changeWorkspaceOwner`, `cascadeDeleteWorkspace`, `getAllGlobalUsers`, `toggleUserSuperAdmin`, `deleteUserAndScrub`, and exported `ALL_BROWSER_COLLECTIONS`. |
| `/src/components/SuperAdminConsoleModal.tsx` | Added Workspace Lifecycle Action buttons (Rename, Owner, Cascade Wipe) on workspace cards, dedicated `👥 Global Users` management tab with search table and action buttons, and expanded Raw Collection Browser dropdown. |
| `/package.json` | Bumped version to `0.60.0`. |
| `/CHANGELOG.md` | Documented 0.60.0 release notes for God Mode Workspace Lifecycle & Global Users Management. |
| `/development_ledger.md` | Logged development goals and modifications table for session 2026-08-11. |

## Session: 2026-08-11 (SaaS Workspace Ownership Handover & Intelligent Cascade Deletion Architecture)

### Goals
- Implement Intelligent Account Deletion Logic categorizing workspaces into Category 1 (Sole Member) vs Category 2 (Multi-Member).
- Execute Single-Member Workspace Cascade Wipe using atomic `writeBatch` across all workspace records.
- Create `WorkspaceHandoverWizardModal.tsx` for multi-member workspace handover/nuke with 1-click JSON backup download and owner promotion.
- Enforce strict `workspace_members` membership resolution in `App.tsx` and real-time subscription.
- Ensure workspace creation in `FreshAccountOnboardingModal.tsx` and `WorkspaceManagerModal.tsx` provisions `workspace_members` records.
- Bump package version to `0.59.0` and verify zero errors with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/download.ts` | Created utility function `downloadJsonFile` for 1-click JSON export downloads. |
| `/src/components/WorkspaceHandoverWizardModal.tsx` | Built multi-member workspace handover wizard with Option A (Transfer Ownership) and Option B (Delete Workspace with Backup Download). |
| `/src/components/UserProfileModal.tsx` | Implemented intelligent workspace categorization (Category 1 vs Category 2), cascade wipe, and rendered handover wizard. |
| `/src/components/FreshAccountOnboardingModal.tsx` | Added `workspace_members` record creation during Quick Start and Custom workspace creation. |
| `/src/components/WorkspaceManagerModal.tsx` | Added `workspace_members` record creation when joining workspaces via invite codes. |
| `/src/App.tsx` | Added `workspaceMembers` state & snapshot listener, strictly filtering `userWorkspaces` to active `workspace_members` documents. |
| `/package.json` | Bumped version to `0.59.0`. |
| `/CHANGELOG.md` | Documented 0.59.0 release notes for SaaS Workspace Ownership Handover & Intelligent Cascade Deletion. |
| `/development_ledger.md` | Logged development goals and modifications table for session 2026-08-11. |

## Session: 2026-08-10 (Per-Workspace Role & Permission Architecture & Import Wipe Upgrade)

### Goals
- Implement Per-Workspace Role & Permission Architecture in `src/types.ts` and `src/utils/permissions.ts`.
- Refactor permission helper functions (`getUserWorkspaceRole`, `getUserRoleInWorkspace`, `isAdmin`, `isWorkspaceAdmin`, `canManageWorkspace`, `canDeleteRecords`) to accept `workspaceId` and evaluate `user.workspace_roles?.[workspaceId]` or `user.workspace_profiles?.[workspaceId]?.role` with global fallback.
- Update `UserManagementHub.tsx` to save and display roles scoped to `activeWorkspace.id`.
- Audit call sites in `WorkspaceManagerModal.tsx`, `SettingsHub.tsx`, `DropdownSettingsManager.tsx`, and `App.tsx` to pass `activeWorkspace?.id`.
- Extend `SyncEngine.ts` `importWorkspaceData` with `mode: 'merge' | 'replace'` and pre-import batch wipe routine.
- Add strategy toggle (Merge vs Wipe & Replace) and confirmation dialog in `WorkspaceManagerModal.tsx`.
- Execute contrast fixes on Companies table in `CompanyModal.tsx` and team deduplication in `SalespersonProfiles.tsx`.
- Update version badge in `CloudSyncHub.tsx` to `v0.58.0`.
- Bump package version to `0.58.0` and verify zero errors with `npx tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Extended `UserProfile` and `WorkspaceMember` with `workspace_roles?: Record<string, UserRole | string>`. |
| `/src/utils/permissions.ts` | Refactored permission functions to evaluate `workspaceId` and added `getUserWorkspaceRole`, `canManageWorkspace`, `canDeleteRecords`. |
| `/src/components/UserManagementHub.tsx` | Updated role assignment to write `workspace_roles.${activeWsId}` and display roles evaluated for `activeWsId`. |
| `/src/services/SyncEngine.ts` | Implemented `mode: 'merge' | 'replace'` and pre-import batch-delete wipe routine in `importWorkspaceData`. |
| `/src/components/WorkspaceManagerModal.tsx` | Added Import Strategy toggle (Merge vs Wipe & Replace), confirmation dialog, and JSON file picker. |
| `/src/components/SettingsHub.tsx` | Passed `activeWorkspaceId` and `activeWorkspace` to `DropdownSettingsManager`. |
| `/src/components/DropdownSettingsManager.tsx` | Updated `isAdmin` calculation to use `isWorkspaceAdmin(user, activeWorkspaceId, activeWorkspace)`. |
| `/src/App.tsx` | Updated workspace and data visibility admin checks to pass `activeWorkspace?.id`. |
| `/src/components/CompanyModal.tsx` | Applied high-contrast styling (`text-slate-200 font-mono text-xs`) to phone/email and location cells. |
| `/src/components/SalespersonProfiles.tsx` | Deduplicated team roster sidebar rendering by representative ID/email. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge pill to `v0.58.0`. |
| `/src/components/UserProfileModal.tsx` | Added `handleDeleteAccount` deep email & UID scrub using Firestore writeBatch before auth user deletion. |
| `/src/components/SettingsHub.tsx` | Updated account deletion handler with Firestore batch deletion for workspace_members, salespersons, and workspace rosters. |
| `/src/components/FreshAccountOnboardingModal.tsx` | Added `member_emails` tracking when creating workspaces during onboarding. |
| `/src/App.tsx` | Re-computed `userWorkspaces` filtering out orphaned workspaces and triggering `FreshAccountOnboardingModal` when `userWorkspaces.length === 0`. |
| `/package.json` | Bumped version to `0.58.0`. |
| `/CHANGELOG.md` | Documented version `0.58.0` release notes. |
| `/development_ledger.md` | Updated development ledger session logs. |

## Session: 2026-08-10 (Activity Log Remediation & 4-Point System Upgrade)

### Goals
- Fix Date Overwrite bug in `QuickActivityDrawer.tsx` by adding `activityDate` state and datetime-local picker.
- Auto-pop Quick Activity Drawer on outbound contact actions in `Company360Modal.tsx` via `handleOutboundInteraction`.
- Build high-contrast `CallLogDetailModal.tsx` for inspecting detailed activity logs.
- Audit `EnquiryList.tsx`, `Company360Modal.tsx`, and `CallLogManager.tsx` list items and table cells for dark mode text contrast.
- Add full `call_logs` export & import support in `SyncEngine.ts` (`exportWorkspaceData` & `importWorkspaceData`) and `WorkspaceManagerModal.tsx`.
- Create per-workspace member check-in modal (`WorkspaceMemberCheckInModal.tsx`).
- Create fresh account onboarding wizard (`FreshAccountOnboardingModal.tsx`) when 0 workspaces exist.
- Bump version to `0.57.0` and verify zero errors with `tsc --noEmit` and `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `channel`, `ai_summary`, and `whatsapp_draft` to `CallLogEntry`; defined `WorkspaceProfile` and added `workspace_profiles` to `UserProfile`. |
| `/src/components/QuickActivityDrawer.tsx` | Added `activityDate` state and datetime-local picker; fixed payload assembly date field. |
| `/src/components/Company360Modal.tsx` | Added `handleOutboundInteraction` helper to auto-pop activity drawer; applied dark mode contrast fixes. |
| `/src/components/CallLogDetailModal.tsx` | Created modal for viewing detailed activity log entries. |
| `/src/components/EnquiryList.tsx` | Applied dark mode contrast fixes to table cells and pagination. |
| `/src/components/CallLogManager.tsx` | Applied dark mode contrast fixes to queue items and history table. |
| `/src/services/SyncEngine.ts` | Added `exportWorkspaceData` and `importWorkspaceData` supporting `call_logs`. |
| `/src/components/WorkspaceManagerModal.tsx` | Integrated workspace JSON import button and per-workspace export button. |
| `/src/components/WorkspaceMemberCheckInModal.tsx` | Created modal prompting for Rep Initials, Job Title, and Direct Phone upon entering a workspace. |
| `/src/components/FreshAccountOnboardingModal.tsx` | Created un-dismissable onboarding modal for 1-Click Quick Start vs. Custom Workspace setups when 0 workspaces exist. |
| `/src/App.tsx` | Mounted `WorkspaceMemberCheckInModal` and `FreshAccountOnboardingModal`. |
| `/src/components/CompanyModal.tsx` | Replaced low-contrast text with `text-slate-200 font-mono text-xs` for phones/emails and `text-slate-400 text-xs` for location sub-labels in Companies table view. |
| `/src/components/SalespersonProfiles.tsx` | Added `deduplicatedSalespersons` memoization to ensure team members appear exactly once in sidebar roster. |
| `/src/components/WorkspaceMemberCheckInModal.tsx` | Formatted workspace name subtitle using `activeWorkspace?.name || activeWorkspace?.display_name || 'Active Workspace'`. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge pill in System Health header to `v0.57.0`, workspace-scoped local memory cache metrics, and added 7th "Activity Logs" metric card. |
| `/src/components/WorkspaceManagerModal.tsx` | Standardized terminology across dialogs and badges to "Activity Logs". |
| `/package.json` | Bumped version to `0.57.0`. |
| `/CHANGELOG.md` | Documented version `0.57.0` changes. |
| `/development_ledger.md` | Updated session log and modifications table. |

## Session: 2026-08-10 (Step 3 Gap Remediation: Reassign Open Data Handover Workflow)

### Goals
- Implement "Reassign Open Records Before Deletion" workflow when deleting sales representatives or user profiles.
- Create `src/components/ReassignOpenRecordsModal.tsx` displaying workload summary counts ("X open quotes and Y scheduled follow-ups") and a target team member selector.
- Intercept deletion in `SalespersonProfiles.tsx` and `UserManagementHub.tsx` to detect open enquiries (`status === 'Active'`) and pending activity logs.
- Provide "Reassign & Delete Profile" button to update open enquiries and logs to new representative before deleting via `safeDeleteDoc`.
- Provide "Direct Delete (Unassign)" button to clear salesperson assignments before deleting via `safeDeleteDoc`.
- Bump version to `0.54.0` and verify zero errors with `tsc --noEmit`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/ReassignOpenRecordsModal.tsx` | Created modal component for data handover before representative/user deletion. |
| `/src/components/SalespersonProfiles.tsx` | Integrated open records check and reassignment/unassign workflow before deleting salespersons. |
| `/src/components/UserManagementHub.tsx` | Integrated open records check and reassignment/unassign workflow before deleting users. |
| `/src/components/SettingsHub.tsx` | Passed `enquiries`, `salespersons`, `callLogs`, `setEnquiries`, `setCallLogs` to `UserManagementHub`. |
| `/src/App.tsx` | Passed `callLogs={workspaceCallLogs}` and `setCallLogs={setCallLogs}` to `SalespersonProfiles`. |
| `/package.json` | Bumped version to `0.54.0`. |
| `/CHANGELOG.md` | Documented version `0.54.0` changes. |
| `/development_ledger.md` | Updated session log and modifications table. |

## Session: 2026-08-10 (Step 2 Gap Remediation: Search Term Generators & Payload Attachment)

### Goals
- Export `generateContactSearchTerms` and `generateProductSearchTerms` helpers in `src/utils/defaults.ts`.
- Update `normalizeContact` in `defaults.ts` to backfill missing `search_terms` on startup.
- Attach `search_terms` array to payloads in `ContactModal.tsx` and `ProductManager.tsx`.
- Add `search_terms?: string[]` to `SoftDeleteFields` in `src/types.ts`.
- Bump version to `0.53.0` and verify zero errors with `tsc --noEmit`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/defaults.ts` | Added `generateContactSearchTerms` and `generateProductSearchTerms` helper functions, and updated `normalizeContact` to generate search terms when missing. |
| `/src/types.ts` | Added `search_terms?: string[]` to `SoftDeleteFields` interface. |
| `/src/components/ContactModal.tsx` | Imported `generateContactSearchTerms` and attached `search_terms` to contact save payload. |
| `/src/components/ProductManager.tsx` | Imported `generateProductSearchTerms` and attached `search_terms` to product save payload. |
| `/package.json` | Bumped version to `0.53.0`. |
| `/CHANGELOG.md` | Documented version `0.53.0` changes. |
| `/development_ledger.md` | Updated session log and modifications table. |

## Session: 2026-08-10 (Step 1 Gap Remediation: S/N Resequencing & DuplicateMatchModal)

### Goals
- Wire S/N resequencing in `src/App.tsx` after individual or bulk enquiry deletion.
- Implement `DuplicateMatchModal` in `src/components/DuplicateMatchModal.tsx` as a clean dark-slate dialog component with high-contrast warning banner and dual action buttons.
- Bump version to `0.52.0` and verify with `tsc --noEmit` and build.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Wired `syncSNNumbersInFirestore()` in `handleDeleteEnquiry` and `handleBulkDeleteEnquiries` to automatically resequence quote S/N numbers without gaps after deletions. |
| `/src/components/DuplicateMatchModal.tsx` | Implemented dark-slate duplicate match modal with warning banner, existing company details (Canonical Name, Phone, Contact), and dual action buttons ("Merge & Use Existing" vs "Save as Separate Record"). |
| `/package.json` | Bumped version to `0.52.0`. |
| `/CHANGELOG.md` | Documented version `0.52.0` changes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-08-10 (Creator & Modifier Audit Metadata Fields)

### Goals
- Attach creator metadata (`created_by_uid`, `created_by_name`) on new record creation across Companies and Contacts.
- Attach modifier metadata (`last_modified_by_uid`, `last_modified_by_name`, `updatedAt`) on updates across Companies, Contacts, Enquiries, and Activity Logs.
- Update type definitions in `src/types.ts` for `SoftDeleteFields` and `Contact`.
- Bump version to `0.51.0` and verify zero-warning build (`tsc --noEmit`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `created_by_uid`, `created_by_name`, `last_modified_by_uid`, `last_modified_by_name` to `SoftDeleteFields`, and `updatedAt?: string` to `Contact`. |
| `/src/components/CompanyModal.tsx` | Attached creator & modifier metadata to company creations, updates, inline contact creations, and duplicate merge updates. |
| `/src/components/ContactModal.tsx` | Attached creator & modifier metadata to contact creations, updates, and company phone/email reassignments. |
| `/src/components/EnquiryForm.tsx` | Attached creator & modifier metadata to main enquiry saves, inline company creations/updates, and inline contact creations/updates. |
| `/src/components/QuickActivityDrawer.tsx` | Attached creator & modifier metadata to call log entries and Auto-DNC company/contact suppression updates. |
| `/src/App.tsx` | Passed user state (`user`, `currentUserUid`, `currentUserName`) to `QuickActivityDrawer`. |
| `/package.json` | Bumped version to `0.51.0`. |
| `/CHANGELOG.md` | Documented version `0.51.0` changes. |
| `/development_ledger.md` | Updated session log and modifications table. |

## Session: 2026-08-09 (Phase 16 & 17 — Proposal Revisions, Quote Chains & Workspace Cascade Destruction)

### Goals
- Implement Phase 16 Proposal Revisions & Quote Chain History (`src/types.ts`, `EnquiryDetail.tsx`, `EnquiryForm.tsx`).
- Implement Phase 17 Workspace Cascade Destruction & Orphan Record Cleanup (`WorkspaceManagerModal.tsx`, `migration.ts`).
- Bump version to `0.50.0` and verify clean build and type check (`tsc --noEmit`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Updated `Enquiry` interface with `parent_id?: string | null` and `revision_number?: number`. |
| `/src/utils/defaults.ts` | Updated `normalizeEnquiry` to default `parent_id` and `revision_number`. |
| `/src/components/EnquiryDetail.tsx` | Added "📄 + Create Revision" CTA, revision chain generator, and interactive revision chain navigation. |
| `/src/components/EnquiryForm.tsx` | Retained `parent_id` and `revision_number` state when creating or editing revisions. |
| `/src/components/WorkspaceManagerModal.tsx` | Implemented `writeBatch` workspace cascade deletion across child entities (`companies`, `contacts`, `enquiries`, `call_logs`, `products`, `salespersons`) and target workspace doc, plus session state fallback. |
| `/src/utils/migration.ts` | Exported `scanAndPurgeOrphanedRecords` helper for batch purging orphaned records across collections. |
| `/package.json` | Bumped version to `0.50.0`. |
| `/CHANGELOG.md` | Recorded `0.50.0` release notes. |

### Goals
- Implement Auto-DNC Suppression Trigger in `QuickActivityDrawer.tsx` to automatically mark linked Contact (`is_dnc: true`, `dnc_reason: 'Opt-Out from Activity Log'`) and Company (`is_dnc: true`) as DNC when logging `dnc_opt_out`.
- Implement Canonical Search Key & Search Term Auto-Generation in `CompanyModal.tsx` and `src/utils/defaults.ts`.
- Ensure all Firestore calls use `safeUpdateDoc`, `safeAddDoc`, and `safeSetDoc` with error handling and offline synchronization.
- Bump version to `0.49.0` and verify zero lint or build errors.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `search_terms` array and `updatedAt` field to `Company` interface. |
| `/src/components/QuickActivityDrawer.tsx` | Added Auto-DNC suppression trigger on activity submission using `safeUpdateDoc` for linked contacts and companies. |
| `/src/utils/defaults.ts` | Implemented `computeCanonicalName` (suffix & punctuation stripping) and `generateCompanySearchTerms` (tokenization), and updated `normalizeCompany`. |
| `/src/components/CompanyModal.tsx` | Integrated `computeCanonicalName` and `generateCompanySearchTerms` into `submitCompany` and `onKeepNew` handlers. |
| `/package.json` | Bumped version to `0.49.0`. |
| `/CHANGELOG.md` | Recorded version `0.49.0` release notes. |

## Session: 2026-08-09 (Phase 14 — Standardized PageHeader Component & React Key Resolution)

### Goals
- Build reusable `PageHeader` component (`src/components/layout/PageHeader.tsx`) with title, subtitle, icon, badge, primary CTA, and secondary actions.
- Apply `PageHeader` across all top-level page views (`Dashboard.tsx`, `CallLogManager.tsx`, `EnquiryList.tsx`, `CompanyModal.tsx`, `SalespersonProfiles.tsx`, `ProductManager.tsx`, and `SettingsHub.tsx`).
- Eliminate React duplicate key warnings (e.g. key `SS`) when listing sales reps in Leaderboards, Sales Charts, Roster items, and Select options.
- Bump version to `0.48.0` and verify zero lint or build errors.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/layout/PageHeader.tsx` | Created standardized PageHeader layout component with crisp titles, subtitles, badges, and action bars. |
| `/src/components/layout/UiContainer.tsx` | Re-exported PageHeader component and types. |
| `/src/components/Dashboard.tsx` | Integrated PageHeader component and disambiguated sales rep key loops. |
| `/src/components/CallLogManager.tsx` | Integrated PageHeader component with Call Log action bar. |
| `/src/components/EnquiryList.tsx` | Integrated PageHeader component and disambiguated sales rep option keys. |
| `/src/components/CompanyModal.tsx` | Integrated PageHeader component with Company/Contact actions. |
| `/src/components/SalespersonProfiles.tsx` | Integrated PageHeader component and disambiguated sales rep roster keys. |
| `/src/components/ProductManager.tsx` | Integrated PageHeader component with product creation CTA. |
| `/src/components/SettingsHub.tsx` | Integrated PageHeader component with role badge. |
| `/package.json` | Bumped version to `0.48.0`. |
| `/CHANGELOG.md` | Recorded version `0.48.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-09`. |

## Session: 2026-08-09 (Phase 13 — Activity Velocity, Compliance Gauge & Pipeline Conversion Funnel)

### Goals
- Calculate activity log touchpoints grouped by channel (`Call`, `WhatsApp`, `Email`, `Meeting`, `Site Visit`) over configurable date ranges.
- Calculate Follow-Up Compliance Rate `(Completed Follow-ups / Total Scheduled Follow-ups) * 100%`.
- Build "Activity Velocity & Leaderboard" card in `src/components/Dashboard.tsx` with date filters, compliance score gauge, touchpoint channel progress bars, and top sales rep activity ranking.
- Build "Pipeline Conversion Funnel" card in `src/components/Dashboard.tsx` showing proposal stage counts, conversion percentages, and AED values.
- Bump version to `v0.47.0` and verify clean linting (`tsc --noEmit`) and production build.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/Dashboard.tsx` | Added activity velocity channel aggregation, follow-up compliance gauge, sales rep activity leaderboard, and pipeline conversion funnel cards with date range filtering. |
| `/package.json` | Bumped version to `0.47.0`. |
| `/CHANGELOG.md` | Recorded version `0.47.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-09`. |

## Session: 2026-08-09 (Phase 12 — AI Assist Toolbar & WhatsApp Message Drafter)

### Goals
- Implement "✨ AI Assist" Toolbar in `src/components/QuickActivityDrawer.tsx` with Summarize Notes and Draft WhatsApp Message actions.
- Implement server-side proxy endpoint `/api/gemini/quick-assist` in `server.ts` with Gemini API key pass-through and model fallback retry logic.
- Add Drafted WhatsApp Message preview box with custom text editor, Copy Text, and Copy & Send via WhatsApp buttons.
- Implement API key error safeguards prompting `GeminiKeyModal` on missing or invalid keys.
- Bump version to `v0.46.0` and verify clean linting (`tsc --noEmit`) and production build.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Added `/api/gemini/quick-assist` Express endpoint supporting note summarization and WhatsApp message drafting with Gemini client fallback retry logic. |
| `/src/components/QuickActivityDrawer.tsx` | Added "✨ AI Assist" toolbar (Summarize Notes, Draft WhatsApp Message buttons, key config indicator), WhatsApp preview box with wa.me dispatch, and GeminiKeyModal integration. |
| `/package.json` | Bumped version to `0.46.0`. |
| `/CHANGELOG.md` | Recorded version `0.46.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-09`. |

## Session: 2026-08-09 (Phase 11 — Workspace Memory, Pre-Delete Backup Safety & Follow-Up Radar)

### Goals
- Implement Workspace Memory persistence in `localStorage` in `src/App.tsx`.
- Render a visual Workspace Context Badge with active workspace name and visual color pill in header.
- Implement pre-deletion Data Breakdown analysis and dual backup/purge pathways ("Download JSON Backup & Purge Workspace", "Purge Without Backup") in `WorkspaceManagerModal.tsx`.
- Implement client-side JSON backup file download helper (`downloadJsonFile`).
- Implement Follow-Up Radar Command Center widget in `Dashboard.tsx` with Overdue/Due Today/Upcoming queues, tab navigation, task cards, and Call/WhatsApp/Log activity triggers.
- Bump version to `v0.45.0` and verify clean linting (`tsc --noEmit`) and production compilation (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Added `localStorage` memory for active workspace ID and rendered Workspace Context Badge in top header. |
| `/src/components/WorkspaceManagerModal.tsx` | Added pre-deletion record breakdown calculator, JSON backup downloader, and dual purge confirmation workflows. |
| `/src/components/Dashboard.tsx` | Integrated Follow-Up Radar widget with category filters, badge counts, task cards, and quick activity drawer action buttons. |
| `/package.json` | Bumped version to `0.45.0`. |
| `/CHANGELOG.md` | Recorded version `0.45.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-09`. |

## Session: 2026-08-08 (Phase 10 — Admin Role Preservation & Data Filter Alignment)

### Goals
- Fix role demotion in `src/utils/permissions.ts` where `getUserRoleInWorkspace` demoted global Admins to `'Member'` if `workspace_roles` lacked an explicit entry for a workspace.
- Preserve primary `defaultWorkspaceId` in `WorkspaceManagerModal.tsx` during invite redemption when joining secondary workspaces.
- Align data filtering in `src/App.tsx` so unassigned/legacy records without `workspace_id` remain visible in the default/primary workspace.
- Bump version to `v0.44.0` and verify clean linting (`tsc --noEmit`) and production build (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/permissions.ts` | Refactored `getUserRoleInWorkspace` to preserve global `'Admin'` role status unless explicitly mapped otherwise. |
| `/src/components/WorkspaceManagerModal.tsx` | Preserved user's primary `defaultWorkspaceId` when joining secondary workspaces via invite codes. |
| `/src/App.tsx` | Updated `useMemo` workspace filtering hooks (`companies`, `contacts`, `enquiries`, `salespersons`, `products`, `callLogs`) to allow unassigned/legacy records in primary default workspace view. |
| `/package.json` | Bumped version to `0.44.0`. |
| `/CHANGELOG.md` | Recorded version `0.44.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-08`. |

## Session: 2026-08-08 (Phase 9 — Document Merge Preservation & Payload Hardening)

### Goals
- Fix Firestore document wiping where `safeSetDoc` without `{ merge: true }` overwrote entire documents, deleting existing user profile fields (`email`, `full_name`) and workspace metadata (`name`, `modules`, `categories`).
- Refactor `safeSetDoc` in `src/firebase.ts` to default `options` to `{ merge: true }`.
- Upgrade `safeUpdateDoc` with a fallback `setDoc(docRef, data, { merge: true })` if the target document does not exist yet.
- Include complete object properties (`...currentUser` and full workspace metadata) in `userUpdatePayload` and `workspaceUpdatePayload` in `WorkspaceManagerModal.tsx`.
- Bump version to `v0.43.0` and verify clean linting (`tsc --noEmit`) and production compilation (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Updated `safeSetDoc` to default options to `{ merge: true }` and added fallback merge write to `safeUpdateDoc`. |
| `/src/components/WorkspaceManagerModal.tsx` | Expanded `userUpdatePayload` and `workspaceUpdatePayload` to retain complete document metadata and auto-heal missing workspace properties. |
| `/package.json` | Bumped version to `0.43.0`. |
| `/CHANGELOG.md` | Recorded version `0.43.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-08`. |

## Session: 2026-08-08 (Phase 8 — Cross-User Real-Time Invite Sync & Sequential Safe Writes)

### Goals
- Resolve cross-user invite redemption sync delay where claiming invite codes on User B's screen did not reflect on Admin A's roster or invite status registry.
- Refactor `WorkspaceManagerModal.tsx` `handleRedeemJoinCode` to execute user document updates FIRST before updating invite or workspace documents.
- Replace batch writes with error-trapped sequential safe writes (`safeSetDoc` -> `safeUpdateDoc` -> `safeSetDoc`) to prevent cross-tenant permission rejections in Firestore rules.
- Add direct Firestore re-fetch (`safeGetDoc('workspaces', targetWsId)`) during redemption to load Admin A's workspace metadata directly into User B's state.
- Implement read-only `onSnapshot` listeners in `InviteManager.tsx` (`invites` collection) and `UserManagementHub.tsx` (`workspaces/{activeWorkspace.id}` document) for real-time roster and invite token status updates.
- Bump version to `v0.42.0` and verify clean linting (`tsc --noEmit`) and production compilation (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added optional fields `is_used`, `claimed_by_uid`, `claimed_by_email`, `claimed_at` to `Invite` interface. |
| `/src/components/WorkspaceManagerModal.tsx` | Reordered redemption sequence in `handleRedeemJoinCode` to write User B's profile FIRST, use sequential safe writes, and perform a direct fresh fetch for workspace metadata. |
| `/src/components/InviteManager.tsx` | Added read-only `onSnapshot` listener on `invites` collection, filtered invites by workspace context, and updated UI badge to display "Claimed by [User/Email]". |
| `/src/components/UserManagementHub.tsx` | Added read-only `onSnapshot` listener on `workspaces/{activeWorkspace.id}` and merged workspace `members` into `effectiveUsers` so newly claimed members appear immediately in Admin A's roster. |
| `/package.json` | Bumped version to `0.42.0`. |
| `/CHANGELOG.md` | Recorded version `0.42.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-08`. |

## Session: 2026-08-08 (Phase 7 — Workspace-Scoped Roles, Invite Isolation & Real Account Deletion)

### Goals
- Implement workspace-scoped roles (`workspace_roles?: Record<string, UserRole>`) so a user can be an Admin in Workspace A while maintaining Member or Viewer status when joining Workspace B via invite code.
- Isolate invite codes per workspace ID (`workspace_id`) and prevent global role escalation during invite code redemption.
- Implement real, non-simulated account deletion purging user records across Firestore `users` and `workspaces` member rosters, IndexedDB stores, and LocalStorage caches.
- Bump version to `v0.41.0` and verify clean linting (`tsc --noEmit`) and production compilation (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `workspace_roles?: Record<string, UserRole>` to `UserProfile` interface and `workspace_id` to `Invite` interface. |
| `/src/utils/permissions.ts` | Refactored `getUserRoleInWorkspace` and `isWorkspaceAdmin` to evaluate permissions against `activeWorkspace.id`, updating `isRecordOwner`, `canEditOrDeleteRecord`, `getUserVisibilityTier`, and `canUserClickRecord`. |
| `/src/components/WorkspaceManagerModal.tsx` | Refactored `handleRedeemJoinCode` to store `assignedRole` in `workspace_roles[wsId]` without escalating global role, and updated `handleSave` to assign creator as `'Admin'` in new workspace member rosters. |
| `/src/components/InviteManager.tsx` | Tagged newly generated invite code documents explicitly with `workspace_id: wsId`. |
| `/src/components/UserManagementHub.tsx` | Updated role editing to target `workspace_roles` scoped to `activeWorkspace.id` and sync role updates to active workspace `members` roster in Firestore. |
| `/src/components/SettingsHub.tsx` | Replaced account deletion simulation with full database purge (removes user from all workspace member rosters, deletes `users` document, purges IndexedDB and LocalStorage via `clearAllLocalStores()`, and signs out of Firebase Auth). |
| `/src/components/Sidebar.tsx` | Updated user role badge display and navigation item filtering to use `getUserRoleInWorkspace(user, activeWorkspace?.id)`. |
| `/src/services/db.ts` | Added and exported `clearAllLocalStores()` helper function to wipe all IndexedDB stores and LocalStorage caches upon account deletion. |
| `/package.json` | Bumped version to `0.41.0`. |
| `/CHANGELOG.md` | Recorded version `0.41.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-08`. |

### Goals
- Eliminate Uncaught TypeError (`Cannot read properties of undefined (reading 'substring')`) runtime crash in published builds.
- Add defensive string fallbacks and optional chaining across workspace mapping loops (`WorkspaceManagerModal.tsx`) and user avatar/initials renderers (`Sidebar.tsx`, `App.tsx`, `UserManagementHub.tsx`, `UserProfileModal.tsx`).
- Sanitize `UserProfile` and `WorkspaceMember` payload creation in `WorkspaceManagerModal.tsx` and `Login.tsx` with non-empty string defaults.
- Harden helper functions `getInitials` (`types.ts`) and `deriveInitials` (`UserProfileModal.tsx`) against undefined or null parameters.
- Bump version to `v0.40.2` and verify clean linting (`tsc --noEmit`) and production compilation (`npm run build`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/WorkspaceManagerModal.tsx` | Replaced naked `ws.name.substring(0, 2)` inside `workspaces.map` with `(ws?.name || 'WS').substring(0, 2).toUpperCase()` and sanitized `WorkspaceMember`/`UserProfile` string properties. |
| `/src/components/Sidebar.tsx` | Added optional chaining and safe string fallbacks to `user.username.charAt(0)`, `user.full_name`, `user.role`, and `ws.name`. |
| `/src/App.tsx` | Guarded `user.username?.substring(0, 2)` avatar renderer and `activeWorkspace.name` header banner. |
| `/src/components/UserManagementHub.tsx` | Guarded `u.username || u.email.split('@')[0]` and avatar initial generation against undefined user/email properties. |
| `/src/components/UserProfileModal.tsx` | Hardened `deriveInitials` helper against non-string/null/undefined inputs. |
| `/src/components/Login.tsx` | Initialized `full_name` and `username` explicitly on new user profile creation. |
| `/src/types.ts` | Made `getInitials` defensive against undefined/null name inputs. |
| `/src/components/DocsSystemHub.tsx` | Updated release timeline with `v0.40.2` entry. |
| `/package.json` | Bumped version to `0.40.2`. |
| `/CHANGELOG.md` | Recorded version `0.40.2` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated contributor logs for session `2026-08-08`. |

## Session: 2026-08-08 (Phase 5 — Invite Code Consumption & Workspace Linking Bug Fix)

### Goals
- Resolve invite code redemption failure where claiming an invite code marked the invite as used but failed to show the workspace in the user's workspace selector list or display the user in the Admin's Workspace Team Members list.
- Implement an atomic multi-record write chain covering `invites`, `users`, and `workspaces` collections in Cloud Firestore and IndexedDB.
- Enforce immediate state/UI re-fetch and auto-switch active workspace context upon code redemption.
- Bump application version to `v0.40.1` and verify zero-error TypeScript linting and build compilation.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `WorkspaceMember` interface and updated `Workspace` interface to include `members?: WorkspaceMember[]`. |
| `/src/components/WorkspaceManagerModal.tsx` | Re-architected `handleRedeemJoinCode` to execute atomic `writeBatch` (with sequential `safeSetDoc`/`safeUpdateDoc` fallback) across `invites`, `users`, and `workspaces`, append user to `workspace.members`, update local storage caches, and trigger immediate UI re-fetch and active workspace switching. |
| `/package.json` | Bumped version to `0.40.1`. |
| `/CHANGELOG.md` | Recorded version `0.40.1` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated session details for `2026-08-08`. |

## Session: 2026-08-08 (Phase 4 — Modal Geometry Standardisation & Security Audit Trail)

### Goals
- Perform full-codebase UI, UX, and Design System Audit across all components in `/src/components/`.
- Standardise modal geometry (`max-h-[85vh]` / `max-h-[90vh]`, `max-w-2xl` / `max-w-4xl`, `flex flex-col`, `flex-1 overflow-y-auto`) across `ContactDetailModal.tsx`, `CallLogDetailModal.tsx`, and `Company360Modal.tsx`.
- Clamp retractable history sidebar width in `CompanyModal.tsx` (`w-80` / `w-96` on `xl`/`2xl`) to preserve fluid flex space for the Companies Registry table.
- Wire `auditLogs` into `CloudSyncHub.tsx` state backup/restoration routines and IndexedDB storage.
- Build Security Audit Trail & Activity Log UI in `SettingsHub.tsx` with instant search, action filtering (`CREATE`, `UPDATE`, `DELETE`), CSV export, and printable PDF report generation.
- Bump application version to `v0.40.0` and verify zero-error TypeScript linting and build compilation.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/ContactDetailModal.tsx` | Clamped viewport height (`max-h-[85vh]`), flex direction, and flex-1 scroll container. |
| `/src/components/CallLogDetailModal.tsx` | Clamped overlay height (`max-h-[85vh]`), header shrink-0, and scroll body container. |
| `/src/components/Company360Modal.tsx` | Standardised overlay bounds (`max-h-[85vh]`), flex-col layout, and internal scroll body. |
| `/src/components/CompanyModal.tsx` | Fixed side panel width (`w-80`/`w-96` on `xl`/`2xl`), preserving dominant flex space for table. |
| `/src/components/CloudSyncHub.tsx` | Added `auditLogs` handling in backup JSON export/import and IndexedDB persistence. Bumped badge to `v0.40.0`. |
| `/src/components/SettingsHub.tsx` | Built Security Audit Trail & Activity Log card with search, action filtering, CSV export, and printable PDF report generation. |
| `/src/App.tsx` | Passed `auditLogs` and `setAuditLogs` props down to `SettingsHub`. |
| `/src/components/DocsSystemHub.tsx` | Updated release timeline changelog with v0.40.0 entry. |
| `/package.json` | Bumped version to `0.40.0`. |
| `/CHANGELOG.md` | Recorded version `0.40.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated session details for `2026-08-08`. |

## Session: 2026-08-08 (Phase 2 Refinement — Permissions & Data Privacy Lockdown & BASIC Tier Masking)

### Goals
- Refactor permissions engine (`src/utils/permissions.ts`) to enforce strict attribution checks (`isRecordOwner`, `canEditOrDeleteRecord`, `canUserClickRecord`).
- Mask sensitive contact details (phones, emails, handles) in `ContactDetailModal.tsx` and `CallLogDetailModal.tsx` for non-attributed `BASIC` tier users.
- Suppress Edit and Delete triggers in `CallLogManager.tsx` for scheduled call queues and history tables.
- Suppress Edit, Merge, and Delete triggers in `CompanyModal.tsx` for unauthorized non-admin users.
- Enforce attribution-aware financial masking in `EnquiryDetail.tsx` (`isMaskedForBasic`).
- Bump version to `v0.39.0` and verify zero-error linting and production build compilation.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/permissions.ts` | Enforced strict attribution matching for `isRecordOwner`, `canEditOrDeleteRecord`, and `canUserClickRecord`. |
| `/src/components/ContactDetailModal.tsx` | Added data masking for phone numbers and email handles for non-attributed `BASIC` tier users. |
| `/src/components/CallLogDetailModal.tsx` | Added data masking for phone numbers and requirement notes for non-attributed `BASIC` tier users. |
| `/src/components/CallLogManager.tsx` | Suppressed Edit and Delete action triggers in scheduled call queue and call history table for non-owners. |
| `/src/components/CompanyModal.tsx` | Suppressed Edit, Merge, and Delete action buttons across Companies Registry and Company 360 inspector for unauthorized users. |
| `/src/components/EnquiryDetail.tsx` | Updated `formatCurrency` to evaluate attribution (`isMaskedForBasic`) for `BASIC` tier users. |
| `/package.json` | Bumped version to `0.39.0`. |
| `/CHANGELOG.md` | Documented version `0.39.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated session details for `2026-08-08`. |

## Session: 2026-08-08 (Phase 1 Refinements — Call Logger Channel Logic, Quick-Create Expansion & Export Headers)

### Goals
- Implement `handleChannelSwitch` in `CallLogManager.tsx` to automatically reset status and outcome fields to channel-appropriate defaults upon tab switching.
- Expand the 1-Click Quick-Create form in `CallLogManager.tsx` to capture full company metadata: City/Area, Country, Heat Temperature, Phone Label, and Contact Designation.
- Enhance General Company Contacts selection in `CallLogManager.tsx` to auto-populate contact personnel dropdowns and provide a `-- Direct Company Line --` option that fills the primary company telephone number.
- Align CSV and PDF export generators in `CallLogReportModal.tsx` to include `Interaction Channel / Mode` header columns and record row formatting.
- Bump version to `v0.38.0` and verify zero-error TypeScript linting and production build compilation.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Added `handleChannelSwitch`, expanded Quick Create state and UI layout with full metadata inputs, enhanced Company/Contact auto-fill logic. |
| `/src/components/CallLogReportModal.tsx` | Updated CSV export and printable PDF report table headers and activity log rows to include Interaction Channel / Mode. |
| `/package.json` | Bumped version to `0.38.0`. |
| `/CHANGELOG.md` | Documented version `0.38.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated session details for `2026-08-08`. |

## Session: 2026-08-08 (Soft-Delete Architecture & Recycle Bin Recovery Hub)

### Goals
- Implement Soft-Delete architecture across core data entities (`Enquiry`, `Company`, `Contact`, `Product`, `CallLogEntry`) to eliminate offline delete/update conflict data loss.
- Extend repositories (`EnquiryRepository`, `CompanyRepository`, `CallLogRepository`, `MetadataRepository`) with `softDelete`, `restore`, and `purgePermanent` operations.
- Build `TrashBinModal.tsx` Recycle Bin & Data Recovery Hub with category filtering, search, restoration, and role-gated permanent purge capabilities.
- Integrate Recycle Bin trigger into `Sidebar.tsx` and wire modal in `App.tsx`.
- Update main UI list views (`EnquiryList`, `CompanyModal`, `ProductManager`, `CallLogManager`) to filter out soft-deleted items.
- Bump application version to `v0.37.0` and update documentation ledger.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `SoftDeleteFields` interface and extended `Company`, `Contact`, `Enquiry`, `Product`, `CallLogEntry`. |
| `/src/services/repositories/EnquiryRepository.ts` | Added `softDelete`, `restore`, `purgePermanent`, and updated `delete`. |
| `/src/services/repositories/CompanyRepository.ts` | Added soft delete and restore methods for Companies and Contacts. |
| `/src/services/repositories/CallLogRepository.ts` | Added soft delete and restore methods for Call Logs. |
| `/src/services/repositories/MetadataRepository.ts` | Added soft delete and restore methods for Products. |
| `/src/components/TrashBinModal.tsx` | Built Recycle Bin & Data Recovery Modal component with tab filters, search, restore, and purge actions. |
| `/src/components/Sidebar.tsx` | Added `onOpenTrashBin` prop and quick-action Recycle Bin button in sidebar footer. |
| `/src/components/EnquiryList.tsx` | Added filter to exclude soft-deleted enquiries from main list view. |
| `/src/components/CompanyModal.tsx` | Added filters to exclude soft-deleted contacts and companies from registry views. |
| `/src/components/ProductManager.tsx` | Added filter to exclude soft-deleted products from product catalog view. |
| `/src/components/CallLogManager.tsx` | Added filter to exclude soft-deleted call logs from Call Center view. |
| `/src/App.tsx` | Imported and mounted `TrashBinModal` and wired state refresh callbacks. |
| `/package.json` | Bumped version to `0.37.0`. |
| `/CHANGELOG.md` | Documented version `0.37.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated Principal Full-Stack Engineer role log with session `2026-08-08` entries. |

### Goals
- Resolve Cloud Firestore credit/quota depletion caused by infinite real-time snapshot write loops.
- Transition data pipeline to a Local-First Repository Architecture backed by IndexedDB (`db.ts`) and `SyncEngine.ts` background mutation worker.
- Build typed repositories (`EnquiryRepository`, `CompanyRepository`, `CallLogRepository`, `MetadataRepository`).
- Disconnect recursive writes in `App.tsx` snapshot listeners (`syncSNNumbersInFirestore`, dropdown auto-seeding, `audit_logs` socket).
- Transform `CloudSyncHub.tsx` into a System Health & Connectivity Monitor with live queue depth inspection and JSON backup/restore.
- Bump application version to `v0.36.0` and update documentation.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/services/db.ts` | Created IndexedDB client database wrapper with `omni_cache` and `mutation_queue` object stores. |
| `/src/services/SyncEngine.ts` | Created background worker listening for network state and executing periodic queue flush cycles (5s interval). |
| `/src/services/repositories/EnquiryRepository.ts` | Created Enquiry repository for local storage caching, optimistic updates, and background sync. |
| `/src/services/repositories/CompanyRepository.ts` | Created Company and Contact repository for local caching and background mutation sync. |
| `/src/services/repositories/CallLogRepository.ts` | Created CallLog repository for local storage caching and background mutation sync. |
| `/src/services/repositories/MetadataRepository.ts` | Created Metadata repository for products, salespersons, and audit log write-only operations. |
| `/src/App.tsx` | Removed recursive write operations inside `onSnapshot` callbacks and disconnected `audit_logs` socket. |
| `/src/firebase.ts` | Updated `safeAddDoc`, `safeSetDoc`, `safeUpdateDoc`, and `safeDeleteDoc` to automatically enqueue mutations into `syncEngine` on network error or simulation mode. |
| `/src/components/CloudSyncHub.tsx` | Transformed into System Health & Connectivity Hub with live queue depth, network state, and JSON backup/restore. |
| `/src/components/SettingsHub.tsx` | Added On-Demand System Maintenance card with manual S/N re-indexing batch button. |
| `/package.json` | Bumped version to `0.36.0`. |
| `/src/components/DocsSystemHub.tsx` | Added `v0.36.0` release entry to changelog timeline. |
| `/CHANGELOG.md` | Documented version `0.36.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated Principal Full-Stack Engineer role log with session `2026-08-08` entries. |

## Session: 2026-08-08 (Comprehensive Technical & Full-Stack Application Audit)

### Goals
- Audit entire application codebase, runtime services, type systems, build processes, and security rules.
- Verify zero-warning TypeScript compilation (`npx tsc --noEmit`) and production bundle compilation (`npm run build`).
- Synchronize application version indicators (`v0.35.0`) in `CloudSyncHub.tsx`, `DocsSystemHub.tsx`, `package.json`, `CHANGELOG.md`, `development_ledger.md`, and `CONTRIBUTORS.md`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/package.json` | Bumped version to `0.35.0`. |
| `/src/components/CloudSyncHub.tsx` | Synchronized `appVersion` export string and header version badge to `v0.35.0`. |
| `/src/components/DocsSystemHub.tsx` | Added missing release history entries (versions 0.10.0 to 0.35.0) to `changelog` array. |
| `/CHANGELOG.md` | Documented version `0.35.0` audit release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |
| `/CONTRIBUTORS.md` | Updated Principal Full-Stack Engineer role log with session `2026-08-08` entries. |

## Session: 2026-08-07 (Full Row Width & Extendable/Retractable Companies Registry Layout)

### Goals
- Restructure Companies Registry layout in `CompanyModal.tsx` so the table takes the full row width (`w-full`), preventing column squishing and text wrapping.
- Implement extendable & retractable controls (`isRegistryCollapsed` state) allowing operators to collapse the top table into a 1-line banner when inspecting a company.
- Ensure the Selected Company 360 inspector and Outreach History panel have maximum screen space (`w-full` row width with `xl:flex-row` side panel).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Added `isRegistryCollapsed` state, converted layout to full-width row stack (`w-full`), added `Retract Registry` and `Expand Registry Table` buttons, and gave Selected Company Inspector 100% row width. |
| `/src/App.tsx` | Handled `QuotaExceededError` in `setLocalCache` gracefully to prevent localStorage console warnings. |
| `/package.json` | Bumped version to `0.34.0`. |
| `/CHANGELOG.md` | Documented version `0.34.0` changes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-08-07 (Call Log Deletion Fix, Company Modal Layout Adjustments, Add Contact Person Button & Email Default)

### Goals
- Fix call log deletion from the "View Call Log" detail modal invoked via `CompanyModal.tsx`.
- Adjust full-screen CSS grid layout in `CompanyModal.tsx` to prevent company details squishing when the history side panel is expanded.
- Clean up doubled emojis across labels, buttons, toasts, and dropdown options in `EnquiryForm.tsx`.
- Set default "Mode of Enquiry" dropdown choice to "Email".
- Add direct `+ Add Contact` button next to "Account Contact Personnel" in `EnquiryForm.tsx` with instant local state updates.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Passed `setCallLogs={setCallLogs}` prop to `<CompanyModal />`. |
| `/src/components/CompanyModal.tsx` | Added `setCallLogs` to props, wired `onDelete` in `CallLogDetailModal` call to `safeDeleteDoc('call_logs', id)` & state update, and adjusted flex grid column widths (`xl:w-1/2 2xl:w-7/12`) with `2xl:flex-row` side panel layout. |
| `/src/components/EnquiryForm.tsx` | Defaulted `enquirySource` state to `'Email'`, added direct `+ Add Contact` and `Edit` buttons next to Account Contact Personnel, updated contact modal submission to update `setContacts` state, and cleaned up text emojis. |
| `/package.json` | Bumped version to `0.33.0`. |
| `/CHANGELOG.md` | Documented version `0.33.0` changes and fixes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

### Goals
- Implement "Concerned Person" multi-select team member tagging in `EnquiryForm.tsx` and integrate with `types.ts` and `permissions.ts`.
- Refactor the Outreach & Proposal History in `CompanyModal.tsx` into a retractable, independently scrollable side panel matching `CallLogManager.tsx`.
- Standardize call log owner display labels to "Logged by: *Name*".
- Enable click-to-inspect on call and proposal cards across history panels for Admins, record owners, and tagged concerned persons.
- Clean up doubled text emojis across `CompanyModal.tsx` and `CallLogManager.tsx` with clean Lucide icons.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `concerned_persons?: string[]` to `Enquiry` and `CallLogEntry` interfaces. |
| `/src/utils/permissions.ts` | Updated `isRecordOwner` and `canUserClickRecord` to validate access based on `concerned_persons` array matching user ID, email, initials, or full name. |
| `/src/components/EnquiryForm.tsx` | Added multi-select team tagging UI block and state for `concernedPersons` with payload integration and pre-population on edit. |
| `/src/components/CompanyModal.tsx` | Replaced standard history card with a retractable side panel with scrollable list, standardized "Logged by: *Name*" labels, added click handlers for inspection modals, and removed doubled emojis. |
| `/src/components/CallLogManager.tsx` | Added `onSelectEnquiry` prop handling, updated proposal history cards with owner name formatting, click-to-open handlers, and removed doubled emojis. |
| `/package.json` | Bumped version to `0.32.0`. |
| `/CHANGELOG.md` | Documented version `0.32.0` additions and permissions updates. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-08-07 (Company 360 Call History, Collapsible Side Panel History & Inline Contact Creator)

### Goals
- Add linked call log history to the Company detail view alongside enquiries.
- Redesign the duplicate outreach & contact history check in the call logging modal into an independently scrollable side panel.
- Add an inline "+ Add New Contact Person" option inside the call log contact dropdown for quick account creation without flow disruption.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Replaced "Historic Linked Enquiries" with a comprehensive "Linked Outreach & Proposal History" section displaying linked Call Logs and Enquiries/Quotes with status badges, owner details, and requirement notes. Filtered by user data visibility tier and scope. |
| `/src/components/CallLogManager.tsx` | Added state for `isHistorySidePanelExpanded` and `showInlineContactCreate`. Redesigned call logging modal into a multi-column layout with a collapsible history side panel (header toggle button) and added inline contact person creation fields linked directly to company accounts. |
| `/package.json` | Bumped version to `0.31.0`. |
| `/CHANGELOG.md` | Documented version `0.31.0` feature additions. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-08-07 (Security Hardening, Permission & Visibility Tiers, Linked History & Outreach Duplicate Checks)

### Goals
- Resolve Admin privilege escalation vulnerability by requiring confirmed Admin authorization to grant Admin status.
- Restrict invite code redemption strictly to the intended `workspace_id`.
- Eliminate repetitive profile/workspace setup prompts on page refresh and fix stale invite code validation.
- Implement per-user data visibility tiers (`ADVANCED` vs `BASIC`) and record ownership access control.
- Add expandable linked history views in company/contact modals and an inline duplicate outreach check panel in Call Center logging.
- Rename breadcrumbs from "Salesperson" to "Team Roster" and fix filter dropdown borders in `CompanyModal.tsx`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/InviteManager.tsx` | Restricted Admin role assignment to existing Admins and stamped target `workspace_id` on new invite codes. |
| `/src/components/UserManagementHub.tsx` | Restrict self/peer Admin escalation and added per-user `dataVisibilityTier` UI controls for Admins. |
| `/src/App.tsx` | Enforced workspace ID scope on invite code redemption, cached profile completion state, fetched real-time fresh invite records from Firestore, and renamed breadcrumb to "Team Roster". |
| `/src/types.ts` | Added `dataVisibilityTier` ('ADVANCED' \| 'BASIC') to `UserProfile`. |
| `/src/utils/permissions.ts` | Created central permission utility module containing `isRecordOwner`, `canEditOrDeleteRecord`, and `getUserVisibilityTier`. |
| `/src/components/SalespersonProfiles.tsx` | Masked email, phone, and financial figures for BASIC visibility users and gated edit/delete actions by record ownership. |
| `/src/components/CallLogDetailModal.tsx` | Added `currentUser` prop, gated requirement notes by visibility tier, and restricted edit/delete controls to record owners/Admins. |
| `/src/components/CallLogManager.tsx` | Added inline duplicate outreach and history check box in call logging form and passed `currentUser` to `CallLogDetailModal`. |
| `/src/components/ContactDetailModal.tsx` | Added expandable Linked Outreach & Proposal History section, gated contact handles/details for BASIC tier, and restricted edit/delete controls. |
| `/src/components/CompanyModal.tsx` | Fixed filter dropdown styling using `appearance-none` with `ChevronDown` icons, and passed `callLogs`, `enquiries`, and `currentUser` to `ContactDetailModal`. |
| `/src/components/EnquiryList.tsx` | Filtered enquiries by `OWN_DATA_ONLY` scope and gated edit/delete actions using `canEditOrDeleteRecord`. |
| `/src/components/EnquiryDetail.tsx` | Masked financial totals for BASIC tier and gated edit/delete controls using `canEditOrDeleteRecord`. |
| `/package.json` | Bumped version to `0.30.0`. |
| `/CHANGELOG.md` | Documented version `0.30.0` security fixes and feature additions. |
| `/development_ledger.md` | Recorded session modifications table. |

## Session: 2026-08-06 (Workspace Deletion, API & Database Health Diagnostics, Admin Access & Assignment Governance)

### Goals
- Add workspace deletion capability with custom confirmation state UI in `WorkspaceManagerModal.tsx`.
- Implement API Key Health Ping test and Firestore database record & quota monitoring tab in `SettingsHub.tsx`.
- Create admin visibility scope toggles (`ALL_DATA` vs. `OWN_DATA_ONLY`) and salesperson assignment permission locks in `SettingsHub.tsx` and `EnquiryForm.tsx`.
- Replace native `window.confirm` calls across the codebase with React state-based confirmation overlays to eliminate iframe sandboxing errors.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/WorkspaceManagerModal.tsx` | Implemented `handleDeleteWorkspace` using `safeDeleteDoc`, added inline trash action and confirm delete card, and wrapped workspace items with `React.Fragment`. |
| `/src/components/SettingsHub.tsx` | Created "API & Database Health" subtab with live API ping tester, latency counter, database record counters, and Spark tier quota reference cards. Rendered Admin Governance Panel for visibility scope and salesperson selection rights under team management. |
| `/src/App.tsx` | Added `dataVisibilityScope` and `allowUserSalespersonSelection` state persisted in local storage, implemented filtered data views (`visibleEnquiries`, `visibleCallLogs`), and drilled permission state to child components. |
| `/src/components/EnquiryForm.tsx` | Added `allowUserSalespersonSelection` prop and locked salesperson selection dropdown for non-admin team members when restricted by admin policy. |
| `/src/components/DocsSystemHub.tsx` | Replaced `window.confirm` custom instructions wipe prompt with custom React confirmation state. |
| `/src/components/CompanyModal.tsx` | Replaced `window.confirm` delete company confirmation with state-based overlay. |
| `/src/components/Company360Modal.tsx` | Replaced `window.confirm` delete company confirmation with state-based overlay. |
| `/src/components/ContactModal.tsx` | Replaced `window.confirm` delete contact confirmation with state-based overlay. |
| `/package.json` | Bumped application version to `0.29.0`. |
| `/CHANGELOG.md` | Documented version `0.29.0` release notes. |
| `/development_ledger.md` | Recorded development session goals and file modification table. |

### Goals
- Short-circuit backoff retries when encountering 429 / RESOURCE_EXHAUSTED / depleted prepayment credits on the server to prevent latency and redundant retry logs.
- Refine client extraction error detection in `EnquiryForm.tsx` to display non-intrusive notices with direct actions for personal API key configuration or Smart Paste usage.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Added `isQuotaExhausted` check to `retryWithBackoffAndFallback` to immediately rethrow on credit depletion, and formatted 429 quota depletion responses cleanly. |
| `/src/components/EnquiryForm.tsx` | Expanded quota/rate limit string detection to convert 429 errors into informative notices offering one-click personal API key setup or offline Smart Paste fallback. |
| `/package.json` | Bumped application version to `0.28.1`. |
| `/CHANGELOG.md` | Documented version `0.28.1` updates. |
| `/development_ledger.md` | Prepended `0.28.1` development session log. |

## Session: 2026-08-06 (Personal Gemini API Key BYOK & Interactive Prompt Modal)

### Goals
- Implement Bring Your Own Key (BYOK) architecture allowing operators to save and use their own personal Google AI Studio Gemini API key.
- Provide a one-click button directly linking to `https://aistudio.google.com/app/apikey` for fast key generation.
- Support `x-user-gemini-api-key` headers in backend proxy (`server.ts`) to prioritize personal keys over server environment defaults.
- Embed interactive key configuration controls in System Settings (`SettingsHub.tsx`) and extraction failure banners (`EnquiryForm.tsx`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/GeminiKeyModal.tsx` | Built dedicated Gemini API key manager modal with password toggle, local browser storage (`omni_user_gemini_api_key`), clear action, and one-click link to `https://aistudio.google.com/app/apikey`. |
| `/server.ts` | Updated `getGeminiClient` and `/api/gemini/extract-enquiry` to read `x-user-gemini-api-key` request headers and initialize GoogleGenAI with the user's key when provided. |
| `/src/components/EnquiryForm.tsx` | Added `x-user-gemini-api-key` header to extraction fetch calls, added "Configure Personal Gemini API Key" button to notice banner, and rendered `GeminiKeyModal`. |
| `/src/components/SettingsHub.tsx` | Integrated Personal Gemini API Key configuration card and modal trigger under System Settings -> Account & Session Management. |
| `/package.json` | Bumped application version to `0.28.0`. |
| `/CHANGELOG.md` | Documented version `0.28.0` updates. |
| `/development_ledger.md` | Prepended `0.28.0` development session log. |

## Session: 2026-08-06 (API Key Guidance Banner & Offline Smart Paste Fallback)

### Goals
- Resolve operator confusion around deleted/missing `GEMINI_API_KEY`s causing 401 unauthenticated extraction notices.
- Provide step-by-step guidance inside `EnquiryForm.tsx` on configuring `GEMINI_API_KEY` in AI Studio Settings.
- Guarantee uninterrupted form completion using client-side Smart Paste which operates 100% offline with zero API key requirement.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added `KeyRound` and `Info` icons, rendered step-by-step AI Studio Settings guidance banner on 401 API key error, added direct "Use Smart Paste Instead" button, and updated `handleExtractFromRawText` to preserve instant pre-parsed data with an informative notice when Gemini key is missing. |
| `/package.json` | Bumped application version to `0.27.2`. |
| `/CHANGELOG.md` | Documented version `0.27.2` updates. |
| `/development_ledger.md` | Prepended `0.27.2` development session log. |

## Session: 2026-08-06 (Gemini API 401 Extraction Error Isolation & Proxy Resilience)

### Goals
- Resolve Gemini API 401 Unauthenticated extraction errors occurring when `GEMINI_API_KEY` is unconfigured, missing, or set to placeholder credentials.
- Implement lazy client initialization and short-circuit validation in `server.ts` to reject unauthenticated requests before calling Google GenAI endpoints.
- Enhance error handling in `EnquiryForm.tsx` to handle 401 API key configuration notices gracefully without dumping console error stack traces.
- Fix missing `recordAuditLog` import in `src/App.tsx`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Implemented `getGeminiClient()` lazy initializer, added 401 short-circuiting on missing/placeholder keys in `/api/gemini/extract-enquiry`, bypassed retries on auth errors, and updated catch block to return status 401 with `isAuthError: true`. |
| `/src/components/EnquiryForm.tsx` | Updated `handleExtractFromAttachment` and `handleExtractFromRawText` catch blocks to identify 401 auth/key errors and display clear user guidance while preserving instant pre-parsed data. |
| `/src/App.tsx` | Added missing `recordAuditLog` import from `./utils/auditLogger`. |
| `/package.json` | Bumped application version to `0.27.1`. |
| `/CHANGELOG.md` | Documented version `0.27.1` updates. |
| `/development_ledger.md` | Prepended `0.27.1` development session log. |

## Session: 2026-08-06 (Comprehensive Deletion Error Handling & State Synchronization Overhaul)

### Goals
- Resolve deletion issues where deleting enquiries, contacts, companies, or salespersons failed silently or failed to update the UI.
- Enhance `safeDeleteDoc` with strict ID validation, detailed diagnostic logging, and explicit boolean success returns.
- Ensure all delete operations immediately purge local state and local cache (`omni_enquiries`) to provide zero-latency feedback and prevent stale snapshot re-renders.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Upgraded `safeDeleteDoc` with strict docId string validation, `console.log` / `console.error` diagnostic tracing, and boolean return values (`true` for success / offline mode, `false` for invalid ID or error). |
| `/src/App.tsx` | Re-architected `handleDeleteEnquiry` and `handleBulkDeleteEnquiries` to validate IDs, instantly update `enquiries` state and `omni_enquiries` localCache, execute `safeDeleteDoc`, record audit logs, and trigger toast notifications. |
| `/src/components/EnquiryList.tsx` | Added fallback ID checks (`e.id || _id`) and `cursor-pointer` styling to delete button handler before triggering confirmation modal. |
| `/src/components/EnquiryDetail.tsx` | Added fallback ID checks (`enquiry.id || _id`) before triggering deletion and closing detail view. |
| `/src/components/ContactModal.tsx` | Enhanced `handleDeleteContact` with fallback ID checks and instant `setContacts` state purging before executing `safeDeleteDoc`. |
| `/src/components/CompanyModal.tsx` | Updated `handleDeleteContact` and `handleExecuteCompanyDelete` to update `setContacts` and `setCompanies` immediately before executing Firestore deletions. |
| `/src/components/Company360Modal.tsx` | Added fallback ID check and immediate `setContacts` state purging in `handleDeleteContact`. |
| `/src/components/ProductManager.tsx` | Added fallback ID check and immediate `setProducts` state purging in `handleDeleteProduct`. |
| `/src/components/SalespersonProfiles.tsx` | Added fallback ID check and immediate `setSalespersons` state purging in `handleDeleteSalesperson`. |
| `/package.json` | Bumped application version to `0.27.0`. |
| `/CHANGELOG.md` | Documented version `0.27.0` updates. |
| `/development_ledger.md` | Prepended `0.27.0` development session log. |

### Goals
- Resolve validation block that prevented saving contacts assigned to `(Unassigned / Independent Contact)`.
- Ensure new contacts created from global directory default to unassigned (`""`) rather than forcibly linking to the first available company.
- Cleanly label independent contacts across the directory with `(Unassigned / Independent)` badges and neutral location indicators.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/ContactModal.tsx` | Removed `if (!companyId)` validation check in `handleSubmit`, updated `payload.company_id` fallback to `companyId || ''`, and set new contact form state default `companyId` to `initialCompanyId || ''`. |
| `/src/components/CompanyModal.tsx` | Updated `allContactsWithCompany` computation to label contacts without a `company_id` as `(Unassigned / Independent)` with `—` location. |
| `/package.json` | Bumped application version to `0.26.0`. |
| `/CHANGELOG.md` | Documented version `0.26.0` updates. |
| `/development_ledger.md` | Prepended `0.26.0` development session log. |

## Session: 2026-08-06 (Team Member Roster Self-Onboarding & Deletion Unlocking)

### Goals
- Resolve team roster deletion constraints where single/last salespersons could not be deleted (`salespersons.length > 1` guard).
- Provide a direct "Add Myself to Team Roster" feature for operators upon initial onboarding or when viewing the Team Roster panel.
- Ensure onboarding details saved via `UserProfileModal` automatically sync or create a matching team member entry in the `salespersons` collection.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/SalespersonProfiles.tsx` | Added `currentUser` prop, `currentUserInRoster` state check, `handleAddMyselfToRoster` handler, "Add Myself" button and roster status banner, removed length restriction on list deletion, and added `Delete Rep` header button with audit logging. |
| `/src/components/UserProfileModal.tsx` | Added `salespersons`, `setSalespersons`, `activeWorkspaceId` props, "Sync to Team Member Roster" checkbox, and automatic salesperson record creation/update in Firestore on submit. |
| `/src/App.tsx` | Passed `user` to `SalespersonProfiles` and `salespersons`/`setSalespersons`/`activeWorkspace.id` to `UserProfileModal`. |
| `/package.json` | Bumped application version to `0.25.0`. |
| `/CHANGELOG.md` | Documented version `0.25.0` updates. |
| `/development_ledger.md` | Prepended `0.25.0` development session log. |

## Session: 2026-08-06 (Multi-Select Contact Directory & Bulk Contact Operations)

### Goals
- Resolve single and multi-contact deletion issues by reinforcing individual contact deletion and building a full multi-select framework for the People & Key Contacts Directory.
- Implement selection checkboxes in both Card and Table views with select-all and deselect-all capabilities.
- Build a floating/sticky Bulk Actions Toolbar offering Batch Delete, Bulk Company Reassignment, Bulk DNC Flagging, and Selected CSV Export.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CompanyModal.tsx` | Added `selectedContactIds` state, bulk contact handlers, checkboxes, bulk actions bar, and bulk company reassignment modal. |
| `/src/components/ContactModal.tsx` | Refactored `handleDeleteContact` with error handling, audit logging, and `onSaved` parent state callback. |
| `/src/components/Company360Modal.tsx` | Added individual contact trash icon and deletion handler. |
| `/package.json` | Bumped application version to `0.24.0`. |
| `/CHANGELOG.md` | Documented version `0.24.0` updates. |
| `/development_ledger.md` | Prepended the `0.24.0` development session logs. |

### Goals
- Resolve the issue where offline cached data or a delayed/incomplete Firestore sync prevents users from seeing the full canonical set of standard call statuses and outcomes.
- Design and integrate a robust, multi-layer `healDropdownOptions` helper that immediately identifies, merges, and heals any missing or corrupt canonical statuses and outcomes on application startup, regardless of network or sync state.
- Ensure Firestore snapshot listeners instantly supply a locally-healed list to the UI state while writing missing items back to the cloud asynchronously, avoiding render delays.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/defaults.ts` | Developed the robust `healDropdownOptions` merging helper to restore missing default items and standardize key formats. |
| `/src/App.tsx` | Integrated `healDropdownOptions` into the `callStatuses` and `callOutcomes` React state initializers and updated `onSnapshot` listeners to provide instant local healing. |
| `/package.json` | Bumped application version to `0.23.2`. |
| `/CHANGELOG.md` | Documented version `0.23.2` updates and self-healing system behavior. |
| `/development_ledger.md` | Prepended the `0.23.2` development session logs. |

## Session: 2026-08-05 (Fix React Hooks Order & Safe Self-Healing Metadata Seeding)

### Goals
- Resolve the Rules of Hooks ordering exception in `CallLogReportModal.tsx` by unconditionally declaring `useMemo` hooks before the early `isOpen` return statement.
- Upgrade Firestore `onSnapshot` listeners in `App.tsx` with self-healing capabilities to automatically restore/heal deleted or mismatched default Call Statuses and Outcomes.
- Integrate a robust `normalizeOptionName` utility to support resilient string/Unicode comparisons (such as mapping `–` en-dashes to standard hyphens and cleaning whitespace) to prevent bypass of immutable checks.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/defaults.ts` | Added `normalizeOptionName` helper to handle Unicode-aware dash and whitespace normalization. |
| `/src/components/DropdownSettingsManager.tsx` | Integrated `normalizeOptionName` into the `isSystemOption` helper to block edit/delete actions accurately. |
| `/src/components/CallLogReportModal.tsx` | Relocated all `useMemo` hooks to execute before early return checks, resolving the React hook ordering error. |
| `/src/App.tsx` | Implemented self-healing document checkers in `onSnapshot` listeners to automatically seed/correct missing or corrupt default statuses and outcomes. |
| `/package.json` | Bumped application version to `0.23.1`. |
| `/CHANGELOG.md` | Documented version `0.23.1` updates and React hook correction notes. |
| `/development_ledger.md` | Prepended the `0.23.1` development session logs and modifications ledger. |

## Session: 2026-08-05 (Immutable Default Dropdown Metadata & Dynamic Report Filters)

### Goals
- Enforce immutable default dropdown options by locking down system Call Statuses and Call Outcomes from being modified, edited, or deleted.
- Add a visual "System Default" identifier badge and hide/disable edit/delete action triggers for protected options.
- Fix Call Log export CSV and PDF report metrics inaccuracies by dynamically generating filters from the active workspace's option lists.
- Optimize statistical metrics calculations in the reporting modal to perfectly align with both historical and newly aligned call status/outcome identifiers.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/defaults.ts` | Created a unified shared defaults file storing `SYSTEM_CALL_STATUSES` and `SYSTEM_CALL_OUTCOMES` alongside their formal operational definitions. |
| `/src/App.tsx` | Imported the new shared defaults and aligned the first-run database seeding fallback values with the exact requirements. |
| `/src/components/DropdownSettingsManager.tsx` | Imported shared defaults, introduced an `isSystemOption` helper, blocked edits and deletes in `handleStartEdit` and `handleDeleteOption`, and visually rendered a clean "System Default" badge while concealing edit/delete buttons for system-provided values. |
| `/src/components/CallLogReportModal.tsx` | Swapped the static, hardcoded filter selections with dynamic listings generated from active workspace options. Upgraded cumulative metrics calculators and CSV export templates to seamlessly handle both legacy and aligned statuses/outcomes. |
| `/src/components/CallLogManager.tsx` | Forwarded workspace `callStatuses` and `callOutcomes` arrays to `CallLogReportModal` to enable perfect, adaptive reporting views. |
| `/package.json` | Bumped application version to `0.23.0`. |
| `/CHANGELOG.md` | Logged version `0.23.0` release notes covering immutable defaults and dynamic export updates. |
| `/development_ledger.md` | Prepended the `0.23.0` development session logs and modifications ledger. |

## Session: 2026-08-05 (Fix Dropdown Settings Seeding and Update Failures)

### Goals
- Resolve Firestore "No document to update" error when updating/renaming default call statuses and other dropdown options (like `cs_1`).
- Align fallback dropdown option IDs (`cs_i`, `co_i`, `src_i`, `cat_i`, `u_i`) across local cache and real Firestore database paths.
- Enhance the settings option renaming process to perform a fail-safe merge update (`batch.set(..., { merge: true })`), preventing strict update crashes if a document does not exist.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Swapped `safeAddDoc` for `safeSetDoc` inside snapshot listener fallback seeding loops. This forces the generated document IDs in Firestore to exactly match the predictable IDs (`cs_i`, `co_i`, etc.) used in the offline fallback cache, ensuring perfect synchronicity. |
| `/src/components/DropdownSettingsManager.tsx` | Changed option update operation inside `writeBatch` to use `batch.set(..., { merge: true })` instead of strict `batch.update(...)`, which eliminates crash errors if a document doesn't exist yet by silently creating or merging it instead. |
| `/package.json` | Bumped application version to `0.22.1`. |
| `/CHANGELOG.md` | Logged version `0.22.1` release notes detailing predictable dropdown seeding IDs and fail-safe merge updates in settings manager. |
| `/development_ledger.md` | Prepended the `0.22.1` development session logs and modifications ledger. |

## Session: 2026-08-05 (Global Stateful Dialog Overlays & Location Free-Text Refactoring)

### Goals
- Resolve blocked and non-working edit and delete buttons in Dropdown Settings, Call Center, and History views caused by browser sandboxing/iframe blocks on native `window.confirm` and `alert` calls.
- Design and integrate a sophisticated, promise-wrapped, stateful confirmation/alert dialog overlays framework to replace all native browser dialog triggers across `DropdownSettingsManager.tsx`, `CallLogManager.tsx`, and `CallLogDetailModal.tsx`.
- Rename "Geography / Region" to "Location (Company Registered)" and replace the selector dropdown with an editable free-text typing input inside the Log / Schedule New Call Modal window.
- Verify full type safety with `tsc --noEmit` and build correctness with `compile_applet`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/DropdownSettingsManager.tsx` | Added stateful `confirmDialog` and `alertDialog` reactive state containers and beautiful overlay modals. Wrapped edit and delete button trigger flows in state-based promises, bypassing the blocked native browser alert and confirm popups. |
| `/src/components/CallLogManager.tsx` | Added async promise-wrapped `askConfirm` helper and reactive overlay dialog hooks. Refactored DNC warnings, scheduled call deletes, and historical call deletes to trigger through our new custom stateful confirmation UI. Renamed "Geography / Region" to "Location (Company Registered)", changed the select field to a robust text input, and replaced the queue listing's location icon with `MapPin`. |
| `/src/components/CallLogDetailModal.tsx` | Removed native browser `window.confirm` from the delete trigger, delegating the confirmation cleanly to parent overlay dialog interception. |
| `/package.json` | Bumped application version to `0.22.0`. |
| `/CHANGELOG.md` | Recorded version `0.22.0` release notes detailing stateful overlay confirmation dialogs, location free-text input conversion, and settings edit/delete restoration. |
| `/development_ledger.md` | Prepended the `0.22.0` development session logs and modifications ledger. |

## Session: 2026-08-05 (Operator Queue Action Buttons, Decoupled Outcomes, Geography Auto-Match & Simulator Settings Support)

### Goals
- Add View Details, Edit, and Delete action buttons to Operator Call Queue items directly so operators do not have to toggle tabs to manage queue records.
- Decouple Call Outcomes from `'Connected'` Call Status, allowing outcomes to be selected and saved for any status.
- Add local storage simulation/offline checks to `DropdownSettingsManager` renaming operations to prevent hangs or errors under simulated offline/quota modes.
- Implement geography auto-matching on company selection based on company city and country, and fix form state leaking on modal openings.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Expanded queue items with View Details, Edit, and Delete button options. Decoupled call outcomes, rendering and saving them for any Call Status. Implemented company selection geography auto-matching, and fully reset form state variables in modal triggers (`onLogFollowup`, `onLogCallForCompany`) to prevent leaks. |
| `/src/components/DropdownSettingsManager.tsx` | Integrated simulated offline and quota limits checks into batch dropdown rename operations to run smoothly under simulation conditions. |
| `/package.json` | Bumped application version to `0.21.0`. |
| `/CHANGELOG.md` | Appended version `0.21.0` release notes detailing queue actions, outcome decoupling, geography auto-matching, and simulator support. |
| `/development_ledger.md` | Prepended the 0.21.0 development session logs and modifications ledger. |

## Session: 2026-08-05 (Unified Call Navigation, Dropdown Color Fix, & Enquiry Sync Integration)

### Goals
- Consolidate redundant Today Call Queue and Call Log & History sidebar menu items into a single, unified "Call Center & Logs" view.
- Fix dropdown color-saving bug where options with unmodified names but new colors failed to write to Firestore due to early exit on identical names.
- Resolve synchronization contradiction between Call Log `next_followup_date` and linked Enquiry `next_followup_date`.
- Verify deletion handles and Firestore permissions across call logs and companies.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/Sidebar.tsx` | Consolidated sidebar items, replacing separate Today Call Queue and Call Log & History links with a single unified **"Call Center & Logs"** tab. |
| `/src/App.tsx` | Changed default active tab to `'call_log'`, adjusted conditional instantiation check for `CallLogManager`, and passed `setEnquiries` prop down. |
| `/src/components/CallLogManager.tsx` | Passed `setEnquiries` prop and implemented sync state + Firestore logic to propagate call log `next_followup_date` to the linked Enquiry in both fast-queue logging and full modal form saves. |
| `/src/components/DropdownSettingsManager.tsx` | Fixed saving defect by updating identical name early-exit check to consider color changes, and conditionally wrapping cascade renames to execute only when names are modified. |
| `/package.json` | Bumped application version to `0.20.0`. |
| `/CHANGELOG.md` | Recorded version `0.20.0` release notes detailing navigation consolidation, dropdown color fix, and follow-up sync logic. |
| `/development_ledger.md` | Prepended the 0.20.0 development session logs and modifications ledger. |

## Session: 2026-08-05 (Call Status/Outcome Decoupling, Custom Saving Fix, & Quick-Create Uncrowding)

### Goals
- Decouple Call Status and Call Outcome into separate fields, where Outcome applies only when Status is "Connected".
- Set custom status/outcome defaults and allow customized colors/presets.
- Diagnose and fix custom outcomes failing to persist on call logs.
- Simplify and uncrowd the Quick Create Company & Contact panel layout, removing the redundant Location/Geography field and standardizing to an elegant, aligned 3-column grid layout.
- Confirm and document complete Firestore database permission and deletion support across all workspace entities.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CallLogManager.tsx` | Redesigned Call Status and Outcome coupling. Changed Outcome to conditionally show/save only when Status is `'Connected'`. Updated local fallback active statuses to match mechanical options. Refactored Quick Create Company & Contact form to remove the redundant geography selector, aligning the remaining fields (Company Name, Suffix, and Contact) into a spacious 3-column grid layout. |
| `/package.json` | Bumped application version to `0.19.0`. |
| `/CHANGELOG.md` | Recorded version `0.19.0` release notes detailing the status-outcome decoupling, quick-create uncrowding, and Firestore deletion support. |
| `/development_ledger.md` | Prepended the 0.19.0 development session logs and modifications ledger. |

## Session: 2026-07-29 (Inline Category Persistence Fix & Suggested Attributes Upgrade)

### Goals
- Resolve inline product category persistence bug where categories created via EnquiryForm inline modal were not propagating to global App state or Settings > Product Categories.
- Pass `setProductCategories` down to `EnquiryForm`, update Firestore `dropdown_product_categories`, update parent state, and sync to local storage cache (`omni_categories`).
- Add `'Brand / Make'` as a default suggested attribute across all product categories in `CATEGORY_SUGGESTED_ATTRIBUTES`.
- Verify TypeScript types (`tsc --noEmit`) and app build (`compile_applet`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `'Brand / Make'` as a default suggested attribute across all product categories in `CATEGORY_SUGGESTED_ATTRIBUTES`. |
| `/src/components/EnquiryForm.tsx` | Added `setProductCategories` prop to `EnquiryFormProps`, added `extraCategories` local state, and updated inline category creation handler to update parent state, form local state, and local storage cache. |
| `/src/App.tsx` | Passed `setProductCategories={setProductCategories}` to `EnquiryForm`. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge to `v0.18.1`. |
| `/package.json` | Bumped version to `0.18.1`. |
| `/CHANGELOG.md` | Recorded version `0.18.1` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

### Goals
- Create shared UI layout primitives (`/src/components/layout/UiContainer.tsx`) to unify padding, container width, rounded corners, and panel borders.
- Retroactively apply `PageBody` and `CardPanel` primitives across all screens to eliminate arbitrary one-off paddings and inconsistent container borders.
- Perform clean lint (`tsc --noEmit`) and production build compilation verification.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/layout/UiContainer.tsx` | Created unified layout primitives (`PageHeader`, `PageBody`, `CardPanel`, `ModalContentContainer`). |
| `/src/components/SettingsHub.tsx` | Wrapped settings content in `PageBody` and converted cloud sync panel to `CardPanel`. |
| `/src/components/DropdownSettingsManager.tsx` | Standardized container padding and header border dividers. |
| `/src/components/Dashboard.tsx` | Replaced hardcoded `p-8` container wrapper with `PageBody`. |
| `/src/components/EnquiryList.tsx` | Replaced hardcoded `p-8` container wrapper with `PageBody`. |
| `/src/components/ProductManager.tsx` | Replaced hardcoded `p-8` container wrapper with `PageBody`. |
| `/src/components/SalespersonProfiles.tsx` | Replaced outer `p-8` container wrapper with `PageBody`. |
| `/src/components/CompanyModal.tsx` | Replaced outer `p-8` container wrapper with `PageBody`. |
| `/src/components/InviteManager.tsx` | Standardized container wrapper and removed redundant padding. |
| `/src/components/DocsSystemHub.tsx` | Replaced hardcoded panel container with standardized `CardPanel`. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge to `v0.18.0`. |
| `/package.json` | Bumped version to `0.18.0`. |
| `/CHANGELOG.md` | Recorded version `0.18.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-29 (Line Item Item Type Classification & Non-Product Charge Exclusions)

### Goals
- Introduce explicit `item_type` (`product`, `charge`, `discount`) and `charge_type` on Line Item data structures.
- Configure Gemini AI extraction prompts and JSON schemas to auto-classify non-product line items (transportation, freight, installation, customs) as charges.
- Add line item classification dropdown controls in `EnquiryForm.tsx` and isolate charge items from product volume analytics in `Dashboard.tsx`.
- Perform clean lint (`tsc --noEmit`) and production build verification.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `ItemType` ('product' \| 'charge' \| 'discount') type and optional `item_type` and `charge_type` properties on `LineItem`. |
| `/server.ts` | Enhanced Gemini prompt instructions and JSON schema definition to request `item_type` and `charge_type` for every extracted line item. |
| `/src/components/EnquiryForm.tsx` | Added client-side heuristic fallback for auto-classifying non-product fees, added classification UI controls in line item rows, and stored item types. |
| `/src/components/Dashboard.tsx` | Excluded charge/service line items from physical equipment volume counts by product category. |
| `/src/components/EnquiryDetail.tsx` | Rendered distinct "Charge" badges for service/transportation items in enquiry details. |
| `/package.json` | Bumped version to `0.17.0`. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge to `v0.17.0`. |
| `/CHANGELOG.md` | Recorded version `0.17.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-28 (Dedicated Resolution Manager Modal & Side-by-Side Comparison)

### Goals
- Build a dedicated 'Resolution Manager' modal displaying side-by-side comparison of existing records versus new submissions when duplicate companies/contacts are detected.
- Implement explicit three-way resolution controls: 'Merge' (link existing), 'Keep New' (overwrite existing record), and 'Ignore & Add New' (create separate entry).
- Verify clean compilation and zero TypeScript/linter errors across all updated components.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/ResolutionManagerModal.tsx` | Created new modal component with side-by-side comparison table, field matching indicators, confidence score bar, and explicit resolution strategy actions ('Merge', 'Keep New', 'Ignore & Add New'). |
| `/src/components/DuplicateMatchModal.tsx` | Refactored component to wrap and render `ResolutionManagerModal` for backward compatibility. |
| `/src/components/CompanyModal.tsx` | Updated company duplicate handler to supply `newDetails` and implemented `onKeepNew` overwrite action updating Firestore & local state. |
| `/src/components/EnquiryForm.tsx` | Updated registration duplicate handler to calculate `newDetails` and handle `onKeepNew` overwrite flow during client registration. |
| `/package.json` | Bumped version to `0.16.0`. |
| `/src/components/CloudSyncHub.tsx` | Updated version badge to `v0.16.0`. |
| `/CHANGELOG.md` | Recorded version `0.16.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-27 (Cloud Sync & Repository Hub Enhancements: Sync Status, Error Logs & Manual Controls)

### Goals
- Add clear sync status dashboard in Cloud Sync & Repository Hub with last-synced timestamps (overall and per-collection).
- Track and display pending/unsynced local changes count by comparing record timestamps with last sync times.
- Surface diagnostic sync errors directly in the UI Hub modal, removing the need to inspect browser consoles.
- Provide manual sync controls ("Sync Now" button) and move control of the Real-time Listener Mode toggle into the Hub modal.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CloudSyncHub.tsx` | Added overall and per-collection last-synced timestamps, calculated `pendingLocalChangesCount`, created `syncErrors` diagnostic log store and UI feed, built `handleSyncNow` full push/pull function, and embedded `realtimeSyncEnabled` toggle in Hub modal. |
| `/src/components/EnquiryForm.tsx` | Fixed missing `Salesperson` type import and corrected `newCompObj` creation logic. |
| `/src/utils/fuzzyMatch.ts` | Fixed property access on `Contact` type (`contact.full_name` instead of `first_name`/`last_name`). |
| `/package.json` | Bumped version to `0.15.0`. |
| `/CHANGELOG.md` | Recorded version `0.15.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-27 (Fuzzy Matching Duplicate Prevention, Loading Submission Locks & Local Workspace Isolation)

### Goals
- Implement fuzzy string matching (Levenshtein distance & Jaccard similarity) on company and contact registrations (`fuzzyMatch.ts`).
- Present interactive "Merge or Ignore" side-by-side modal dialogs (`DuplicateMatchModal.tsx`) when potential duplicates are detected in `CompanyModal.tsx` and `EnquiryForm.tsx`.
- Lock form submission buttons (`disabled={isSubmitting}`, spinners) upon first click across all form and modal submission handlers (`EnquiryForm.tsx`, `CompanyModal.tsx`, `SalespersonProfiles.tsx`, `ProductManager.tsx`).
- Provide an explicit "Work Locally (100% Offline Workspace)" standalone login mode and decoupled local authentication handling in `App.tsx` and `Login.tsx`.
- Extend Admin "Diagnostic Mode & Outage Simulator" in `SettingsHub.tsx` with dedicated simulation toggles and controls.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/utils/fuzzyMatch.ts` | Created fuzzy string matching algorithms (Levenshtein distance & token Jaccard similarity) with duplicate detection methods for company name, domain, contact name, email, and phone. |
| `/src/components/DuplicateMatchModal.tsx` | Built interactive side-by-side duplicate match modal with match reasons, score badges, existing details, Merge action, and Ignore action. |
| `/src/components/CompanyModal.tsx` | Integrated fuzzy match check in `submitCompany`, rendered `DuplicateMatchModal`, and implemented `isSavingCompany`/`isSavingContact` submission locks. |
| `/src/components/EnquiryForm.tsx` | Integrated fuzzy matching check in `handleConfirmRegisterEntities` with bypass capability, rendered `DuplicateMatchModal`, and added `isSubmitting` locking to main submit button. |
| `/src/components/SalespersonProfiles.tsx` | Added `isSubmitting` state lock to `handleSaveSalesperson` and disabled submit button with spinner. |
| `/src/components/ProductManager.tsx` | Added `disabled={isSubmitting}` and animated spinner to product registration submit button. |
| `/src/components/SettingsHub.tsx` | Renamed and updated tab to "Diagnostic Mode & Outage Simulator" with detailed admin subtab descriptions. |
| `/src/components/Login.tsx` | Added "Work Locally (100% Offline Workspace)" standalone login option and local fallback handling. |
| `/src/components/Sidebar.tsx` | Cleared local user session storage (`omni_local_user`, `omni_offline_guest_mode`) during sign out. |
| `/src/App.tsx` | Updated auth listener to restore local workspace session when Firebase auth is offline/unavailable. |
| `/package.json` | Bumped version to `0.14.0`. |
| `/CHANGELOG.md` | Recorded version `0.14.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-27 (Salesperson Contact Exclusion & Entity State Sync Fix)

### Goals
- Resolve issue where auto-detected and registered companies (such as "Osmoflo") showed as "Unknown Client" in Enquiry Registry due to parent React state lag.
- Allow adding direct contact email and phone numbers for Salesperson profiles (`types.ts`, `SalespersonProfiles.tsx`).
- Enhance Gemini AI extraction endpoint (`server.ts`) and client-side handler (`EnquiryForm.tsx`) to filter out salesperson contact info from client fields.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `email?: string` and `phone?: string` optional properties to `Salesperson` interface. |
| `/src/components/SalespersonProfiles.tsx` | Added Salesperson email and direct phone input fields to Add/Edit modal, updated state handlers, and displayed email/phone cards in salesperson profile view. |
| `/server.ts` | Updated `/api/gemini/extract-enquiry` to receive salespersons array in request payload and inject internal sales rep contact exclusion rules into Gemini system prompt. |
| `/src/components/EnquiryForm.tsx` | Added instant `setCompanies` and `setContacts` parent state updates in `confirmAndRegisterEntities` and inline company creation/edit modals. Added pre-extraction salesperson contact scrubbing in `applyExtractedData`. |
| `/package.json` | Bumped version to `0.13.0`. |
| `/CHANGELOG.md` | Recorded version `0.13.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-27 (System Outage Simulator, Consolidated Settings Hub & Double-Submit Prevention)

### Goals
- Prevent double-click submissions across all action buttons ("Save Changes", "Register & Close", "Register & Add Another", "Add Company", "Add Contact", "Save Product") with loading locks and animated spinners (`Loader2`).
- Consolidate "Dropdown Settings", "Invite Codes", "Cloud Sync", and "Docs & System Hub" into a single top-level **Settings & System Hub** (`SettingsHub.tsx`).
- Implement an Admin-only **System & Environment Outage Simulator** (`SystemSimulator.tsx`) to simulate Gemini API 429 token exhaustion, Firestore 403 quota errors, forced offline mode, and network latency (0-3000ms).
- Ensure local workspace mode operates reliably with instant UI state updates regardless of cloud availability or error simulations.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/SettingsHub.tsx` | Created unified tabbed settings hub containing Dropdown Settings, System & Outage Simulator, Invite Manager, Cloud Sync Repository, and System Specs. |
| `/src/components/SystemSimulator.tsx` | Created Admin-only Outage & Token Simulator with toggles for Gemini rate limits, Firestore quota errors, forced offline mode, artificial latency, AI token tracking, and diagnostic sandbox tests. |
| `/src/components/Sidebar.tsx` | Consolidated sidebar navigation to display a single top-level "Settings & System" item with sub-view switching. |
| `/src/App.tsx` | Replaced legacy settings tab views with `SettingsHub.tsx`. |
| `/src/components/EnquiryForm.tsx` | Implemented `isSubmitting` double-click prevention lock, loading spinners on all save buttons, and passed simulation headers (`x-simulate-gemini-error`, `x-simulate-latency`) to backend APIs. |
| `/src/components/CompanyModal.tsx` | Added `isSavingCompany` and `isSavingContact` double-click submission locks with try/finally error handling. |
| `/src/components/ProductManager.tsx` | Added `isSubmitting` state lock to `handleSaveProduct` and button disabled states. |
| `/src/firebase.ts` | Added `applySimulations()` interceptor hook in `safeAddDoc`, `safeUpdateDoc`, `safeGetDocs`, and `safeSetDoc` to simulate Firestore quota errors and latency. |
| `/server.ts` | Intercepted simulation headers (`x-simulate-gemini-error`, `x-simulate-latency`) on `/api/extract-enquiry` endpoint to return 429 rate limits or inject delay. |
| `/package.json` | Bumped version to `0.12.0`. |
| `/CHANGELOG.md` | Recorded version `0.12.0` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-27 (Iframe Clipboard Policy Error Fix & Graceful Fallback)

### Goals
- Resolve auto-detect clipboard error (`Failed to execute 'readText' on 'Clipboard': permissions policy applied to current document`).
- Guard clipboard read/write operations with try/catch blocks and provide a seamless fallback to the "Paste Raw Text" modal.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Wrapped `navigator.clipboard.readText()` and `writeText()` in try/catch blocks; auto-triggered raw text input modal when clipboard API permissions are restricted in iframe previews. |
| `/src/components/InviteManager.tsx` | Guarded `copyToClipboard()` with try/catch check to handle constrained environments. |
| `/package.json` | Bumped version to `0.11.2`. |
| `/CHANGELOG.md` | Recorded version `0.11.2` release notes. |
| `/development_ledger.md` | Documented session goals and modifications table. |

## Session: 2026-07-24 (Instant Local State & Workspace Persistence Sync)

### Goals
- Resolve UI latency where newly submitted or updated enquiries were written to storage but failed to immediately reflect in local UI state while in Local Workspace Mode (`realtimeSyncEnabled = false`).
- Bind `localStorage` cache synchronization directly to React state mutations in `App.tsx`.
- Connect instant state update callbacks across all forms and modals (`EnquiryForm.tsx`, `CompanyModal.tsx`, `ProductManager.tsx`, `SalespersonProfiles.tsx`, `DropdownSettingsManager.tsx`, `InviteManager.tsx`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Added reactive `useEffect` hooks auto-syncing state changes to `localStorage`; updated deletion handlers to update state immediately; passed state setters to all sub-components. |
| `/src/components/EnquiryForm.tsx` | Added `setEnquiries`, `setCompanies`, `setContacts`, `setAuditLogs` props and updated `handleSubmit` / `logAudit` to instantly push created/updated records into local state. |
| `/src/components/CompanyModal.tsx` | Added `setCompanies`, `setContacts`, `setEnquiries` props and updated company/contact creation, edits, merges, and deletions to update state instantly. |
| `/src/components/ProductManager.tsx` | Added `setProducts` prop and updated product creation, edits, and deletions to dispatch instant local state updates. |
| `/src/components/SalespersonProfiles.tsx` | Added `setSalespersons` and `setEnquiries` props and updated salesperson creation, edits, and deletions to update local state immediately. |
| `/src/components/DropdownSettingsManager.tsx` | Added dropdown setters and updated option additions, renames, and deletions to update local dropdowns, products, and enquiries in state instantly. |
| `/src/components/InviteManager.tsx` | Added `setInvites` prop and updated code generation and revocation handlers to update local state immediately. |
| `/package.json` | Bumped version to `0.11.1`. |
| `/CHANGELOG.md` | Documented version `0.11.1` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-24 (Git-Style Local Storage & Cloud Sync Engine)

### Goals
- Implement a Git-esque Version Control & Local Storage Engine (`CloudSyncHub.tsx`) enabling 100% offline Local Storage operation while providing explicit on-demand "Push" (Commit to Cloud), "Pull" (Fetch Cloud Snapshot), "Export JSON" (Database Backup), and "Import JSON" (Database Restore) controls.
- Rebuild `App.tsx` state management to read from local cache by default, disabling continuous quota-draining WebSocket listeners unless explicitly enabled by operator.
- Guarantee seamless operation when Firebase daily free tier quotas are exceeded.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/CloudSyncHub.tsx` | Created Git-style Cloud Sync & Local Storage Hub modal and status badge with Push, Pull, Export JSON, Import JSON, and quota resilience. |
| `/src/App.tsx` | Integrated `CloudSyncHub` in top header bar; updated collection state initializers to read from local storage; added `realtimeSyncEnabled` toggle. |
| `/package.json` | Bumped version to `0.11.0`. |
| `/CHANGELOG.md` | Documented version `0.11.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-24 (Pristine State Initialization Engine & Empty State Refactoring)

### Goals
- Implement a Pristine State check on app startup in `App.tsx` (`initialized` / `omni_pristine_initialized`) that clears `localStorage` if false to prevent developer test data or legacy credentials from persisting in new deployments.
- Ensure `App.tsx` and `src/seed.ts` use strictly empty arrays `[]` for initial state and fallbacks instead of hardcoded company, contact, or personal data.
- Refactor sequential enquiry S/N numbering to dynamically assign registration numbers starting cleanly from base 1001 for fresh application instances.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Added `initialized` Pristine State check to purge local storage on startup; updated `FALLBACK_SALESPERSONS` to `[]`; updated S/N assignment to start dynamically at 1001. |
| `/src/seed.ts` | Confirmed `INITIAL_SALESPERSONS`, `INITIAL_COMPANIES`, `INITIAL_CONTACTS`, and `INITIAL_ENQUIRIES` are set strictly to empty arrays `[]`. |
| `/package.json` | Bumped version to `0.10.4`. |
| `/CHANGELOG.md` | Documented version `0.10.4` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-24 (Pristine Workspace Sanitization & Privacy Cleanup)

### Goals
- Ensure the application launches as a completely fresh, empty workspace with zero personal emails, personal names, specific company details, or employee data.
- Remove hardcoded default personal email addresses (`sibuma.syedameer@gmail.com`) and default personal account names from `Login.tsx` state and UI.
- Wipe out pre-populated seed data in `src/seed.ts` (`INITIAL_SALESPERSONS`, `INITIAL_COMPANIES`, `INITIAL_CONTACTS`, `INITIAL_ENQUIRIES`).
- Update `App.tsx` fallbacks to generic roles and add automatic local storage cache sanitization (`v3_pristine`) to flush legacy mock data on load.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/seed.ts` | Cleared `INITIAL_SALESPERSONS`, `INITIAL_COMPANIES`, `INITIAL_CONTACTS`, and `INITIAL_ENQUIRIES` to empty arrays for a pristine workspace. |
| `/src/components/Login.tsx` | Removed default personal email and display name states; updated input placeholders and generic demo login credentials (`admin@omnisuite.com`). |
| `/src/App.tsx` | Updated `FALLBACK_SALESPERSONS` and user profile defaults to generic roles; added automatic cache versioning (`v3_pristine`) to purge legacy browser cache. |
| `/package.json` | Bumped version to `0.10.3`. |
| `/CHANGELOG.md` | Documented version `0.10.3` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-24 (Firestore Free Tier Quota Limit Resilience & Local Storage High-Speed Fallback)

### Goals
- Resolve Firestore daily free read/write quota limit errors (`resource-exhausted` / `Quota limit exceeded`) across all app subscriptions and data operations.
- Enhance `/src/firebase.ts` helper functions (`safeGetDoc`, `safeGetDocs`, `safeAddDoc`, `safeSetDoc`, `safeUpdateDoc`, `safeDeleteDoc`, and `handleFirestoreError`) to catch quota exhaustion errors gracefully without throwing uncaught exceptions.
- Implement automated local storage caching and seed dataset fallback across all real-time `onSnapshot` listeners in `App.tsx` (`users`, `companies`, `contacts`, `enquiries`, `salespersons`, `products`, `invites`, `auditLogs`, and dropdown settings).
- Add direct Google Email login capability in `Login.tsx` with automatic fallback for `sibuma.syedameer@gmail.com` when Firebase OAuth domain restrictions are triggered.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Updated `handleFirestoreError` and wrapped Firestore helper functions to catch quota limits and return safe fallback objects without throwing raw exceptions. |
| `/src/App.tsx` | Implemented `getLocalCache` and `setLocalCache` local storage caching for snapshot listeners with automatic fallback to local cache and seed datasets upon quota errors. |
| `/src/components/Login.tsx` | Added direct Google Account email login with automatic domain restriction detection and fallback. |
| `/package.json` | Bumped version to `0.10.2`. |
| `/CHANGELOG.md` | Documented version `0.10.2` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-24 (High-Precision Extraction Prompt, Custom Attributes Editor & Collapsible Preview)

### Goals
- Optimize Gemini Flash extraction prompt and structured schema in `/server.ts` to target `company_name`, `contact_name`, `contact_email`, `contact_phone`, `quote_ref_no`, `received_date`, `salesperson`, `country`, `project_location`, `package_value`, and line item technical `attributes` with high precision.
- Implement dynamic Line Item Custom Attributes editor (add, edit, delete key-value pairs) in `EnquiryForm.tsx`.
- Implement collapsible/expandable UI state with chevron icon toggle for PDF-parsed raw text and Smart Paste side-by-side preview panel.
- Perform production readiness check and verify zero-error lint/build status.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Enhanced `systemInstruction` with high-precision extraction rules for company, contacts, quote ref, date, location, value, and technical spec attributes. |
| `/src/components/EnquiryForm.tsx` | Integrated dynamic key-value custom attributes controls per line item and added collapsible chevron toggle for side-by-side preview panel. |
| `/package.json` | Bumped version to `0.10.1`. |
| `/CHANGELOG.md` | Documented version `0.10.1` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (Smart Scroll & Glow, Custom Project Specs & Unregistered Entity Routing)

### Goals
- Implement `scrollToField` smooth auto-scrolling (`behavior: 'smooth'`, `block: 'center'`) and 2.5s pulsing emerald glowing ring feedback when field tokens or chips are clicked.
- Introduce dynamic key-value Custom Project Specifications & Info section in Section 3 with quick preset tags (Consultant, Main Contractor, Tender Ref, Scope of Work, etc.).
- Implement unregistered entity detection confirmation card with interactive field assignment routing (email & phone destination toggles) and one-click database catalog registration.
- Map all extracted tokens (Quote Ref, Company, Contact, Date, Location, Value, Line Items, Custom Specs) to target element IDs across the form.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `custom_project_details` field to `Enquiry` interface. |
| `/src/components/EnquiryForm.tsx` | Implemented `scrollToField` with glowing feedback, `customProjectDetails` key-value specs manager, `unregisteredEntities` interactive assignment routing card, and element ID bindings across form sections. |
| `/package.json` | Bumped version to `0.10.0`. |
| `/CHANGELOG.md` | Documented version `0.10.0` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (Smart Paste Interactive Source Preview & Dynamic Window Sizing)

### Goals
- Implement interactive Left Preview Panel in `EnquiryForm.tsx` for raw Excel & text Smart Paste.
- Provide interactive AI Extracted Field Tokens (Quote Ref, Company, Contact, Date, Location, Value, Line Items) that highlight corresponding form fields in emerald green upon click/hover.
- Expand default Register New Enquiry form container width to `max-w-6xl` / `lg:max-w-7xl` for superior readability.
- Support toggleable preview minimization so operators can collapse split-screen preview and expand the form to full width at any time.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added Smart Paste Left Preview Panel with interactive field chips, dynamic form width calculation (`max-w-6xl` when collapsed), and preview minimization toggle. |
| `/package.json` | Bumped version to `0.9.9`. |
| `/CHANGELOG.md` | Documented version `0.9.9` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (Company Address Country & City Location Semantics)

### Goals
- Clarify in `/server.ts` system prompt and JSON response schema that `Country` and `City / Area` columns in copy-pasted Excel tables represent the Customer / Company Address location.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Updated column descriptions and response schema for `country` and `project_location` to specify Company Address location. |
| `/package.json` | Bumped version to `0.9.8`. |
| `/CHANGELOG.md` | Documented version `0.9.8` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (In-Context Few-Shot Learning & 20-Column Header Sequence Optimization)

### Goals
- Analyze user question on whether the app "learns" from recent entries and evaluate implementation of Few-Shot In-Context Learning.
- Incorporate exact 20-column Excel header sequence map into `/server.ts` system prompt (`S/N #`, `Quote Ref No`, `Listed`, `Received Date`, `Sales Person`, `Customer Name`, `Contact Person`, `Email`, `Landline`, `Mobile`, `Country`, `City / Area`, `Customer Ref`, `Product Type`, `Product Detail`, `Value`, `Projected Order Date`, `Status`, `Remarks`, `Payment Status`).
- Embed real sample rows as few-shot training examples inside Gemini system instructions to guarantee `quote_ref_no` (e.g. `2751-300626AA`, `2726-050626AA`) is always extracted reliably.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Enhanced `systemInstruction` with explicit 20-column sequence map and few-shot in-context learning examples. |
| `/package.json` | Bumped version to `0.9.7`. |
| `/CHANGELOG.md` | Documented version `0.9.7` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (AI Raw Excel Row Copy-Paste & Tab-Delimited Table Extraction)

### Goals
- Optimize Gemini AI extraction engine in `/server.ts` to parse raw tab-separated text rows copy-pasted directly from Microsoft Excel or Google Sheets.
- Support extraction of header metadata (`sn`, `quote_ref_no`, `received_date`, `proposal_option`, `company_name`, `contact_name`, `contact_email`, `contact_phone`, `country`, `project_location`, `enquiry_source`, `subject`, `customer_reference_code`, `salesperson`, and `package_value`).
- Implement specialized prompt logic in `/server.ts` to parse multi-line quoted pricing and engineering specification blocks (`Sl. No. Description Qty Unit Price Total Amount`), mapping each item into `line_items`.
- Create an interactive **"📋 Paste Excel Row / Raw Text"** modal drawer in `EnquiryForm.tsx` with a sample button for one-click testing.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Updated systemInstruction prompt and JSON responseSchema to handle raw Excel tab-delimited text rows and multi-line commercial specs tables. |
| `/src/components/EnquiryForm.tsx` | Added `applyExtractedData` shared state mapper, `handleExtractFromRawText` handler, **"📋 Paste Excel Row / Raw Text"** modal drawer, and sample Excel row loader. |
| `/package.json` | Bumped version to `0.9.6`. |
| `/CHANGELOG.md` | Documented version `0.9.6` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (AI Extraction Scope Expansion & Domain Architecture)

### Goals
- Expand AI document extraction capabilities in `/server.ts` to include `subject`, `customer_reference_code`, and `quote_ref_no`.
- Wire client-side state setters in `EnquiryForm.tsx` to automatically populate these fields upon PDF/document upload.
- Document domain rationale for "Project Site Location" (`project_location`) field.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Updated Gemini system instruction and JSON schema to extract `subject`, `customer_reference_code`, and `quote_ref_no` from uploaded RFQ documents. |
| `/src/components/EnquiryForm.tsx` | Updated `handleExtractFromFile` data mapping to set `subject`, `customerReferenceCode`, and `quoteRefNo` state fields. |
| `/package.json` | Bumped version to `0.9.5`. |
| `/CHANGELOG.md` | Documented version `0.9.5` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-23 (Interactive Marquee Form Labels & Overflow Protection)

### Goals
- Resolve form field label truncation and text-overflow layout shifts across `EnquiryForm.tsx` and inline modals.
- Create an automated, reusable `MarqueeLabel` component that measures label DOM dimensions dynamically.
- Implement CSS marquee keyframe animations (`animate-marquee-hover`) to slide long truncated labels back and forth smoothly when hovered by the operator.
- Integrate `MarqueeLabel` across all 7 form sections (Log Metadata, Account Pairing, Proposal Identifiers, Line Item Attributes, Proposal State, Commercial Terms, and Modal Overlays) to ensure 100% label visual consistency.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/index.css` | Added `@keyframes marquee-slide-back-forth` and `.animate-marquee-hover` utility class for smooth back-and-forth hover marquee animation. |
| `/src/components/MarqueeLabel.tsx` | Created reusable component with automatic DOM measurement (`scrollWidth > clientWidth`), tooltips, inline badges support, required indicators, and hover-triggered marquee sliding. |
| `/src/components/EnquiryForm.tsx` | Replaced standard `<label>` tags across all form sections and inline Company/Contact modals with `<MarqueeLabel />`, achieving complete layout stability and dynamic hover readability. |
| `/package.json` | Bumped version to `0.9.4`. |
| `/CHANGELOG.md` | Documented version `0.9.4` release notes for marquee labels and alignment stability. |
| `/development_ledger.md` | Recorded session goals and modifications table. |

## Session: 2026-07-22 (Pixel-Perfect Form Alignment & Line Item Refactoring)

### Goals
- Perform a comprehensive visual alignment audit and eliminate remaining layout inconsistencies in `EnquiryForm.tsx`.
- Isolate Line Item delete buttons into a dedicated card header bar to prevent overlap with Unit Price labels and currency conversion text.
- Convert Specification Attributes to an adaptive row layout with `truncate` and `title` tooltips, restoring full legibility to long attribute keys like "Uniformity Coefficient".
- Standardize all section grid layouts to `sm:grid-cols-2 lg:grid-cols-4` / `lg:grid-cols-5` for spacious field rendering in split-screen/drawer view (~600–750px width).
- Format all line total calculations and conversion badges to 2 decimal places to eliminate unformatted floating-point numbers.
- Prevent AI confidence badges from wrapping into two lines or distorting label container heights.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Redesigned Line Item cards with a clean header bar (`Item Line #1`) and top-right Remove button; updated Unit Price label with `whitespace-nowrap` conversion string; refactored Specification Attributes key selects to adaptive width (`min-w-[120px] max-w-[160px]`) with `truncate` and `title` tooltips; standardized grid layouts across Sections 1, 2, 3, 4, 5 to responsive breakpoints (`sm:grid-cols-2`); formatted line item total price calculations and Gemini extraction prices to 2 decimal places; added `whitespace-nowrap shrink-0` to `renderConfidenceBadge`. |
| `/package.json` | Bumped version to `0.9.3`. |
| `/CHANGELOG.md` | Documented version `0.9.3` release notes detailing visual refactoring, card header isolate, and attribute layout fixes. |
| `/development_ledger.md` | Recorded session goals and modifications for visual alignment and form polish. |
| `/CONTRIBUTORS.md` | Updated engineering logs to include version 0.9.3 UI refactoring session. |

## Session: 2026-07-22 (Primary Model Upgrade & Retry Backoff Optimization)

### Goals
- Resolve transient 503 high demand errors on the AI extraction backend.
- Upgrade the primary model pool to `gemini-3.6-flash` as specified in the Google GenAI SDK standards while preserving exponential backoff and rotation to fallback models `gemini-3.1-flash-lite` and `gemini-flash-latest`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Upgraded the model rotation pool in `retryWithBackoffAndFallback` to use `gemini-3.6-flash` as primary with `gemini-3.1-flash-lite` and `gemini-flash-latest` as fallbacks. Cleaned up diagnostic log text. |
| `/package.json` | Bumped version to `0.9.2`. |
| `/CHANGELOG.md` | Documented version `0.9.2` release notes. |
| `/development_ledger.md` | Recorded session goals and modifications for model upgrade. |

## Session: 2026-07-20 (Vertical Actions Menus & Form Label Alignment)

### Goals
- Resolve visual overflows and overlapping UI elements in the "Account Pairing" section.
- Redesign company and contact inline action buttons ("Add New Company", "Edit Details") as a toggleable drop-down option menu button using `MoreVertical`.
- Eliminate gaps or sticking between AI confidence badges and the action button text.
- Standardize all text labels horizontally and vertically in Log Metadata, Proposal Identifiers, and Line Items.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Redesigned the "Account Pairing" section's edit details and add company/contact actions to live within clean, animated vertical dropdown menus using a `MoreVertical` toggle button. Aligned labels and AI confidence badges inside unified flex rows. Converted all form labels across Log Metadata, Proposal Identifiers, and Line Items to use a standardized `flex items-center h-4` wrapper. |
| `/package.json` | Bumped version to `0.9.1`. |
| `/CHANGELOG.md` | Logged version `0.9.1` release notes detailing visual corrections and actions dropdown menus. |
| `/development_ledger.md` | Recorded this session's goals, structural layout fixes, and file modifications. |

## Session: 2026-07-20 (Inline Global Editing, Dropdown Sorting Toggles, and Autofill Toasts)

### Goals
- Implement inline global editing of selected Company and Contact Personnel accounts directly while filling up the form, allowing updates to synchronize globally.
- Provide independent sorting toggles for Product Type Categories, Salespersons, Enquiry Sources, and Unit Suffixes dropdown select lists.
- Connect the AI Document Autofill operation with the global toast notification engine for real-time success and failure visual indicators.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added editing states (`isEditingCompany`, `isEditingContact`) and "✎ Edit Details" triggers. Embedded conditional edit-submit handlers in both Company and Contact inline modals to run `safeUpdateDoc` updates. Added sorting states, `sortedSalespersons`/`sortedSources`/`sortedCategories`/`sortedUnits` selectors, and `renderSortButton` toggles next to the labels. Wired `triggerToast` calls into autofill success and failure handlers. |
| `/package.json` | Bumped version to `0.9.0`. |
| `/CHANGELOG.md` | Logged version `0.9.0` features in the release history index. |
| `/development_ledger.md` | Documented session goals, modifications, and sorting parameters. |

## Session: 2026-07-20 (Rotating Gemini Model Pool Backoff Strategy)

### Goals
- Fully resolve model-specific transient 503 UNAVAILABLE or rate limit exceptions by avoiding single-point-of-failure fallbacks.
- Implement an automated model rotation pool to cycle API calls through different valid, highly robust model identifiers during backoff retry loops.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Upgraded `retryWithBackoffAndFallback` to use a rotating model array consisting of `gemini-3.5-flash`, `gemini-3.1-flash-lite`, and `gemini-flash-latest`, distributing retry attempts across separate model pipelines. |
| `/package.json` | Bumped version to `0.8.7`. |
| `/src/components/DocsSystemHub.tsx` | Added minor version `0.8.7` logs to the release history database. |
| `/CHANGELOG.md` | Documented version `0.8.7` rotating backup strategy in the release timeline. |
| `/development_ledger.md` | Documented rotating model pool session objectives and modifications. |

## Session: 2026-07-20 (Increase Client-Side Extraction Timeout to 90s)

### Goals
- Resolve premature client-side "signal is aborted without reason" errors occurring at precisely 40 seconds under peak API congestion.
- Ensure the client remains connected long enough to receive responses when the backend executes multi-attempt backoff retries and fails over to the stable backup model (`gemini-3.1-flash-lite`).

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Extended the extraction timeout in `AbortController` from 40,000ms to 90,000ms, and updated the user-facing alert/error message. |
| `/package.json` | Bumped version to `0.8.6`. |
| `/src/components/DocsSystemHub.tsx` | Added minor version `0.8.6` changelog logs to the system release timeline database. |
| `/CHANGELOG.md` | Logged version `0.8.6` features in the release history index. |
| `/development_ledger.md` | Documented session goals, modifications, and timeout parameters. |

## Session: 2026-07-16 (Fix Outdated Gemini Model Failover Reference)

### Goals
- Resolve 404 Model Not Found exceptions occurring on backoff failovers due to deprecated/deactivated `gemini-2.5-flash`.
- Guarantee robust and uninterrupted processing of automated AI document extractions by migrating the backup fallback model in server-side retries to `gemini-3.1-flash-lite`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Upgraded `fallbackModel` from deprecated `gemini-2.5-flash` to active `gemini-3.1-flash-lite` in the automatic exponential backoff retry handler `retryWithBackoffAndFallback`. |
| `/package.json` | Bumped version to `0.8.5`. |
| `/CHANGELOG.md` | Logged version `0.8.5` failover fixes. |
| `/development_ledger.md` | Documented session goals and updated fallback configurations. |

## Session: 2026-07-16 (Canvas-Based PDF.js Inline Renderer Integration)

### Goals
- Fully resolve inline PDF viewing issues caused by native browser PDF plugin sandboxing restrictions (`ERR_BLOCKED_BY_CLIENT`).
- Build a lightweight, custom, pure client-side PDF document parser and canvas-based layout renderer utilizing Cloudflare's official PDF.js CDN.
- Ensure 100% offline-first execution safety, supporting both local Base64/FileReader binary arrays and cloud-hosted bucket storage Blobs.
- Equip the new document preview viewport with interactive, touch-friendly, high-contrast paging and zooming controls.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/PdfViewer.tsx` | Created a brand-new, robust, modular Canvas-based PDF document viewer leveraging PDF.js. Implemented high-DPI (Retina) scaling, double-buffering cancellation safety, and custom page/zoom navigation controls. |
| `/src/components/EnquiryForm.tsx` | Replaced the legacy sandboxed `<iframe>` tags in the document preview panel with the new `<PdfViewer />` component. |
| `/package.json` | Bumped version to `0.8.4`. |
| `/src/components/DocsSystemHub.tsx` | Added minor version `0.8.4` changelog logs to the system release timeline database. |
| `/CHANGELOG.md` | Logged version `0.8.4` features and controls in the release history index. |
| `/development_ledger.md` | Documented session goals, modifications, and PDF.js technical design. |

## Session: 2026-07-16 (Instant Storage Fallback Bypass for Starter Tier Projects)

### Goals
- Resolve Cloud Shell gcloud bucket updates failing with 404 on the Google Cloud/Firebase Starter Tier due to disabled Cloud Storage services.
- Eliminate the 4-second delay on document uploads when trying to reach unprovisioned Firebase Storage buckets.
- Ensure zero-cost, zero-install, instant file attachment experience using Firestore database Base64 storage natively.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Configured `BYPASS_STORAGE = true` to directly and instantly route all file attachments to the high-performance native Base64 FileReader database storage fallback. |
| `/package.json` | Bumped version to `0.8.3`. |
| `/CHANGELOG.md` | Logged version `0.8.3` instant database-only storage features. |
| `/development_ledger.md` | Documented session goals, modifications, and Starter Tier environment analysis. |

## Session: 2026-07-16 (Image File-Extension Mapping & PDF Sandbox Workarounds)

### Goals
- Resolve why specific images (such as `image.png`) are still blocked inside an iframe under Chromium browsers (Chrome, Opera).
- Mitigate nested sandboxed iframe restrictions on `blob:` references inside the AI Studio parent workspace frame.
- Add robust file-extension MIME type fallback matching to prevent images from defaulting to application/pdf.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added a robust `mediaType` memo that uses file-extension matching to guarantee images always render natively using `<img>` tags. Added a security advisory banner with a one-click manual new tab bypass for PDF iframes that are blocked by browser sandboxing. |
| `/package.json` | Bumped version to `0.8.2`. |
| `/CHANGELOG.md` | Logged version `0.8.2` features and fixes. |
| `/development_ledger.md` | Logged session goals and modifications. |

## Session: 2026-07-16 (Blob URL Same-Origin Isolation for Previews & Direct Link Navigation Fixes)

### Goals
- Diagnose and eliminate browser-level security blocks (`ERR_BLOCKED_BY_CLIENT`) in standard browsers (Chrome, Opera) when loading file attachments.
- Fix the bug in "Open in New Tab" opening `about:blank` first and requiring a manual reload.
- Prevent browser iframe restrictions on nested data URIs.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added `getSafeBlobUrl` helper with data URL caching. Replaced raw base64 data URIs with same-origin, memory-efficient Object Blob URLs (`blob:`) in preview images, iframes, and "Open in New Tab" anchor tag references. |
| `/package.json` | Bumped version to `0.8.1`. |
| `/CHANGELOG.md` | Logged version `0.8.1` fixes for iframe rendering and blank tab bugs. |
| `/development_ledger.md` | Logged session goals and security analysis. |

## Session: 2026-07-16 (Side-by-Side Document Preview & Admin In-Form Category Addition)

### Goals
- Implement a fully interactive, responsive side-by-side splitscreen document preview panel for PDF and Image attachments within the Enquiry Form.
- Add "+ New Category..." creation flow directly inside each line item's product type select dropdown to streamline data entry.
- Preserve catalog integrity by restricting category creation to Administrators, performing strict case-insensitive duplicate checks, and displaying an explicit privilege advisory.
- Verify Firebase Storage bucket configurations definitively and address cross-origin CORS limitations.
- Document maximum file-size limitations for local Base64 sync fallback against Firestore's 1MB limit.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/EnquiryForm.tsx` | Added state hooks for `activePreviewUrl`, `previewFileName`, `previewFileType`, `newCategoryModal`, `newCategoryName`, `submittingCategory`, and `initiatingLineItemIndex`. Refactored outer wrapper into a dynamic split grid container showing the preview iframe/image panel on the left (`45%` width) when a file is focused, and form on the right. Added click-to-preview handlers, a primary-highlighted "View" button for each attachment, and automated preview focus upon file upload and mount. Updated Product Type select dropdowns with a "+ New Category..." choice for Administrators. Integrated a secure Create New Product Category overlay modal with input validation, duplicate checks, audit logging, and realtime Firestore additions. |
| `/package.json` | Bumped version to `0.8.0` (Minor release for significant capability expansions). |
| `/CHANGELOG.md` | Logged 0.8.0 feature releases, catalog protections, and splitscreen designs. |
| `/development_ledger.md` | Documented session goals, modifications, and exact architectural findings. |

## Session: 2026-07-16 (Save Toasts, Modal Flow Refinements & Sequence Registering)

### Goals
- Implement visual success feedback (toast notification) when registering or updating an enquiry.
- Ensure the drawer modal auto-closes on submit.
- Replace the single "Register Proposal" button with two options: "Register & Close" and "Register & Add Another" (to clear specific fields and keep the panel open for high-speed consecutive entries).
- Investigate and troubleshoot GCS Storage bucket preflight CORS blockages causing the 4-second timeout.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Integrated `AnimatePresence` and `motion` from `'motion/react'`. Added a global `toast` state with success, error, and info types. Configured automatic dismissal timers. Passed the `triggerToast` handler to `<EnquiryForm>` and rendered the floating toast component near the bottom of the viewport. |
| `/src/components/EnquiryForm.tsx` | Added `triggerToast` prop. Created a `resetForm` state reset routine to support high-speed consecutive entry of enquiries. Refactored `handleSubmit` to support `submitMode` sequences, triggering a success toast and either closing the drawer or resetting fields and incrementing `sn`. Replaced the single submit button with a three-button container ("Cancel", "Register & Add Another", "Register & Close"). |
| `/cors.json` | Created GCS CORS configuration asset to easily white-list cross-origin requests, solving the 4-second preflight timeout in sandboxed preview environments. |
| `/package.json` | Bumped version to `0.7.5`. |
| `/CHANGELOG.md` | Prepend changes of 0.7.5. |
| `/development_ledger.md` | Logged goals, modifications, and findings. |

## Session: 2026-07-16 (Data Integrity, Enforced Schema Enums & Category-Attribute Mapping)

### Goals
- Fix garbled confidence score badge rendering (`AI: { CONFIDENCE` and `AI: 2} B STANDARD CONFIDENCE`).
- Fix data extraction drop-offs in subsequent line item prices (such as "Gravels" pulling 0.00).
- Resolve missing specification attributes mapping and wire the category-attribute suggestions fully into AI extraction results.
- Determine whether these extraction data integrity issues are systemic or isolated.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Refactored Gemini extraction endpoint: Enforced strict `enum` constraints (`"high" \| "medium" \| "low"`) on confidence scores in the JSON response schema. Redefined `attributes` schema from a generic object to a structured, reliable array of key-value objects (`{ key, value }[]`). Enhanced system instruction prompt with strict rules on price extraction across *all* line items and currency normalization (USD/AED). |
| `/src/components/EnquiryForm.tsx` | Added client-side sanitization of confidence scores before state storage. Refactored `renderConfidenceBadge` with strict string validation and low-confidence fallback formatting. Upgraded line items mapping in autofill to support multi-key price parsing (`unit_price_aed`, `unit_price`, `price`, `unitPrice`), automatic conversion to form currency, and native mapping of extracted specification attributes. Incorporated category suggested attributes merging for maximum visual continuity. |
| `/package.json` | Bumped version to `0.7.4`. |
| `/CHANGELOG.md` | Logged 0.7.4 bug fixes, data integrity improvements, and schema alignments. |
| `/development_ledger.md` | Logged session goals and modifications. |

## Session: 2026-07-16 (Dual-Stage Progress, Payload Compression & Safety Timeouts)

### Goals
- Resolve frozen visual state during attachment uploads and AI extractions.
- Split processing into distinct, percentage-based upload progress (Stage 1) and sub-stage dynamic status text ticker (Stage 2).
- Optimize document payloads to reduce backend transmission latency and safeguard against Firestore 1MB document size limits.
- Implement strict client-side and upload-side timeout guards with clear fallback and failure dialogs.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Implemented and exported `uploadAttachmentWithProgress` supporting resumable uploads and percentage reporting. Added a strict 4-second timeout that triggers a local FileReader base64 fallback to prevent hanging when Firebase Storage buckets are unprovisioned or blocked. |
| `/src/components/EnquiryForm.tsx` | Added state hooks for `uploadProgress`, `currentUploadingFile`, and `extractionStatusText`. Built an HTML5 canvas image compressor `downsampleImage` that compresses uploaded images (`image/*`) to max 1200px and 0.8 JPEG quality before extraction. Integrated a strict 40-second network abort wrapper via `AbortController` in `handleExtractFromAttachment`. Enhanced the Section 7 JSX layout with modern stage loaders, animated progress bars, and a pulsing live AI heartbeat ticker. |
| `/package.json` | Bumped version to `0.7.3`. |
| `/CHANGELOG.md` | Documented 0.7.3 dual-stage progress, payload compression, and safety timeout features. |
| `/development_ledger.md` | Logged session goals and modifications. |

## Session: 2026-07-15 (Resilient Multi-Model Fallback)

### Goals
- Resolve transient 503 unavailability or 429 quota exceptions on the primary `gemini-3.5-flash` model.
- Implement an automated fallback strategy to switch to a stable backup model (`gemini-2.5-flash`) on retry attempts.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Refactored `retryWithBackoff` to `retryWithBackoffAndFallback`, enabling automated transition to the backup model `gemini-2.5-flash` if the primary model throws a transient error. Updated endpoint call to use the fallback selector wrapper. |
| `/package.json` | Bumped version to `0.7.2`. |
| `/CHANGELOG.md` | Logged 0.7.2 model-fallback architectural updates. |
| `/development_ledger.md` | Documented session goals and modifications. |

## Session: 2026-07-15 (AI Extraction Performance Profiling & Diagnostics)

### Goals
- Instrument client-side and server-side routes with precise timestamp metrics.
- Expose end-to-end telemetry (file fetch, conversion, payload construction, Gemini API round-trip) to operators via UI and browser logs.
- Identify and isolate bottlenecks in the RFQ document extraction pipeline.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Added custom performance metadata response fields and detailed server-side metrics logging. |
| `/src/components/EnquiryForm.tsx` | Added client-side timer profiling, styled browser console timing reports, and detailed operator alert diagnostics showing a summary of extraction stages. |
| `/package.json` | Bumped version to `0.7.1`. |
| `/CHANGELOG.md` | Logged 0.7.1 version updates and performance diagnostic details. |
| `/development_ledger.md` | Documented goals and modifications for 0.7.1. |

## Session: 2026-07-15 (AI Confidence Badging & Multi-Tier Fuzzy Matching)

### Goals
- Implement visual AI extraction confidence level indicators for key form fields.
- Integrate advanced Sorensen-Dice coefficient fuzzy-matching algorithms for Companies and Contacts to prevent duplicates.
- Solve and document document upload latency (Firebase Storage timeout fallback) and Gemini rate limits.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Updated systemic instructions and structured JSON response schema to evaluate and return field-level `confidence_scores` (`high` \| `medium` \| `low`). |
| `/src/components/EnquiryForm.tsx` | Added Jaro-Dice coefficient similarity string matching algorithm with a 55% score threshold. Included `aiConfidence` state tracking and dynamic pulsing visual confidence badges next to respective field labels. |
| `/package.json` | Bumped version to `0.7.0`. |
| `/CHANGELOG.md` | Logged 0.7.0 version updates and architectural diagnostic audit findings. |
| `/development_ledger.md` | Documented goals and modifications for 0.7.0. |

## Session: 2026-07-14 (Gemini Resilience Patch)

### Goals
- Resolve Gemini 503 Service Unavailable / UNAVAILABLE rate limit and demand spikes.
- Create dynamic exponential retry fallback on server side for Gemini endpoints.
- Enhance frontend error reading from proxy backend.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Added `retryWithBackoff` utility scaling on 503 and 429 status codes; returned informative user-friendly messages for demand spikes instead of generic 500 status dumps. |
| `/src/components/EnquiryForm.tsx` | Improved error retrieval to read and present friendly JSON error instructions to the operator within interactive alerts. |
| `/package.json` | Bumped version to `0.6.1`. |
| `/CHANGELOG.md` | Logged 0.6.1 version updates. |
| `/development_ledger.md` | Logged goals and modifications for Gemini resilience session. |

## Session: 2026-07-14 (Full-Stack Express, AI Autofill & Docs System Hub)

### Goals
- Establish a secure full-stack backend server (`server.ts`) supporting Express + Vite middleware development.
- Implement automated AI-powered RFQ Document parsing and form autofill using Gemini 3.5 Flash server-side.
- Integrate genuine Firebase Storage document uploads under the `proposals/` storage bucket.
- Deliver an interactive Docs & System Hub featuring speculative timeline logs, specifications, and AI sandbox prompt testing.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/server.ts` | Configured primary Express server, integrated Vite dev middleware and production static fallbacks, and created `POST /api/gemini/extract-enquiry` powered by Gemini 3.5 Flash and official `@google/genai` SDK. |
| `/src/components/EnquiryForm.tsx` | Added `isExtracting` and `extractionError` states, implemented `handleExtractFromAttachment` to download, convert and proxy document files to the AI endpoint, and integrated "Autofill Form" actions to the files list. |
| `/src/components/DocsSystemHub.tsx` | Created a brand-new hub featuring an interactive prompt sandbox, system specs, cryptography documentation, and release history timeline. |
| `/src/components/Sidebar.tsx` | Added "Docs & System Hub" item to the workspace navigation list and imported the `BookOpen` icon. |
| `/src/App.tsx` | Imported and conditionally rendered the new `<DocsSystemHub />` component inside the active tab panel. |
| `/package.json` | Updated dev and build scripts to build and package server bundle correctly; bumped version to `0.6.0`. |
| `/CHANGELOG.md` | Documented `0.6.0` release notes. |
| `/development_ledger.md` | Documented goals and modifications for session `2026-07-14`. |

## Session: 2026-07-14 (Flat-Map Attributes Migration & Suggested Keys Dropdowns)

### Goals
- Migrate product attributes from array list `{ key, value }[]` structure to flat map `Record<string, string>` structure.
- Add category-specific recommended attribute dropdown selections while preserving the ability to input custom keys if desired.
- Keep absolute backward-compatibility to ensure existing historical records are not broken.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Modified `Product` and `LineItem` attributes interface types to support `Record<string, string>` and added `getAttributeEntries` backward-compatible parsing and normalization helper. |
| `/src/components/ProductManager.tsx` | Updated attributes editor loading, rendering, and saving handlers to conform to the new flat-map dictionary format. Built category suggested select dropdown with a `+ Custom Key...` fallback. |
| `/src/components/EnquiryDetail.tsx` | Swapped raw list attribute looping with unified `getAttributeEntries` rendering. |
| `/src/components/EnquiryForm.tsx` | Updated form-level load and save payload mapping routines to translate attributes to flat map structures. Standardized the item attributes editor to render suggested categories with `+ Custom...` fallbacks. Refactored files loop for type-safe File casting. |
| `/package.json` | Bumped application version to `0.5.0`. |
| `/CHANGELOG.md` | Logged version `0.5.0` release notes. |
| `/development_ledger.md` | Documented goals and modifications for session `2026-07-14`. |

## Session: 2026-07-13 (Category-Specific Attributes & Salesperson Initials Migration)

### Goals
- Implement category-specific suggested attributes for the product catalog.
- Support dynamic custom specification attribute editing for both products and enquiry line items.
- Make catalog product name and unit price optional, falling back to Category as primary identifier and Custom Price respectively.
- Allow editing salesperson initials/code and run a transactional migration batch on all linked enquiries to keep data integrity.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/types.ts` | Added `CATEGORY_SUGGESTED_ATTRIBUTES` lookup mapping dictionary. |
| `/src/components/ProductManager.tsx` | Added suggested attributes auto-populate `useEffect` hook, integrated dynamic attributes editor to form, made Product Name and Price optional, and updated table cells rendering. |
| `/src/components/EnquiryForm.tsx` | Integrated dynamic specifications attributes editor to enquiry line items, handled auto-suggest attributes when a line item's category is modified, and updated `CatalogItem` interface. |
| `/src/components/SalespersonProfiles.tsx` | Removed disabling of initials input in the salesperson form and added a background transactional `writeBatch` migration update on all linked enquiries when initials are changed. |
| `/package.json` | Bumped application version to `0.4.0`. |
| `/CHANGELOG.md` | Documented version `0.4.0` release notes. |
| `/development_ledger.md` | Logged goals and file modifications for session `2026-07-13 (Category-Specific Attributes & Salesperson Initials Migration)`. |

## Session: 2026-07-13 (Dropdown Collections Access Permissions Fix)

### Goals
- Fix "Missing or insufficient permissions" listener errors on application startup for the metadata dropdown collections.
- Correctly expose security access rules in `firestore.rules` and document metadata fields in `firebase-blueprint.json`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/firebase-blueprint.json` | Registered the new `DropdownOption` schema definition under entities and mapped the three dropdown collections under the firestore config. |
| `/firestore.rules` | Added explicit read/write rules for `/dropdown_enquiry_sources/{sourceId}`, `/dropdown_product_categories/{categoryId}`, and `/dropdown_units/{unitId}` to allow authenticated queries. |
| `/package.json` | Bumped application version to `0.3.1`. |
| `/CHANGELOG.md` | Documented version `0.3.1` release notes. |
| `/development_ledger.md` | Logged goals and file modifications for session `2026-07-13 (Dropdown Collections Access Permissions Fix)`. |

## Session: 2026-07-13 (Dynamic Branding, Audit Dates & Typeable Input Integration)

### Goals
- Decouple user-editable Received Date (`enquiry_date`) from system-controlled audit timestamps (`createdAt`, `updatedAt`).
- Convert date pickers across forms to typeable text inputs (`YYYY-MM-DD` format) with regex validation.
- Remove all hardcoded "Aventura" branding strings and replace with centrally-configurable properties via `BRAND_CONFIG`.
- Standardize preloaded components catalogs to be brand-independent.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/config.ts` | Created `BRAND_CONFIG` to centralize all UI branding (shortName, fullName, tagline, defaultClientName, placeHolder, catalogTitle) in one configuration file. |
| `/src/components/Login.tsx` | Replaced hardcoded "Aventura" strings with values from `BRAND_CONFIG`. |
| `/src/App.tsx` | Updated sequential S/N assignment to sort chronologically by `createdAt` (falling back to `enquiry_date`) to ensure audit integrity, and replaced sync indicator text. |
| `/src/components/EnquiryForm.tsx` | Transitioned all dates (Received Date, Estimated Order, Followup) to text inputs with `YYYY-MM-DD` format helpers. Implemented form-level regex validation. Set immutable `createdAt` and mutable `updatedAt` in submission payload. Replaced "Aventura" strings and renamed the static catalog to `STANDARD_CATALOG` with generic product brands. |
| `/src/components/EnquiryList.tsx` | Replaced table column headers and CSV import mapping labels from "Log Date" to "Received Date" for visual clarity. Linked export filenames and general client placeholders to dynamic brand settings. |
| `/src/components/EnquiryDetail.tsx` | Appended "Received Date" and "System Created Date" to the slide-over details drawer for immediate audit verification. |
| `/src/components/Sidebar.tsx` | Imported `BRAND_CONFIG` and swapped hardcoded "AVENTURA LOGS" with configurable workspace branding. |
| `/src/seed.ts` | Changed hardcoded "Aventura" product brands to generic "Premium" brand names. |
| `/package.json` | Bumped application version to `0.3.0`. |
| `/CHANGELOG.md` | Documented version `0.3.0` release notes. |
| `/development_ledger.md` | Logged goals and file modifications for session `2026-07-13 (Dynamic Branding, Audit Dates & Typeable Input Integration)`. |

## Session: 2026-07-13 (Firestore Payload Sanitization)

### Goals
- Resolve the fatal `Function addDoc() called with invalid data. Unsupported field value: undefined` error thrown by Firestore.
- Implement automated robust payload sanitization across all custom Firestore operations to prevent future undefined-value bugs.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/firebase.ts` | Developed a recursive payload cleanser `cleanUndefined()` that deep-checks incoming documents and replaces all `undefined` values with `null` before they are sent to Firestore via `safeAddDoc`, `safeSetDoc`, or `safeUpdateDoc`. |
| `/package.json` | Bumped application version to `0.2.1`. |
| `/CHANGELOG.md` | Documented version `0.2.1` release notes. |
| `/development_ledger.md` | Logged goals, session records, and file modifications for session `2026-07-13 (Firestore Payload Sanitization)`. |

## Session: 2026-07-11 (Feature Overhaul & Migrations)

### Goals
- Shift salesperson reference tracking from fragile text initials to unique Firestore ID references.
- Create a complete, fully featured Product Catalog Management panel.
- Implement flexible state-managed pagination sizes (`25`, `50`, `100`, `200`, `500`, `All`) and bulk selection/deletion support.
- Develop a self-healing sequential S/N auto-assignment algorithm inside the `enquiries` observer.
- Enable inline "Edit" action triggers in the details slide-over pane.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/components/ProductManager.tsx` | Created a brand-new top-level Product Catalog Management panel supporting full CRUD, real-time search, category filtering, and customized SKU generation. |
| `/src/components/Sidebar.tsx` | Registered the new "Products Catalog" navigation option. |
| `/src/components/EnquiryList.tsx` | Added support for custom items per page pagination limit, bulk selection, bulk delete confirmation triggers, and translated salesperson rendering to resolve ID-to-initial fallback matching. |
| `/src/components/EnquiryForm.tsx` | Unified search indexing to merge static products with Firestore dynamic catalog, shifted Salesperson selection fields to ID referencing, and handled optional initials with custom auto-calculation. |
| `/src/components/EnquiryDetail.tsx` | Added an edit action trigger to the header, preloading details into the edit form, and resolved rep name lookups via the custom ID match resolver. |
| `/src/components/SalespersonProfiles.tsx` | Ported metrics computations, active profile selections, and salesperson updates/creation/deletion to the new unique ID schema. |
| `/src/App.tsx` | Added dynamic `products` listener; integrated a background sequential S/N alignment loop that re-orders and updates document serials starting from 2719 upon write actions; connected products and edit callback triggers. |
| `/package.json` | Bumped application version to `0.2.0`. |
| `/CHANGELOG.md` | Logged version `0.2.0` release details. |
| `/development_ledger.md` | Recorded goals and file modifications for session `2026-07-11 (Feature Overhaul & Migrations)`. |

## Session: 2026-07-11

### Goals
- Resolve UI lock freezing the app on "Synchronizing Aventura Cloud Node...".

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Fixed active user snapshot callback so `setAuthLoading(false)` is correctly run when the user profile exists, clearing the loading screen blocker. |
| `/package.json` | Bumped application version to `0.1.4`. |
| `/CHANGELOG.md` | Logged version `0.1.4` release details. |
| `/development_ledger.md` | Recorded goals and file modifications for session `2026-07-11`. |

## Session: 2026-07-10

### Goals
- Fully resolve the remaining Firestore permission-denied warnings generated on sign-out due to asynchronous React state update delays.
- Refactor and consolidate all snapshot listeners in `App.tsx` into a single synchronous, self-cleaning controller.
- Eliminate race conditions on sign-in where Firestore is queried or written to before auth credentials propagate, by implementing a deferred two-stage subscription model.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/src/App.tsx` | Redesigned listener engine using `useRef` to hold unsubscribe handlers. Split queries into two stages: first stage handles auth monitoring and user profile fetching, while second stage defers all collection subscriptions until the authenticated user profile is fully resolved and stable. Synchronously tears down all active subscriptions immediately on auth state transition (especially logout). |
| `/package.json` | Bumped application version to `0.1.3`. |
| `/CHANGELOG.md` | Logged version `0.1.3` and `0.1.2` release details. |
| `/development_ledger.md` | Recorded goals and file modifications for session `2026-07-10`. |

## Session: 2026-07-09

### Goals
- Resolve the Firestore `permission-denied` uncaught error on the `salespersons` subscription.
- Align schema definitions in `firebase-blueprint.json` and security rules in `firestore.rules` to correctly handle the `salespersons` collection.
- Fix user profile snapshot listener leaks when transitioning auth states (sign-in/sign-out) and add robust error handlers to all Firestore listeners in `App.tsx`.

### Modifications

| File Path | Change Description |
| :--- | :--- |
| `/firebase-blueprint.json` | Registered the `Salesperson` entity and `/salespersons/{salespersonId}` path mapping. |
| `/firestore.rules` | Added match statement for `salespersons` allowing read/write operations for signed-in users. |
| `/src/App.tsx` | Tracked and cleaned up the `unsubUser` profile listener correctly inside the auth monitoring observer. Integrated error handler callbacks in all Firestore `onSnapshot` queries to gracefully log and handle state transition events. |
| `/package.json` | Bumped application version to `0.1.1`. |
| `/CHANGELOG.md` | Documented version `0.1.1` and `0.1.0` releases. |
| `/development_ledger.md` | Logged goals, fixes, and file modification details for both sessions. |
| `/CONTRIBUTORS.md` | Initiated contributors ledger. |
