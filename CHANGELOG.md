# Changelog

All notable changes to the Enquiry Manager will be documented in this file.

## [0.72.4] - 2026-08-17

### Added & Refactored
- **V6 Surgical Strike 1.2: Dual-Track Save Logic (`src/components/QuickActivityDrawer.tsx`)**:
  - **Part 1 — Execution Time-Snap**: In the initialization `useEffect`, injected auto-snap logic to stamp `activityDate` with current local datetime (`YYYY-MM-DDTHH:mm`) whenever `drawerMode === 'execute'`.
  - **Part 2 — Dual-Track Save Routing**: Refactored `handleSubmit` to fork behavior based on `drawerMode`:
    - **Live Execution Mode (`drawerMode === 'execute'`)**: Updates the `existingLog` using the snapped date, active status/outcome/purpose, notes, and marks `completedAt: nowIso`. If a next follow-up date is provided, explicitly spawns a second, brand-new activity log queued with status `'Scheduled / Planned'`, target date, and follow-up agenda notes linked to the company/contact.
    - **Edit Mode (`drawerMode === 'edit'`)**: Performs standard mutation on `existingLog` preserving/applying updated fields without spawning a duplicate log.
    - **Create Mode**: Standard creation of a single activity log with optional follow-up scheduling.

## [0.72.3] - 2026-08-17

### Added & Refactored
- **V6 Surgical Strike 1.1: State & UI Routing**:
  - **Part 1 — Drawer Mode State & Routing (`src/components/CallLogManager.tsx` & `src/App.tsx`)**: Introduced `drawerMode` state (`'create' | 'edit' | 'execute'`) and `editingLog` state. Explicitly set `drawerMode` to `'execute'` on the "Execute Task" Zap button, `'edit'` on pencil icon actions, and `'create'` on new log creation and `onScheduleFollowUp`.
  - **Part 2 — Visual Engine Live Execution Banner (`src/components/QuickActivityDrawer.tsx`)**: Extended `QuickActivityDrawerProps` with `drawerMode?: 'create' | 'edit' | 'execute'` and added a pulsing "Live Execution Mode" banner at the top of the form body when `drawerMode === 'execute'`.

## [0.72.2] - 2026-08-17

### Added & Refactored
- **V5 Surgical Strike 1.2: Smart Outcome Presets**:
  - **Part 1 — Supercharge Presets `onClick` (`src/components/QuickActivityDrawer.tsx`)**: Injected intelligent mapping logic into the "ONE-TAP OUTCOME PRESETS" button click handler to automatically deduce `status` and `outcome` based on preset keywords and active interaction channel before setting notes.
  - **Part 2 — State Safeguard**: Verified alignment with `activityLogic.ts` dictionaries to ensure state updates pass sanitization checks without being overwritten.

## [0.72.1] - 2026-08-17

### Added & Refactored
- **V5 Surgical Strike 1.1: Queue UI & Follow-Up Wiring**:
  - **Part 1 — Queue Action Label Clarification (`src/components/CallLogManager.tsx`)**: Renamed the queue action button label from `"Log / Reschedule"` to `"Execute Task"`.
  - **Part 2 — Follow-Up Wiring (`src/components/CallLogDetailModal.tsx` & `src/components/CallLogManager.tsx`)**: Added `onScheduleFollowUp` prop to `CallLogDetailModalProps`, wired the footer Schedule Follow-Up button to execute it, and passed the handler from `CallLogManager` to open the activity drawer for a new task pre-filled with company/contact context.


## [0.72.0] - 2026-08-17

### Added & Refactored
- **V4 Surgical Strike 2: Logic Decoupling & Advanced Dropdowns**:
  - **Part 1 — Central Logic Engine (`src/utils/activityLogic.ts`)**: Created utility file exporting `getPurposesForChannel(channel)` and `getOutcomesForStatus(status)` as single source of truth for channel purposes and status outcomes.
  - **Part 2 — Drawer Wiring (`src/components/QuickActivityDrawer.tsx`)**: Replaced hardcoded option mappings in PURPOSE and OUTCOME `<select>` dropdowns with calls to `getPurposesForChannel` and `getOutcomesForStatus`.
  - **Part 3 — State Sanitization**: Updated channel/status selection handlers and reactive effects to sanitize `purpose` and `outcome` state on switch, preventing invalid cached option selections.

## [0.71.0] - 2026-08-17

### Added & Refactored
- **V4 Surgical Strike 1: Contextual UI Engine (`QuickActivityDrawer.tsx`)**:
  - **Part 1 — Dynamic Configuration Dictionaries**: Defined `channelStatuses` and `channelPresets` records mapping distinct status lists and one-tap outcome presets for `Call`, `WhatsApp`, `Email`, `Meeting`, and `Site Visit`.
  - **Part 2 — Dynamic Labels & Rendering**: Refactored status buttons, outcome dropdowns, purpose selectors, and one-tap outcome preset chips to render dynamic uppercase labels (`{interactionChannel.toUpperCase()} STATUS / DISPOSITION`, `{interactionChannel.toUpperCase()} OUTCOME`, `{interactionChannel.toUpperCase()} PURPOSE`) and iterate cleanly over channel-specific configuration dictionaries.
  - **Part 3 — Channel Switching Auto-Default**: Injected channel selection logic and reactive effect to automatically reset `status` to the channel's default first item whenever the interaction channel is changed and the previous status is invalid for the new channel.

## [0.70.1] - 2026-08-17

### Fixed & Refactored
- **V3 Surgical Strike 2: Modal Z-Index Dominance**:
  - **Part 1 — Dial Down Header (`PageHeader.tsx`)**: Reduced outermost `sticky top-0` header z-index from `z-40` to `z-20` so scrolling page titles surrender cleanly to modal overlays.
  - **Part 2 — Elevate Diagnostic Modal (`CloudSyncHub.tsx`)**: Elevated System Health / Diagnostics Hub (`Local Memory Cache Diagnostics`) backdrop from `z-50` to `z-[100]`.
  - **Part 3 — Elevate Core Modals (`CompanyModal.tsx`, `QuickActivityDrawer.tsx`, `CallLogDetailModal.tsx`)**: Upgraded outermost fixed backdrops from `z-50` to `z-[100]` to permanently prevent header clipping.

## [0.70.0] - 2026-08-17

### Added & Refactored
- **V3 Surgical Strike 1: Mobile Responsiveness Core (`App.tsx`, `Sidebar.tsx`, `PageHeader.tsx`, Active Screen Views)**:
  - **Part 1 - Mobile State & Drilling (`App.tsx`)**: Introduced `isMobileMenuOpen` state in `App.tsx` with global event listener support and reset triggers; passed `isOpen` and `onClose` to `<Sidebar />`; drilled `onOpenMobileMenu` prop to all active tab screens (`Dashboard`, `CallLogManager`, `EnquiryList`, `CompanyModal`, `SalespersonProfiles`, `ProductManager`, `SettingsHub`).
  - **Part 2 - Mobile Off-Canvas Drawer (`Sidebar.tsx`)**: Refactored `Sidebar` to support responsive mobile off-canvas drawer with `fixed inset-0 z-[200]` backdrop blur overlay and dismiss close button (`X`), while keeping the static desktop sidebar layout for `md:` and above.
  - **Part 3 - Hamburger Menu Toggle (`PageHeader.tsx`)**: Added `onOpenSidebar` prop and injected a responsive mobile hamburger button (`Menu`) on the header's left side, hidden on desktop (`md:hidden`) and active on mobile screens.

## [0.69.3] - 2026-08-16

### Enhanced & Refactored
- **V2 Surgical Strike 6.2: Queue UI Overhaul (`CallLogManager.tsx`)**:
  - **Part 1 - Inject Universal Schedule Dates**: Injected a universal schedule date/time badge (`formatOverdueDisplayDate(item.date)`) into every single scheduled item card in the Operator Call Queue so target dates are universally visible across all scheduled states.
  - **Part 2 - Deprecate 'Fast Log' Button Text**: Updated the primary queue item action button label from `"Fast Log Call Outcome"` to `"Log / Reschedule"` while maintaining the lightning bolt icon (`Zap`).

## [0.69.2] - 2026-08-16

### Fixed & Polish
- **V2 Surgical Strike 6.1: Z-Index & Navigation Polish (`PageHeader.tsx` & `QuickActivityDrawer.tsx`)**:
  - **Part 1 - Z-Index Dial Down (`PageHeader.tsx`)**: Dialed down `PageHeader` outermost wrapper z-index from `z-[100]` to `z-40`, ensuring sticky headers stay above table data headers while remaining behind modal overlays (`z-50`).
  - **Part 2 - Drawer Auto-Close (`QuickActivityDrawer.tsx`)**: Added `onClose()` calls inside the `[View Previous Logs]` button click handlers so the Quick Activity Drawer automatically closes when opening Company Inspection / 360 view modals.

## [0.69.1] - 2026-08-16

### Fixed & Enhanced
- **V2 Surgical Strike 5: Sticky Header Overflow Override (`App.tsx` & `PageHeader.tsx`)**:
  - **Part 1 - The Scroll Container (`App.tsx`)**: Ensured outer application layout container uses `h-screen overflow-hidden` and the main `<main>` panel is configured as the explicit scrolling container with `h-screen overflow-y-auto flex flex-col flex-1` to prevent parent overflow restrictions from breaking CSS sticky behavior.
  - **Part 2 - Header Z-Index (`PageHeader.tsx`)**: Updated `PageHeader` outermost wrapper classes to `sticky top-0 z-[100] w-full` so page headers consistently float above table headers, sticky columns, and interactive list items across all tabs.

## [0.69.0] - 2026-08-16

### Added & Refactored
- **V2 Surgical Strike 4: Core Architecture Overhaul (Scheduling vs. Logging)**:
  - **Part 1 - Deprecated Fast Outcome Logger (`CallLogManager.tsx`)**: Completely removed `<FastOutcomeLogger />` / `<FastQueueDrawer />` modal rendering and re-wired all queue triggers (`openFastQueueLogger`) to explicitly launch `QuickActivityDrawer` with `{ existingLog: entry, logToEdit: entry }`.
  - **Part 2 - Decoupling Engine (`QuickActivityDrawer.tsx`)**: Introduced `isCompletingScheduledTask` branch in submission logic. When completing a scheduled task, `QuickActivityDrawer` mutates the original scheduled task record to `status: 'Completed'` (or `'Cancelled'`) to clear the overdue queue, and generates a BRAND NEW activity log payload document for the newly executed activity.

## [0.68.2] - 2026-08-16

### Added & Fixed
- **V2 Surgical Strike 3: Express Lead Company Saves (`QuickActivityDrawer.tsx`)**:
  - **Part 1 - Company Line Call Button (`QuickActivityDrawer.tsx`)**: Added green "Call" button (`bg-emerald-600/20 text-emerald-300`) inside the New Company Line Details input row next to `selectedContactPhone`, wired directly to `href="tel:${selectedContactPhone.replace(/[^\d+]/g, '')}"`.
  - **Part 2 - Company Line Persistence (`QuickActivityDrawer.tsx`)**: Explicitly wired `CompanyRepository.updateCompany` and `CompanyRepository.saveCompany` during activity log submission to persist newly created company phone lines into the company record in Firestore and local state safely without overwriting existing lines.

## [0.68.1] - 2026-08-16

### Fixed & Refactored
- **V2 Surgical Strike 2: State Leaks & Dead Button Wiring (`CompanyModal.tsx`, `QuickActivityDrawer.tsx`, `CallLogDetailModal.tsx`)**:
  - **Part 1 - Company Modal State Leak (`CompanyModal.tsx`)**: Enhanced `closeCompanyModal()` and prop `useEffect` listeners to explicitly reset all localized form states (name, legal suffix, phones, emails, restricted line states, temperature, relationship, notes, aliases) upon modal closure via "X", Cancel, or prop clearing.
  - **Part 2 - View Previous Logs Wiring (`QuickActivityDrawer.tsx`)**: Added `onOpen360`, `onInspectCompany`, and `onOpenCompanyModal` props and wired both `[View Previous Logs]` click handlers to open the company 360 inspection view when `selectedCompanyId` is valid.
  - **Part 3 - Dead Schedule Follow-Up Button (`CallLogDetailModal.tsx`)**: Unwrapped and wired the "Schedule Follow-Up" footer button to call `onClose()` and seamlessly trigger `onLogFollowup(entry)` or hand off `onEdit(entry)` to the activity drawer.

## [0.68.0] - 2026-08-16

### Added & Refactored
- **V2 Surgical Strike 1: Global UI & UX Polish (`src/components/layout/PageHeader.tsx`, `src/components/QuickActivityDrawer.tsx`, `src/components/CompanyModal.tsx`)**:
  - **Part 1 - The Sticky Header (`PageHeader.tsx`)**: Added `sticky top-0 z-50` styling with solid non-transparent background to ensure sub-headers remain locked to the top during table scrolling without transparency bleed.
  - **Part 2 - Contact Display Text Cleanup (`QuickActivityDrawer.tsx`)**: Stripped redundant phone numbers from the Contact Person `<select>` dropdown options, displaying strictly name and role (e.g. `John Doe (Tester)`) since phone numbers are handled in the adjacent field.
  - **Part 3 - Global Temperature Standardization (`CompanyModal.tsx`)**: Refactored the "Temperature (Heat Level)" selector inside the Canonical Company form to use standardized options with emojis (`Cold ❄️`, `Warm 🌤️`, `Hot 🔥`, and `DNC 🚫`).

## [0.67.1] - 2026-08-15

### Fixed & Visual Polish
- **Surgical Strike 5.1: The Final Sweep (`src/components/CompanyModal.tsx`, `src/components/Company360Modal.tsx`)**:
  - **Part 1 - WhatsApp Link Sanitization**: Implemented `sanitizeWhatsAppNumber` helper function across `CompanyModal.tsx` and `Company360Modal.tsx`. Strips non-digit characters and automatically replaces leading `0` with the `971` UAE country code for 10-digit mobile numbers starting with `05` (e.g. `0501234567` -> `971501234567`), fixing broken `wa.me` links.
  - **Part 2 - Typo Eradication**: Removed redundant `+` prefixes from button text nodes in `CompanyModal` (`Add Contact`, `Add Phone`, `Add Email`) and `Company360Modal` (`Add Contact Person`), eliminating duplicate `+ + Add` rendering beside `<Plus />` icons.

## [0.67.0] - 2026-08-15

### Added & Refactored
- **Surgical Strike 4.2: Batch Actions & History Injection (`src/components/CallLogManager.tsx`, `src/components/CompanyModal.tsx`)**:
  - **Part 1 - Batch Action Engine (`CallLogManager.tsx`)**:
    - **Batch Actions Toolbar**: Implemented contextual toolbar rendering when `selectedLogIds.length > 0` in the history tab.
    - **Batch Delete**: Integrated confirmation dialog (`askConfirm`) and automated batch deletion from Firestore (`safeDeleteDoc`) and local state (`setCallLogs`), followed by toast feedback and selection clearing.
    - **Batch Reassign**: Added UI trigger button ready for operator assignment workflows with toast notification.
  - **Part 2 - Company History Injection (`CompanyModal.tsx`)**:
    - **Recent Interactions Section**: Injected a read-only "Recent Interactions" section at the bottom of the standard company view displaying up to 5 recent interaction logs.
    - **Interaction Details**: Rendered Date, Operator, Call Status, and Call Outcome badges for each log.
    - **Empty State**: Added "No recent interactions found" placeholder when no logs exist for the company.
    - **1-Click Activity Drawer Integration**: Added "+ Log Interaction" shortcut button triggering `onOpenActivityDrawer`.

## [0.66.6] - 2026-08-15

### Fixed & Visual Cleanup
- **Surgical Strike 4.1: Call Log Visual Cleanup (`src/components/CallLogManager.tsx`)**:
  - **Part 1 - Log Table Purge**: Enforced strict exclusion of `Scheduled / Planned` items from the "Full Call History & Search" tab, reserving scheduled tasks strictly for the Operator Call Queue. Updated tab count badge to accurately reflect filtered historical logs.
  - **Part 2 - Scheduled Status Badge Softening**: Preserved sleek blue status badge styling (`bg-blue-500/20 text-blue-400 border-blue-500/40`) for `Scheduled / Planned` items in call log badges.
  - **Part 3 - Humanized Overdue Dates**: Implemented `formatOverdueDisplayDate` to format overdue ISO timestamps into human-readable strings (e.g. `Aug 13, 10:51 AM` or `Aug 13`), preventing raw unformatted ISO strings from appearing in warning badges while handling undefined/missing values safely.

## [0.66.5] - 2026-08-15

### Fixed & Refactored
- **Surgical Strike 3.2: Edit Flow Unification (`src/components/CallLogDetailModal.tsx`, `src/components/CallLogManager.tsx`)**:
  - **Converted Center Modal to Read-Only Viewer**: Completely removed redundant internal `isEditing` state, form inputs, and `handleSaveEdit` logic from `CallLogDetailModal.tsx`.
  - **Unified Edit Action Routing**: Re-wired the "Edit Log" action button inside `CallLogDetailModal` and `CallLogManager` to close the detail modal (`onClose`) and route editing directly to `QuickActivityDrawer` in edit mode (`onOpenActivityDrawer({ existingLog: entry, logToEdit: entry })`).


### Fixed
- **Quick Activity Drawer Dynamic Input Layout Refactor (`src/components/QuickActivityDrawer.tsx`)**:
  - **Vertical Stacking for Dynamic Fields**: Replaced side-by-side cramped sub-grids for "+ Create New Contact Person", "+ Add New Contact Detail", and "+ Add New Company Line" with full-width vertical stacks (`flex flex-col gap-2.5`).
  - **Labeled Input Fields**: Added clear, styled uppercase section labels for dynamic fields (`Full Name`, `Role / Designation`, `Phone Number`, `Line Phone Number`, `Line Tag / Label`).
  - **Full-Width Stretch**: Ensured new entry input fields stretch to `w-full` across the drawer, eliminating placeholder text truncation.
  - **Grid Column Spans**: Applied `col-span-full` to `Company Line`, `Email` channel, and `Meeting` channel field wrappers inside the drawer layout grid.

## [0.66.3] - 2026-08-14

### Fixed
- **Edit Mode Modal Layout Full Width Fix (`src/components/CallLogDetailModal.tsx`)**:
  - **Grid Column Span Resolution**: Updated form container wrappers (`Target Company`, `Contact Person`, and `Phone Tag / Label`) in edit mode to use `col-span-full` instead of being restricted to single grid columns (`col-span-1`).
  - **Full-Width Stretch**: Eliminated the 50% width squishing issue in `CallLogDetailModal` edit mode, ensuring all form inputs, dropdowns, and target mode toggles span 100% of the modal width cleanly with zero empty side space.

## [0.66.2] - 2026-08-14

### Fixed
- **Call Log Table Action Handler Routing Decoupling (`src/components/CallLogManager.tsx`)**:
  - **View Action Routing Fix**: Updated the Eye icon ("View Call Log") action in both the **Operator Call Queue** and **Full Call History** tables to directly launch the read-only Log Details modal (`CallLogDetailModal`) showing full metadata, notes, and outcomes without opening the `QuickActivityDrawer` entry sidebar.
  - **Edit Action Routing Fix**: Updated the Pencil icon ("Edit Activity Log") action across both tables to properly trigger the dedicated `Edit Activity Log` sidebar/drawer (`QuickActivityDrawer`) pre-populated with log data (`CL-XXXX`).
  - **Tooltip & Handler Alignment**: Matched tooltips (`View Call Log` vs `Edit Activity Log`) and action handlers across both Call Queue and Call History tables for consistency.

## [0.66.1] - 2026-08-14

### Fixed & Refactored
- **Target Mode & Phone Dropdown Overhaul in Quick Activity Drawer (`src/components/QuickActivityDrawer.tsx`, `src/components/CallLogManager.tsx`)**:
  - **Refined Target Mode Toggle**: Relabeled toggle buttons to "Contact Person" vs "Company Mainline" with clean state resets (clearing phone numbers, emails, and toggles) when switching target logging modes.
  - **Dedicated Company Line Dropdown**: Added dedicated company mainline selector with options for saved front desk/main lines, custom line tags, "+ Add New Company Line" mode, and inline "Call" action buttons.
  - **Separated Contact Person Phone Selector**: Built dedicated contact phone detail dropdown mapping saved numbers (`Mobile`, `Landline`, direct numbers) for selected personnel with "+ Add New Contact Detail" mode and inline "Call" action buttons.
  - **Call Log Manager Cursor Polish**: Added explicit `cursor-pointer` utility to the Edit Log action button in `CallLogManager.tsx`.

## [0.66.0] - 2026-08-14

### Added & Refactored
- **Phase 4: UI Polish, Quick Actions, & Purpose Dropdowns (`src/components/CallLogManager.tsx`, `src/components/Company360Modal.tsx`, `src/components/CallLogDetailModal.tsx`, `src/components/QuickActivityDrawer.tsx`, `src/utils/defaults.ts`)**:
  - **History Symbols**: Injected dynamic leading interaction icons (`<PhoneCall />`, `<Mail />`, `<MessageSquare />`, `<Calendar />`) across Operator Queue, Call Log History table, Activity Log Details modal, and Company 360 Call Operations timeline based on `interaction_type`.
  - **Contact Quick Actions**: Embedded 1-click Quick Action mini-buttons (Dial, Email, WhatsApp) directly next to contact details in `Company360Modal.tsx`. Ensured WhatsApp links clean non-digits via regex (`replace(/[^0-9]/g, '')`).
  - **List Sorting Controls**: Integrated date sorting toggles ("Date: Oldest First" / "Date: Newest First") across the Operator Queue and Full Call History views in `CallLogManager.tsx`.
  - **Expanded & Preserved Call Purpose Dropdowns**: Expanded `SYSTEM_CALL_PURPOSES` presets in `defaults.ts` and updated `CallLogDetailModal.tsx` and `QuickActivityDrawer.tsx` dropdowns to seamlessly handle standard presets and custom values.

## [0.65.0] - 2026-08-14

### Added & Refactored
- **Phase 3: DNC & Temperature Restructure (`src/types.ts`, `src/utils/defaults.ts`, `src/components/CompanyModal.tsx`, `src/components/Company360Modal.tsx`, `src/components/ContactModal.tsx`)**:
  - **Company Temperature Model Extension**: Extended `CompanyTemperature` type definition and defaults to include `'DNC'`. Configured heat color map to assign `'DNC'` a high-visibility rose/dark red badge theme (`#e11d48`).
  - **4-Stage Temperature Cycling**: Upgraded company heat badges across `CompanyModal.tsx` and `Company360Modal.tsx` to cycle across 4 stages: Cold ❄️ -> Warm 🌤️ -> Hot 🔥 -> DNC 🚫. Cycling to DNC automatically sets `is_dnc: true` on the company document.
  - **Form UI Cleanup**: Removed legacy standalone "Is DNC" checkbox from `CompanyModal.tsx` form, consolidating company DNC management into the Temperature selector.
  - **Sleek Modern Contact DNC Toggle**: Replaced standard checkbox in `ContactModal.tsx` with an interactive toggle switch, warning banner container, and context-aware reason input field.

## [0.64.1] - 2026-08-12

### Fixed
- **Guaranteed Unique Key Generation in Quick Activity Drawer (`src/components/QuickActivityDrawer.tsx`)**:
  - Resolved React duplicate key error (`ecp_1`) by replacing static ID initialization with dynamic unique ID generator (`makeExpressId`).
  - Added fallback index suffixing (`${item.id}_${idx}`) across all express phone, express email, company combobox, contact dropdown, and enquiry dropdown `.map()` loops.

## [0.64.0] - 2026-08-12

### Added & Enhanced
- **Ultimate Express Cold Call & Auto-CRM Registration Workflow (`src/components/QuickActivityDrawer.tsx`)**:
  - Overhauled "Unlinked Lead" tab into a dual-level Express Form cleanly separating "Company Information" from "Contact Person Info".
  - Added inline "📞 Call Now" action buttons for every entered company or direct phone number (`target="_blank"`, `rel="noopener noreferrer"`, `onClick={(e) => e.stopPropagation()}`).
  - Implemented dynamic, multi-phone and multi-email arrays allowing operators to add secondary numbers mid-call.
- **Flexible Custom Tagging for Phones & Emails (`src/components/QuickActivityDrawer.tsx`)**:
  - Replaced rigid dropdown tags with custom comboboxes and free-text inputs for phone/email labels with smart datalist suggestions (`Main`, `Reception`, `Engineering Dept`, `Direct Line`, `Sales Desk`, etc.).
- **Normalized Phone Matching & Duplicate Suppression (`src/types.ts`, `src/components/CallLogManager.tsx`)**:
  - Added `normalizePhoneNumber` and `isSamePhoneNumber` helper functions to strip spaces, dashes, and country codes before matching numbers.
  - Resolved live phone lookup in `CallLogManager.tsx` to automatically suppress false duplicate assignment prompts when dialed numbers match existing company or contact records.
- **Seamless Auto-CRM Generation & Linking (`src/components/QuickActivityDrawer.tsx`)**:
  - Updated `handleSubmit` in `QuickActivityDrawer.tsx` to automatically generate and save Company records via `CompanyRepository.saveCompany` when a company name and phone/email are provided.
  - Automatically nests and registers Contact records under the new Company when contact details are provided.
  - Automatically links saved call logs to newly generated `company_id` and `contact_id` records while falling back to standard unlinked logs when only a phone number is provided.

## [0.63.3] - 2026-08-12

### Fixed & Enhanced
- **Universal Communication Link New-Tab & Event Protection (`src/components/*`)**:
  - Audited and updated all communication links across `CompanyModal.tsx`, `CallLogDetailModal.tsx`, `CallLogManager.tsx`, `Company360Modal.tsx`, `ContactDetailModal.tsx`, `Dashboard.tsx`, and `QuickActivityDrawer.tsx`.
  - Enforced `target="_blank"`, `rel="noopener noreferrer"`, and `onClick={(e) => e.stopPropagation()}` on every `tel:`, `mailto:`, and `https://wa.me/` anchor tag.
  - Ensured phone numbers launch device dialers, email addresses trigger mail clients, and WhatsApp links open WhatsApp Web/App in a dedicated browser tab without disrupting CRM navigation or triggering row/card select events.

## [0.63.2] - 2026-08-12

### Fixed & Enhanced
- **High-Contrast Companies Registry Table (`src/components/CompanyModal.tsx`)**:
  - Corrected light-on-light color clash in the Companies Registry list/table view by applying high-contrast Tailwind classes (`text-slate-900 dark:text-slate-100` and `text-slate-800 dark:text-slate-200`).
- **Preserved User Capitalization & Canonical Matching (`src/components/CompanyModal.tsx`)**:
  - Removed aggressive lowercasing on frontend display name input states. The exact user capitalization (e.g. "Green Land LLC") is strictly preserved in `display_name`, while the lowercase version is saved in the background as `canonical_name` strictly for duplicate checking.
- **Phone & Email Categorization & Badge Inspector (`src/components/CompanyModal.tsx`)**:
  - Upgraded Phone and Email array controls in the company edit/create form with category selectors (`Main`, `Mobile`, `Landline`, `Support`, `Billing`, `Direct Line`, `WhatsApp`, `Fax`, `Work`, `Personal`, etc.).
  - Updated Company Details view to render clean category badges alongside all saved phone numbers and email addresses.
- **Company Name Cascade Sync & Historical Phone Protection (`src/services/repositories/CompanyRepository.ts`)**:
  - Updated `CompanyRepository.updateCompany` and `cascadeUpdateCallLogsCompanyName` to cascade company name changes across matching call log entries in local store (`activity_logs` and `call_logs`) and Firestore while strictly preserving the historical `phone` / `contact_phone` fields recorded on each call log.
- **Ghost Log Prevention & Fast Logger Missing Lead Guard (`src/components/QuickActivityDrawer.tsx`, `src/components/CallLogManager.tsx`)**:
  - Added strict validation in `QuickActivityDrawer.tsx` preventing activity submission when no CRM Contact or Unsaved Lead is attached, rendering an inline alert banner.
  - Hardened Fast Call Outcome Logger (`CallLogManager.tsx`) with optional chaining (`?.`) to prevent runtime crashes on legacy blank logs and enforced an inline "Missing Lead Guard" before marking logs as completed.

## [0.63.1] - 2026-08-12

### Fixed & Enhanced
- **Firestore Connection Resilience & Long Polling Fallback (`src/firebase.ts`)**:
  - Configured `initializeFirestore` with `experimentalAutoDetectLongPolling: true` to automatically adapt in iframe/sandboxed environments when WebSocket or WebChannel streaming connections drop or are restricted by proxies.
  - Enhanced `handleFirestoreError` to gracefully log network disconnects/reconnections (`isUnavailable`) while confirming that local IndexedDB storage and `SyncEngine` handle all reads and writes seamlessly in offline mode.
  - Ensured zero application downtime or data loss during temporary network interruptions.

## [0.63.0] - 2026-08-12

### Added & Enhanced
- **Activity Drawer Edit Hydration & Update Routing (`QuickActivityDrawer.tsx`, `CallLogDetailModal.tsx`)**:
  - Refactored `QuickActivityDrawer` to accept `existingLog` / `logToEdit` props with an automated `useEffect` form hydration hook.
  - Implemented conditional submit routing calling `safeUpdateDoc` on existing log IDs instead of creating duplicate documents.
  - Bound "Edit Log" buttons across `CallLogDetailModal.tsx`, `CompanyModal.tsx`, `CallLogManager.tsx`, and `Dashboard.tsx` to launch `QuickActivityDrawer` in edit mode with 100% field hydration.
- **Scheduled Call Preset & Timestamp Automation (`QuickActivityDrawer.tsx`)**:
  - Added a "Scheduled" status preset button automatically setting outcome to 'Pending'.
  - Added timestamp automation: when updating a 'Scheduled' call to 'Completed', `status` transitions to 'Completed' and `completedAt` timestamp is recorded alongside `updatedAt`.
- **Dropdown Eradication & Uniform 1-Tap Pill Grid (`QuickActivityDrawer.tsx`, `CallLogManager.tsx`)**:
  - Removed native `<select>` dropdowns for Call Outcomes, Interaction Purposes, and Call Statuses across `QuickActivityDrawer` and `CallLogManager`.
  - Implemented standard 1-Tap Pill Grid styled with dark theme accents (Green for Success, Amber for Follow-up, Red/Slate for Closed).
- **Fast Call Outcome Logger Modernization (`CallLogManager.tsx`)**:
  - Redesigned the Fast Outcome Logger drawer to match the Slate dark theme (`bg-slate-900 border-slate-800`).
  - Added **Missing Lead Guard**: Inline editable fields (`[ + Add Company Name ]`, Contact Person) directly inside the modal to tag leads on the fly.
  - Added **Smart Date Toggle**: Quick chips (`Tomorrow`, `Next Week`, `None`) that automatically calculate follow-up dates in local timezone math using `getOffsetDateString`.

## [0.62.0] - 2026-08-12

### Added & Enhanced
- **Activity Log Call Disposition State Sync (`QuickActivityDrawer.tsx`)**:
  - Bound the Call Status buttons ('Busy', 'No Answer') to automatically sync and populate the `outcome` text state with matching disposition labels upon click, preventing redundant manual typing for salespeople.
- **Duplicate Company Guard & Batch Write Safety (`CallLogRepository.ts`, `LeadConversionModal.tsx`)**:
  - Implemented a strict query check against existing workspace companies prior to executing the lead conversion batch write in `ActivityLogRepository.convertUnsavedLeadToClient`.
  - Throws a explicit hard error if a company with the same canonical or display name already exists in the active workspace context, aborting batch execution and protecting against duplicate company creation.
  - Handled the duplicate company error gracefully in `LeadConversionModal` with a high-visibility warning banner while keeping the submission button locked during `isSubmitting`.
- **IndexedDB Object Store Health & Fallback Safety (`db.ts`)**:
  - Verified and guaranteed explicit registration for `companies`, `contacts`, `activity_logs`, `call_logs`, `enquiries`, `products`, `metadata`, and `mutation_queue` object stores in IndexedDB initialization.
  - Added safety checks in `saveToLocalStore`, `getFromLocalStore`, and `clearAllLocalStores` to guard against `NotFoundError` IDBDatabase transaction failures when accessing dynamic stores, gracefully falling back to local storage when object stores are unmounted or pending upgrades.
- **Premium Dark UI Theme Unification (`CompanyModal.tsx`, `ContactModal.tsx`)**:
  - Refactored all sub-modals across `CompanyModal.tsx` and `ContactModal.tsx` to the Slate Dark design standard (`bg-slate-900`, `border-slate-800`, `bg-slate-950`, `text-slate-100`/`text-slate-300`, `indigo-600`/`blue-600` primary action CTAs).
  - Applied the dark theme consistently across the Add/Edit Company Form, Merge Canonical Companies, Company Deletion Choice, Custom Confirmation Dialogs, Duplicate Fuzzy Match Warning, Bulk Reassign Modal, Delete Contact Confirmation, and Contact Management sub-modals.

## [0.61.0] - 2026-08-11

### Added & Enhanced
- **"Unsaved Lead" to "CRM Client" Atomic Conversion Workflow (`CallLogDetailModal.tsx`, `LeadConversionModal.tsx`, `ActivityLogRepository.ts`)**:
  - **Conversion UI Trigger**: Added a prominent primary "🚀 Convert to CRM Client" button in `CallLogDetailModal` when inspecting activity logs with unlinked leads (missing `company_id`).
  - **Lead Conversion Modal**: Built `LeadConversionModal` pre-filling form inputs with `unlinked_name` and `unlinked_contact_info`. Supports required inputs for New Company Name, Legal Suffix, Phone, Email, and Contact Person Name. Strictly enforces `activeWorkspace.id`.
  - **Atomic Transaction (`ActivityLogRepository.ts`)**: Added `convertLeadToClient` repository method executing a Firestore `writeBatch` that atomically creates a new `companies` document, creates an associated `contacts` document, and updates all matching activity logs in `call_logs` with the new `company_id`, `company_name`, `contact_id`, and `contact_name`.
- **Enterprise CRM Restructure for Companies & Contacts (`types.ts`, `CompanyModal.tsx`, `ContactModal.tsx`, `Company360Modal.tsx`)**:
  - **Standardized `ContactMethod` Interface**: Introduced reusable `ContactMethod` interface (`{ id: string; label: string; value: string; }`) supporting multiple phone numbers and email addresses per record.
  - **Company & Contact Schema Update**: Added `general_phones` and `general_emails` arrays to `Company`, and `phones`, `emails`, and `designation` to `Contact`, while maintaining backward-compatible legacy string fields (`phone`, `email`, `mobile`, `landline`).
  - **Dynamic Array Builders**: Replaced singular phone/email text inputs in `CompanyModal.tsx` and `ContactModal.tsx` with dynamic array builders featuring custom label dropdowns, value inputs, trash removal buttons, and "+ Add Phone" / "+ Add Email" controls.
  - **On-Mount Legacy Migration**: Configured modal initialization logic to automatically detect and map legacy string fields into the new `ContactMethod[]` format without data loss.
  - **Refactored Company 360° View**: Updated `Company360Modal.tsx` to render labeled phone and email array badges for general company info and associated contact personnel, with fallback support for legacy string fields.

## [0.60.0] - 2026-08-11

### Added & Enhanced
- **Direct Workspace Lifecycle Management in God Mode (`SuperAdminConsoleModal.tsx`, `SuperAdminEngine.ts`)**:
  - **Rename Workspace Control**: Added direct inline modal control on workspace cards under the `🟢 Workspaces` tab to modify `workspaces/{wsId}` document name across Firestore.
  - **Change Workspace Owner Control**: Added owner re-assignment dropdown listing registered users to update `created_by`, `created_by_email`, and `created_by_uid` fields for `workspaces/{wsId}`.
  - **Hard Delete / Cascade Wipe Control**: Implemented a red modal confirmation requiring exact workspace name input. On execution, performs a chunked `writeBatch` that permanently erases the `workspaces/{wsId}` document AND all associated records across `companies`, `contacts`, `enquiries`, `call_logs`, `products`, `salespersons`, `dropdown_configs`, `dropdown_enquiry_sources`, and `workspace_members`.
- **Dedicated "👥 Global Users" Tab (`SuperAdminConsoleModal.tsx`, `SuperAdminEngine.ts`)**:
  - Added a top-level tab in God Mode displaying all registered user accounts from the `users` collection in a high-density management table.
  - Features real-time search filtering by name, email, or UID with columns for Full Name, Email Address, Default Workspace ID, and Super Admin Status.
  - **Toggle Super Admin Action**: Allows granting or revoking `is_super_admin` privilege in Firestore for any user account (preserving permanent Super Admin status for the master account `sibuma.syedameer@gmail.com`).
  - **Delete Profile & Scrub Action**: Permanently deletes `users/{userId}` document and scrubs all matching entries across `workspace_members` and `salespersons` collections.
- **Complete Raw Collection Browser Coverage (`SuperAdminConsoleModal.tsx`, `SuperAdminEngine.ts`)**:
  - Updated `ALL_BROWSER_COLLECTIONS` dropdown to include all system collections (`users`, `workspaces`, `workspace_members`) alongside domain collections (`companies`, `contacts`, `enquiries`, `call_logs`, `products`, `salespersons`, `dropdown_configs`, `dropdown_enquiry_sources`).

## [0.59.0] - 2026-08-11

### Added & Enhanced
- **SaaS Workspace Ownership Handover & Intelligent Cascade Deletion Architecture (`UserProfileModal.tsx`, `WorkspaceHandoverWizardModal.tsx`, `download.ts`)**:
  - **Category-Based Workspace Analysis**: On account deletion request, analyzes all workspaces associated with the user and separates them into Category 1 (Sole Member/Admin) vs Category 2 (Multi-Member).
  - **Single-Member Workspace Cascade Wipe**: Automatically executes an atomic, batch-resilient (`writeBatch`) cascade wipe for Category 1 workspaces, permanently purging workspace documents and all matching records across `companies`, `contacts`, `enquiries`, `call_logs`, `products`, `salespersons`, `dropdown_configs`, `dropdown_enquiry_sources`, and `workspace_members`.
  - **Multi-Member Workspace Handover Wizard (`WorkspaceHandoverWizardModal.tsx`)**: Prompts the user to resolve multi-member workspace management before account deletion with two explicit paths per workspace:
    - *Option A (Transfer Ownership)*: Promotes an active team member to Admin/Owner role, updates `workspace_roles`, updates `workspace_members`, and removes the deleting user.
    - *Option B (Delete Workspace & Contents)*: Provides 1-click **Download Backup JSON** button (`exportWorkspaceData`) and schedules full workspace cascade wipe.
  - **Deep Identity & Membership Scrub**: Removes user document from `users` and `salespersons`, scrubs `workspace_members`, deletes Firebase Auth user (`deleteUser`), clears local caches, and performs clean sign out and redirect.
- **Strict Membership Resolution & Workspace Lifecycle Hooks (`App.tsx`, `FreshAccountOnboardingModal.tsx`, `WorkspaceManagerModal.tsx`)**:
  - Updated `userWorkspaces` memoized selector in `App.tsx` to subscribe to `workspace_members` real-time snapshot and strictly filter workspaces to only those where `currentUser.uid` holds an active membership document.
  - Ensured `FreshAccountOnboardingModal.tsx` and `WorkspaceManagerModal.tsx` immediately provision `workspace_members` records during workspace creation, quick start, custom setup, or invite redemptions.

## [0.58.0] - 2026-08-10

### Added & Enhanced
- **Per-Workspace Role & Permission Architecture Scoping (`types.ts`, `permissions.ts`, `UserManagementHub.tsx`, `WorkspaceManagerModal.tsx`, `SettingsHub.tsx`, `DropdownSettingsManager.tsx`, `App.tsx`)**:
  - Extended `UserProfile` and `WorkspaceMember` interfaces with `workspace_roles?: Record<string, 'admin' | 'sales_rep' | 'viewer' | string>` and workspace role mapping.
  - Refactored `getUserWorkspaceRole`, `getUserRoleInWorkspace`, `isAdmin`, `isWorkspaceAdmin`, `canManageWorkspace`, and `canDeleteRecords` in `permissions.ts` to accept `workspaceId` and evaluate workspace-specific roles (`user.workspace_roles?.[workspaceId]` or `user.workspace_profiles?.[workspaceId]?.role`) with fallback to global role.
  - Updated `UserManagementHub.tsx` role management to target `activeWorkspace.id` specifically when updating user roles, writing to `workspace_roles.${activeWsId}` and displaying workspace-evaluated roles in the team table.
  - Audited call sites across `WorkspaceManagerModal.tsx`, `SettingsHub.tsx`, `DropdownSettingsManager.tsx`, and `App.tsx` to pass `activeWorkspace?.id` into permission evaluations.
- **SyncEngine Import Strategy Toggle & Destructive Workspace Wipe (`SyncEngine.ts`, `WorkspaceManagerModal.tsx`)**:
  - Enhanced `importWorkspaceData` in `SyncEngine.ts` with `mode: 'merge' | 'replace'` and `onProgress` callback support.
  - Implemented pre-import batch-delete routine for `mode === 'replace'` that safely wipes all Firestore records for `targetWsId` across `companies`, `contacts`, `enquiries`, `call_logs`, `products`, and `salespersons` before writing incoming backup data.
  - Added segmented strategy control (Merge vs Wipe & Replace) and red warning confirmation modal in `WorkspaceManagerModal.tsx`.
- **Deep Email & Membership Account Deletion Scrub (`UserProfileModal.tsx`, `UserManagementHub.tsx`, `SettingsHub.tsx`)**:
  - Implemented transactional batch deletion routines in `UserProfileModal.tsx`, `UserManagementHub.tsx`, and `SettingsHub.tsx` during account termination.
  - Queries and scrubs records from `workspace_members`, `salespersons`, and removes user email references from `workspaces.member_emails` and `workspaces.members` before deleting the user document from Firestore and Firebase Authentication.
- **Onboarding Gate Enforcement & Clean Workspace Scoping (`App.tsx`, `FreshAccountOnboardingModal.tsx`)**:
  - Re-computed `userWorkspaces` in `App.tsx` to strictly ignore orphaned/stale records.
  - Enforced onboarding gate trigger (`userWorkspaces.length === 0`) to immediately invoke `FreshAccountOnboardingModal` for newly registered or re-created accounts.
  - Added `member_emails` tracking on workspace creation to ensure multi-method account lookup consistency.

## [0.57.0] - 2026-08-10

### Added & Enhanced
- **Activity Log System & UI/UX Audit Remediation (`QuickActivityDrawer.tsx`, `Company360Modal.tsx`, `CallLogDetailModal.tsx`)**:
  - Fixed Date Overwrite bug by separating `activityDate` (datetime-local picker) from `next_followup_date`.
  - Implemented `handleOutboundInteraction` helper on outbound contact action links in `Company360Modal.tsx` to automatically pop open the Quick Activity Drawer with pre-filled channel and contact details.
  - Built high-contrast dark slate `CallLogDetailModal.tsx` for full activity log inspection.
- **Visual Contrast, Scoping & Diagnostic Remediation (`CompanyModal.tsx`, `SalespersonProfiles.tsx`, `WorkspaceMemberCheckInModal.tsx`, `CloudSyncHub.tsx`, `WorkspaceManagerModal.tsx`)**:
  - Replaced low-contrast text classes in Companies Registry table view (`CompanyModal.tsx`) with high-contrast `text-slate-200 font-mono text-xs` for phones/emails and `text-slate-400 text-xs` for location labels.
  - Deduplicated team roster list in `SalespersonProfiles.tsx` by ID / email / initials to ensure each sales rep appears exactly once in the sidebar.
  - Formatted workspace name rendering in `WorkspaceMemberCheckInModal.tsx` using `activeWorkspace?.name || activeWorkspace?.display_name || 'Active Workspace'`.
  - Updated System Health & Connectivity version badge in `CloudSyncHub.tsx` from `v0.40.0` to `v0.57.0`.
  - Workspace-scoped all 6 entity metrics in `CloudSyncHub.tsx` by `activeWorkspace.id` and added a 7th metric card for "Activity Logs".
  - Standardized system health labels, export dialogs, and workspace module settings to consistently reference "Activity Logs" (covering Calls, WhatsApp, Emails, Meetings, Site Visits).
- **Full Call Log JSON Backup Export & Import (`SyncEngine.ts`, `WorkspaceManagerModal.tsx`)**:
  - Extended `exportWorkspaceData` and workspace export routines to query and bundle all `call_logs` Firestore records.
  - Created `importWorkspaceData` to parse and restore `call_logs` attached to target workspace IDs upon JSON backup upload.
  - Added "Import JSON" backup restore button and per-workspace "Export JSON" backup button in `WorkspaceManagerModal.tsx`.
- **Per-Workspace Member Check-In Modal (`WorkspaceMemberCheckInModal.tsx`, `App.tsx`)**:
  - Implemented workspace context check-in modal prompting users for Rep Initials, Job Title, and Direct Phone when entering a workspace without a workspace profile.
- **Fresh Account Onboarding Wizard (`FreshAccountOnboardingModal.tsx`, `App.tsx`)**:
  - Added un-dismissable onboarding modal when 0 workspaces exist, providing 1-Click Quick Start and Custom Workspace pathways.

## [0.56.0] - 2026-08-10

### Added & Enhanced
- **Log Activity Header CTA Button in Company Views (`Company360Modal.tsx` & `CompanyModal.tsx`)**:
  - Added primary high-visibility `⚡ Log Activity` CTA button in top modal header action bar in `Company360Modal.tsx`.
  - Added primary `⚡ Log Activity` CTA button in top header action bar of the company inspector panel in `CompanyModal.tsx`.
  - Configured click handlers to invoke `onOpenActivityDrawer` with the active company context (`companyId` and `companyName`).

## [0.55.0] - 2026-08-10

### Added & Enhanced
- **Full Activity Drawer Context & Dataset Lookup Fix (`src/components/QuickActivityDrawer.tsx`)**:
  - Wired full dataset props (`companies`, `contacts`, `enquiries`) from `src/App.tsx` into `<QuickActivityDrawer />`.
  - Added strict context state cleanup on drawer open or context shift to prevent data bleed between companies.
  - Implemented automatic primary contact and mobile number resolution when a `companyId` is active.
  - Implemented automatic proposal quote reference (`quote_ref_no`) lookup when an `enquiryId` is active.
  - Created a searchable Company Autocomplete Combobox for uncontextualized global activity logging.
  - Added submission validation guardrail requiring a selected company before saving an activity log.

## [0.54.0] - 2026-08-10

### Added & Enhanced
- **Reassign Open Records Before Deletion Workflow (`src/components/ReassignOpenRecordsModal.tsx`)**:
  - Created reusable modal component displaying active workload summaries ("X open quotes and Y scheduled follow-ups").
  - Dropdown selector to choose active target representative for seamless data handover.
  - Action buttons for "Reassign & Delete Profile" and "Direct Delete (Unassign)".
- **Sales Representative Handover (`src/components/SalespersonProfiles.tsx`)**:
  - Intercepted representative deletion to check for active enquiries (`status === 'Active'`) and pending activity logs.
  - Reassigns open quotes and call logs to target salesperson before executing `safeDeleteDoc`.
  - Supports direct unassign option clearing sales representative assignments before deletion.
- **User Account Handover (`src/components/UserManagementHub.tsx`, `src/components/SettingsHub.tsx`)**:
  - Intercepted user profile deletion in User Roster & Access Control hub.
  - Automatically matches active enquiries and scheduled follow-ups linked to user UID, email, or linked salesperson profile.
  - Reassigns or unassigns open records prior to permanently deleting the user account document.

## [0.53.0] - 2026-08-10

### Added & Enhanced
- **Search Term Generators (`src/utils/defaults.ts`)**:
  - Exported `generateContactSearchTerms(fullName, email, phones)` helper tokenizing names, emails, and phone digits into lowercase search terms.
  - Exported `generateProductSearchTerms(name, category, sku, brand)` helper tokenizing titles, categories, SKUs, and brands into search terms.
  - Updated `normalizeContact` to automatically backfill missing `search_terms` on contact startup normalization.
- **Search Term Attachment in Modals (`src/components/ContactModal.tsx`, `src/components/ProductManager.tsx`, `src/types.ts`)**:
  - Attached `search_terms` to `SoftDeleteFields` in `src/types.ts`.
  - Automatically compute and attach `search_terms` to contact payloads in `ContactModal.tsx` on save.
  - Automatically compute and attach `search_terms` to product payloads in `ProductManager.tsx` on save.

## [0.52.0] - 2026-08-10

### Added & Enhanced
- **S/N Quote Resequencing Automation (`src/App.tsx`)**:
  - Integrated `syncSNNumbersInFirestore()` directly into `handleDeleteEnquiry` and `handleBulkDeleteEnquiries`.
  - Automatically re-sequences remaining quote S/N numbers sequentially (`1001`, `1002`, `1003`...) in Firestore and local state after any deletion to eliminate sequence gaps.
- **Duplicate Company Match Dialog Component (`src/components/DuplicateMatchModal.tsx`)**:
  - Implemented `DuplicateMatchModal` as a clean, dark-slate modal with high-contrast warning banner showing matching existing company details (Canonical Name, Phone, Contact Email/Location).
  - Provided dual action buttons ("Merge & Use Existing" vs. "Save as Separate Record") with backwards-compatible support for `ResolutionManagerModal` properties.


## [0.51.0] - 2026-08-10

### Added & Enhanced
- **Creator & Modifier Audit Metadata Fields (`src/types.ts`, `src/components/CompanyModal.tsx`, `src/components/ContactModal.tsx`, `src/components/EnquiryForm.tsx`, `src/components/QuickActivityDrawer.tsx`, `src/App.tsx`)**:
  - Attached `created_by_uid` and `created_by_name` creator metadata on creation of Company and Contact entities across modals and inline creators.
  - Attached `last_modified_by_uid`, `last_modified_by_name`, and `updatedAt` modifier metadata on updates across Company, Contact, Enquiry, and CallLog/Quick Activity records.
  - Updated `SoftDeleteFields` and `Contact` type definitions in `src/types.ts` to seamlessly accommodate audit tracking metadata across all write operations (`safeAddDoc`, `safeUpdateDoc`, `safeSetDoc`).


## [0.50.0] - 2026-08-09

### Added & Enhanced
- **Phase 16: Proposal Revisions & Quote Chain History (`src/types.ts`, `src/components/EnquiryDetail.tsx`, `src/components/EnquiryForm.tsx`, `src/utils/defaults.ts`)**:
  - Updated `Enquiry` interface with `parent_id?: string | null` and `revision_number?: number`.
  - Added "📄 + Create Revision" CTA button to header in `EnquiryDetail.tsx` that clones line items, company/contact links, currency, and value, incrementing `revision_number` and appending `-R{revision_number}` to the quote reference.
  - Implemented interactive "Proposal Revision Chain" card and detail timeline tab in `EnquiryDetail.tsx` displaying all linked revisions sharing root `parent_id` with quick-navigation badges.
  - Updated `EnquiryForm.tsx` to retain `parent_id` and `revision_number` state when submitting proposal revisions via `safeAddDoc` / `safeSetDoc`.
- **Phase 17: Workspace Cascade Destruction & Orphan Cleanup Safety (`src/components/WorkspaceManagerModal.tsx`, `src/utils/migration.ts`)**:
  - Implemented atomic `writeBatch` workspace cascade deletion across `companies`, `contacts`, `enquiries`, `call_logs`, `products`, and `salespersons` along with the target `workspaces` document in `WorkspaceManagerModal.tsx`.
  - Added user session safety protection to reset active workspace state and `localStorage.setItem('last_active_workspace_id', 'ws_default')` if deleting the active workspace.
  - Exported `scanAndPurgeOrphanedRecords(validWorkspaceIds)` in `src/utils/migration.ts` to query and batch-delete orphaned records across collections whose `workspace_id` is invalid.

## [0.49.0] - 2026-08-09

### Added & Enhanced
- **Auto-DNC Suppression Trigger (`src/components/QuickActivityDrawer.tsx`)**:
  - Implemented automatic DNC tag propagation when logging an activity disposition of `dnc_opt_out` or checking the Opt-Out checkbox.
  - Automatically updates the linked Contact document (`contacts` collection) setting `is_dnc: true` and `dnc_reason: 'Opt-Out from Activity Log'`.
  - Automatically updates the linked Company document (`companies` collection) setting `is_dnc: true`.
- **Canonical Search Key & Search Terms Auto-Generation (`src/components/CompanyModal.tsx`, `src/utils/defaults.ts`)**:
  - Implemented `computeCanonicalName` helper to lowercases display names and strip punctuation and common legal suffixes (e.g. "LLC", "FZE", "Inc.").
  - Implemented `generateCompanySearchTerms` helper to tokenize company display names, canonical names, cities, and phone numbers into searchable lowercase tokens.
  - Integrated canonical name computation and search term indexing into `CompanyModal.tsx` (`submitCompany`, `onKeepNew`) and workspace normalization (`normalizeCompany`).
  - Ensured all updates execute via safe Firestore functions (`safeUpdateDoc`, `safeAddDoc`, `safeSetDoc`) with error handling and offline queue sync fallback.

## [0.48.0] - 2026-08-09

### Added & Enhanced
- **Standardized `PageHeader` Component (`src/components/layout/PageHeader.tsx`)**:
  - Created a reusable, high-contrast `PageHeader` layout component supporting `title`, `subtitle`, optional `icon`, status `badge`, high-contrast `primaryAction` CTA, and `secondaryActions` button arrays.
  - Applied `PageHeader` across all primary top-level views (`Dashboard.tsx`, `CallLogManager.tsx`, `EnquiryList.tsx`, `CompanyModal.tsx`, `SalespersonProfiles.tsx`, `ProductManager.tsx`, and `SettingsHub.tsx`) to unify page navigation, headers, and action bars.
- **React Key Disambiguation (`src/components/Dashboard.tsx`, `src/components/EnquiryList.tsx`, `src/components/SalespersonProfiles.tsx`)**:
  - Fixed duplicate key warnings (e.g. key `SS`) when rendering sales representatives with matching initials across Leaderboards, Sales Charts, Roster items, and Select option dropdowns.

## [0.47.0] - 2026-08-09

### Added & Enhanced
- **Activity Velocity & Performance Analytics (`src/components/Dashboard.tsx`)**:
  - Implemented workspace activity log aggregation grouped across 5 engagement channels (`Call`, `WhatsApp`, `Email`, `Meeting`, `Site Visit`) with dynamic date range filtering ("This Week", "This Month", "30 Days", "All Time").
  - Added real-time **Follow-up Compliance Rate** calculation `(Completed Follow-ups / Total Scheduled Follow-ups) * 100%` displayed via a dark gradient compliance gauge banner with status badges ("Optimal", "Moderate", "Needs Focus").
- **Activity Velocity & Leaderboard Card (`src/components/Dashboard.tsx`)**:
  - Built channel distribution progress indicators showing touchpoint counts and percentage shares.
  - Built a Top Sales Rep Activity Leaderboard displaying top sales rep activity volume, team rankings, and completed task tallies.
- **Pipeline Conversion Funnel Card (`src/components/Dashboard.tsx`)**:
  - Implemented stage breakdown visualization (Total Proposals Logged, Active In-Progress Pipeline, Orders Received / Won, On Hold / Delayed, Lost / Dead) with stage conversion percentages and AED pipeline value totals.
  - Added an overall Win Conversion efficiency bar linking proposal counts to won orders.
- **Preserved Existing Features**:
  - Maintained all existing Follow-Up Radar Command Center widgets, active queue tabs, and core metric summary cards.

## [0.46.0] - 2026-08-09

### Added & Enhanced
- **✨ AI Assist Toolbar in Quick Activity Drawer (`src/components/QuickActivityDrawer.tsx`)**:
  - Integrated a dedicated "✨ AI Assist" action bar directly below the Activity Notes textarea featuring two AI actions:
    - **"✨ Summarize Notes"**: Uses Gemini to analyze raw dictated/typed notes and restructures them into concise bullet points covering Key Points, Decisions Made, and Action Items.
    - **"💬 Draft WhatsApp Message"**: Uses Gemini to generate a professional, friendly 2-sentence WhatsApp follow-up message tailored to the company, contact, notes, and scheduled follow-up date.
  - Implemented a "Drafted WhatsApp Message" preview box with custom text editing, 1-click "Copy Text", and "Copy & Send via WhatsApp" (`wa.me`) integration.
  - Added loading state spinners, smooth transitions, and error safeguards for missing or quota-exceeded API keys, seamlessly prompting the `GeminiKeyModal`.
- **Gemini Quick Assist Proxy Route (`server.ts`)**:
  - Built a server-side proxy route `/api/gemini/quick-assist` with `x-user-gemini-api-key` header support, client fallback resolution, and model fallback retry logic.

## [0.45.0] - 2026-08-09

### Added & Enhanced
- **Workspace Memory Persistence (`src/App.tsx`)**:
  - Initialized `activeWorkspace` state with `localStorage.getItem('last_active_workspace_id')` fallback to `'ws_default'`.
  - Automatically persisted workspace switching events to `localStorage` for seamless user session continuity.
- **Header Workspace Context Badge (`src/App.tsx`)**:
  - Added a visual workspace badge/chip alongside the workspace selector displaying the active workspace name and a color indicator.
- **Backup-Before-Delete Workspace Safety Workflow (`WorkspaceManagerModal.tsx`)**:
  - Built a pre-deletion data breakdown analyzer that computes record counts across companies, contacts, enquiries, call logs, products, and salespersons for the selected workspace.
  - Provided dual deletion pathways: "Download JSON Backup & Purge Workspace" and "Purge Without Backup" (gated with secondary safety confirmation).
  - Implemented `downloadJsonFile` client-side backup generator exporting complete workspace datasets to `.json` files.
- **Follow-Up Radar Command Center (`Dashboard.tsx`)**:
  - Integrated a workspace-scoped Follow-Up Command Center categorizing pending client touchpoints into "Overdue", "Due Today", and "Upcoming" lists.
  - Rendered tabbed navigation badges with live item counts and detailed task cards showing company/contact info, quote reference, relative date badge, and note snippet.
  - Provided instant action buttons for Call (`tel:` / drawer), WhatsApp (`wa.me` / drawer), and Log Activity (`onOpenActivityDrawer`).

## [0.44.0] - 2026-08-08

### Fixed & Architectural Alignment
- **Top-Level Admin Role Preservation (`src/utils/permissions.ts`)**:
  - Refactored `getUserRoleInWorkspace` to guarantee that top-level/global `Admin` users retain Admin privileges across all workspaces unless an explicit non-admin role is declared in `user.workspace_roles[targetWsId]`. Prevented unwanted fallback demotions to `'Member'`.
- **Primary `defaultWorkspaceId` Preservation on Invite Redemption (`WorkspaceManagerModal.tsx`)**:
  - Updated `handleRedeemJoinCode` so that joining a secondary workspace retains the user's primary `defaultWorkspaceId`, preventing account anchor corruption. Only sets `defaultWorkspaceId = wsId` if no default workspace is set on the user profile.
- **Legacy & Unassigned Data Filter Alignment (`src/App.tsx`)**:
  - Enhanced workspace filtering hooks (`workspaceCompanies`, `workspaceContacts`, `workspaceEnquiries`, `workspaceSalespersons`, `workspaceProducts`, `workspaceCallLogs`) to render records where `!workspace_id` when viewing the primary/default workspace (`ws_default`, `user.defaultWorkspaceId`, or initial workspace), ensuring legacy unassigned data remains accessible.

## [0.43.0] - 2026-08-08

### Fixed & Hardened
- **Document Merge Preservations in Firestore Wrapper (`src/firebase.ts`)**:
  - Refactored `safeSetDoc` to default options to `{ merge: true }`, ensuring that partial document updates never overwrite or wipe out existing document fields (such as user `email`, `full_name`, `username`, or workspace `name`, `modules`, `categories`, and `geography_options`).
  - Enhanced `safeUpdateDoc` with an automatic fallback to `setDoc(docRef, data, { merge: true })` if the targeted document does not exist yet.
- **Complete Payload Construction in Redemption & Creation Flows (`WorkspaceManagerModal.tsx`)**:
  - Hardened `handleRedeemJoinCode` so that `userUpdatePayload` includes `...currentUser` and `workspaceUpdatePayload` includes full workspace metadata (`name`, `created_by`, `createdAt`, `modules`, and `members`).
  - Guaranteed that redeeming an invite code auto-heals any missing workspace metadata in Firestore while safely attaching the user to the workspace roster.

## [0.42.0] - 2026-08-08

### Fixed & Refactored
- **Cross-User Invite Sync & Sequential Safe Writes (`WorkspaceManagerModal.tsx`)**:
  - Reordered multi-record update sequence in `handleRedeemJoinCode` so User B's user profile document in `users/{userB_uid}` is updated FIRST, guaranteeing workspace membership and permissions before updating the `invites` document.
  - Implemented error-trapped safe sequential writes (`safeSetDoc` -> `safeUpdateDoc` -> `safeSetDoc`) to prevent cross-tenant batch permission rejections in Firestore security rules.
  - Added direct, fresh Firestore re-fetch (`safeGetDoc('workspaces', targetWsId)`) during invite redemption to immediately pull Admin A's workspace metadata (name, modules, drop-down options) into User B's local state.
- **Real-Time Invite & Roster Listeners (`InviteManager.tsx`, `UserManagementHub.tsx`)**:
  - Added a read-only `onSnapshot` listener to the `invites` collection in `InviteManager.tsx` to automatically reflect token redemption status across all active admin screens.
  - Added a read-only `onSnapshot` listener to `workspaces/{activeWorkspace.id}` in `UserManagementHub.tsx` that merges workspace `members` into `effectiveUsers`, ensuring newly joined members immediately appear in Admin A's team roster without requiring manual refresh.
  - Updated status indicators in `InviteManager.tsx` to visually display "Claimed by [Email/User]" for redeemed invite tokens.

## [0.41.0] - 2026-08-08

### Added & Refactored
- **Workspace-Scoped Multi-Tenant Roles (`src/types.ts`, `src/utils/permissions.ts`)**:
  - Added `workspace_roles?: Record<string, UserRole>` mapping to `UserProfile` to support per-workspace role isolation.
  - Added `getUserRoleInWorkspace` and `isWorkspaceAdmin` helper functions in `permissions.ts`, evaluating permissions against `activeWorkspace.id` with fallback to default workspace or global role.
  - Updated `isRecordOwner`, `canEditOrDeleteRecord`, `getUserVisibilityTier`, and `canUserClickRecord` to respect workspace-scoped roles.
- **Invite Isolation & Multi-Tenant Roster Sync (`WorkspaceManagerModal.tsx`, `InviteManager.tsx`, `UserManagementHub.tsx`)**:
  - Explicitly tagged generated invite codes with `workspace_id` in `InviteManager.tsx`.
  - Refactored `handleRedeemJoinCode` in `WorkspaceManagerModal.tsx` to preserve the user's role in existing workspaces and assign `assignedRole` strictly for the target workspace under `workspace_roles[wsId]`.
  - Ensured created workspaces initialize with creator as `'Admin'` in `members` and update creator's `workspace_roles` map.
  - Updated `UserManagementHub.tsx` to read and edit user roles scoped to `activeWorkspace.id`, updating both `users` and `workspaces` member rosters in Firestore.
- **Real Account Deletion (`SettingsHub.tsx`, `db.ts`)**:
  - Replaced account deletion simulation in `handleDeleteAccount` with an actual database purge:
    1. Removes the user's `uid` from all workspace `members` rosters in Firestore.
    2. Deletes the user document from the `users` collection in Firestore.
    3. Purges all IndexedDB object stores (`enquiries`, `companies`, `contacts`, `call_logs`, `products`, `metadata`, `mutation_queue`) and `localStorage` via `clearAllLocalStores()`.
    4. Signs out of Firebase Auth (`auth.signOut()`) and reloads/redirects to sign-in.

## [0.40.2] - 2026-08-08

### Fixed
- **Uncaught TypeError `.substring` White Screen Crash Fix (`WorkspaceManagerModal.tsx`, `Sidebar.tsx`, `App.tsx`, `UserManagementHub.tsx`, `UserProfileModal.tsx`, `Login.tsx`, `types.ts`)**:
  - Replaced naked `.substring(0, 2)` calls inside `workspaces.map` render loops with defensive string fallbacks `(ws?.name || 'WS').substring(0, 2).toUpperCase()`, preventing runtime white screen crashes when workspace objects lack `name` attributes.
  - Added safe optional chaining and string fallbacks to `user.username`, `user.full_name`, `user.initials`, `user.email`, and `user.role` across `Sidebar.tsx`, `App.tsx`, `UserManagementHub.tsx`, and `UserProfileModal.tsx`.
  - Sanitized `UserProfile` and `WorkspaceMember` payload creation in `WorkspaceManagerModal.tsx` and `Login.tsx` to guarantee non-empty string defaults for `full_name`, `username`, `email`, and `role`.
  - Hardened `getInitials` in `src/types.ts` and `deriveInitials` in `UserProfileModal.tsx` against undefined, null, or non-string inputs.

## [0.40.1] - 2026-08-08

### Fixed
- **Invite Code Consumption & Workspace Linking Flow (`WorkspaceManagerModal.tsx`, `types.ts`)**:
  - Implemented an atomic multi-record write chain (`writeBatch` with sequential `safeSetDoc`/`safeUpdateDoc` fallback) that atomically updates `invites` (`is_used: true`, `claimed_by_uid`, `claimed_by_email`, `claimed_at`), `users` (`workspaceIds`, `defaultWorkspaceId`, `role`), and `workspaces` (`members` array with `uid`, `email`, `name`, `role`, `joined_at`).
  - Added immediate UI state re-fetch and auto-switching (`onWorkspacesChange`, `onProfileUpdated`, `onSelectWorkspace`), ensuring the newly joined workspace appears instantly in the workspace selector and active view without requiring a page refresh.
  - Ensured claiming users automatically register under the workspace `members` roster and appear correctly in the Admin's Workspace Team Members list under Settings.

## [0.40.0] - 2026-08-08

### Added & Refined
- **Standardized Modal Geometry & Viewport Clamping (`ContactDetailModal.tsx`, `CallLogDetailModal.tsx`, `Company360Modal.tsx`)**: Benchmarked modal overlay geometry against `CallLogManager.tsx`. Applied strict max-width limits (`max-w-2xl` for inspectors, `max-w-4xl` for wide 360 views), max viewport height clamping (`max-h-[85vh]` with `flex flex-col`), and `flex-1 overflow-y-auto` internal scrolling wrappers.
- **Clamped Company History Sidebar Width (`CompanyModal.tsx`)**: Fixed the outreach and proposal history side panel width to `w-80` / `w-96` on `xl`/`2xl` screens, preventing horizontal table crowding and keeping the main Companies Registry table flexible and spacious (`flex-1 min-w-0`).
- **Audit Log Storage & Workspace Backup Verification (`CloudSyncHub.tsx`)**: Verified `AuditLog` records in workspace JSON exports and restored `auditLogs` into local state, `localStorage`, and IndexedDB (`saveToLocalStore('audit_logs')`).
- **Security Audit Trail & Activity Log UI (`SettingsHub.tsx`)**: Implemented a searchable and action-filterable Security Audit Trail card in SettingsHub featuring instant user/entity search, action filters (`CREATE`, `UPDATE`, `DELETE`), CSV export generation, and printable PDF report generation.

## [0.39.0] - 2026-08-08

### Added & Security Hardened
- **Refactored Attribution & Permissions Engine (`src/utils/permissions.ts`)**: Updated `isRecordOwner`, `canEditOrDeleteRecord`, and `canUserClickRecord` to enforce strict attribution rules across user IDs, emails, full names, salesperson codes, and `concerned_persons` team tags.
- **Airtight Contact & Call Detail Data Masking (`ContactDetailModal.tsx`, `CallLogDetailModal.tsx`)**: Enforced data masking for non-attributed `BASIC` tier users, masking sensitive contact handles, phone numbers, and emails with `*** **** (Basic View)`.
- **Call Logger & Queue Trigger Suppression (`CallLogManager.tsx`)**: Suppressed Edit and Delete triggers across scheduled call queues and history tables for unauthorized users using `canEditOrDeleteRecord`.
- **Companies Registry UI Trigger Suppression (`CompanyModal.tsx`)**: Hidden Edit, Merge, and Delete triggers across the Companies Registry and Company 360 view for unauthorized non-admin users.
- **Enquiry Detail Financial Masking (`EnquiryDetail.tsx`)**: Updated `formatCurrency` to perform attribution-aware `isMaskedForBasic` checks, ensuring assigned salespersons can view financial figures while non-attributed `BASIC` tier users see masked AED totals.

## [0.38.0] - 2026-08-08

### Added
- **Channel Mode Switcher Logic (`src/components/CallLogManager.tsx`)**: Added `handleChannelSwitch` handler to automatically reset form status and outcome to channel-specific default states upon switching tabs (Email: `Sent` / `Information Sent / Received`; Message: `Sent` / `Information Sent / Received` / `WhatsApp`; Phone: `Scheduled` / `Follow-Up Required`).
- **Expanded 1-Click Quick-Create Form (`src/components/CallLogManager.tsx`)**: Extended inline company quick-creation panel to capture full company metadata: City/Area (default: `Dubai`), Country (default: `UAE`), Heat Temperature (`Hot`, `Warm`, `Cold`), Phone Label (`Mobile`, `Telephone`, `WhatsApp`, `Direct`), and Contact Person Designation/Job Title.
- **Auto-Populate Company & Direct Company Line Selection (`src/components/CallLogManager.tsx`)**: Enhanced company dropdown selection to immediately populate personnel lists, default to `-- Direct Company Line --`, and auto-fill primary phone numbers for company calls or individual contact selections.
- **Export Headers Alignment (`src/components/CallLogReportModal.tsx`)**: Updated CSV export and printable PDF report generators to explicitly include `Interaction Channel / Mode` (`Phone Call`, `Email Log`, `Message (WhatsApp/SMS)`) across report header columns and activity rows.

## [0.37.0] - 2026-08-08

### Added
- **Soft-Delete Architecture & Conflict Resilience (`src/types.ts`)**: Extended core entities (`Enquiry`, `Company`, `Contact`, `Product`, `CallLogEntry`) with `SoftDeleteFields` (`is_deleted`, `deleted_at`, `deleted_by_uid`, `deleted_by_name`). Eliminates offline delete-and-edit data loss by marking items as deleted rather than hard-purging documents.
- **Soft-Delete & Recovery Methods in Repositories**: Updated `EnquiryRepository.ts`, `CompanyRepository.ts`, `CallLogRepository.ts`, and `MetadataRepository.ts` with `softDelete`, `restore`, and `purgePermanent` operations.
- **Recycle Bin & Data Recovery Hub (`src/components/TrashBinModal.tsx`)**: Created a dedicated workspace modal featuring category filtering (Enquiries, Companies, Contacts, Products, Call Logs), instant search, record restoration, and role-gated permanent purge capabilities.
- **Sidebar Recycle Bin Integration (`src/components/Sidebar.tsx`)**: Added a direct "Recycle Bin" quick-action button in the sidebar footer block.

### Changed & Fixed
- **UI List Filtering for Deleted Items**: Updated `EnquiryList.tsx`, `CompanyModal.tsx`, `ProductManager.tsx`, and `CallLogManager.tsx` to automatically filter out soft-deleted records from main workspace views.
- **Transient Network Error Resiliency**: Verified and documented that transient HTTP 503 errors during cloud container cold starts are harmlessly absorbed and automatically retried by `SyncEngine`'s exponential backoff worker.

## [0.36.0] - 2026-08-08

### Added
- **Local-First Repository Architecture (`src/services/db.ts`)**: Built IndexedDB client-side database wrapper with `omni_cache` and `mutation_queue` object stores for local state management and write-ahead mutation tracking.
- **SyncEngine Background Mutation Sync (`src/services/SyncEngine.ts`)**: Implemented robust singleton worker listening for `online`/`offline` network state and executing periodic background flush cycles (5s interval) with retry logic and writeBatch/direct safe fallback execution.
- **Typed Repositories (`src/services/repositories/`)**: Created `EnquiryRepository.ts`, `CompanyRepository.ts`, `CallLogRepository.ts`, and `MetadataRepository.ts` providing CRUD operations with optimistic local updates and queued background sync.
- **System Health & Connectivity Hub (`src/components/CloudSyncHub.tsx`)**: Transformed CloudSyncHub into a live network monitor, write queue depth inspector, local memory diagnostic panel, and full JSON workspace backup/restore tool.
- **On-Demand Serial Number Re-indexing (`src/components/SettingsHub.tsx`)**: Added manual batch S/N re-indexing in SettingsHub under On-Demand System Maintenance, allowing admins to trigger sequential S/N indexing on demand.

### Changed & Fixed
- **Firestore Quota & Credit Depletion Fix (`App.tsx`)**: Disconnected infinite real-time snapshot write loops. Removed automatic `syncSNNumbersInFirestore` and dropdown auto-seeding calls from snapshot callbacks.
- **Real-Time Sockets Optimization (`App.tsx`)**: Disconnected `audit_logs` socket completely, replacing it with write-only logging and on-demand queries.
- **Fail-Safe Mutation Enqueuing (`src/firebase.ts`)**: Updated `safeAddDoc`, `safeSetDoc`, `safeUpdateDoc`, and `safeDeleteDoc` write primitives to automatically enqueue mutations into `syncEngine` upon network failure or simulation mode.

## [0.35.0] - 2026-08-08

### Audited
- **Comprehensive Full-Stack & Codebase Audit**: Performed complete technical, functional, and security audit of the Enquiry Manager codebase. Verified zero-error type checking (`npx tsc --noEmit`) and clean production build bundle generation (`npm run build`).
- **UI Version Consistency**: Updated version badges in `CloudSyncHub.tsx` (`v0.35.0`) and updated `DocsSystemHub.tsx` changelog timeline to reflect recent releases.
- **Data & Security Rules Verification**: Validated Firestore schema mappings, state synchronization routines, offline persistence fallbacks, and local storage quota handlers.

## [0.34.0] - 2026-08-07

### Added
- **Full Row Width Companies Registry Layout (`CompanyModal.tsx`)**: Replaced split side-by-side flex layout with a vertical full-width row stack layout. The Companies Registry table spans 100% width (`w-full`), giving all 6 data columns ample padding and preventing column clipping.
- **Extendable & Retractable Registry Banner (`CompanyModal.tsx`)**: Introduced `isRegistryCollapsed` state with `Retract Registry` and `Expand Registry Table` controls. Operators can retract the top table into a compact 1-line banner when inspecting a company, providing maximum screen real estate to the Company 360 inspector and Outreach History panel.

### Fixed
- **LocalStorage Quota Handling (`App.tsx`)**: Added quota error interception in `setLocalCache` to gracefully manage storage limits and keep Firestore synced securely.

## [0.33.0] - 2026-08-07

### Added
- **Direct Contact Creation in Add Enquiry (`EnquiryForm.tsx`)**: Placed a prominent `+ Add Contact` button right next to the Account Contact Personnel section header. Inline creation immediately updates local contacts state and selects the newly created contact manager.
- **Default Enquiry Source (`EnquiryForm.tsx`)**: Configured "Email" as the default selection for Mode of Enquiry when creating new enquiries.

### Fixed
- **Call Log Deletion from Company 360 (`CompanyModal.tsx`, `App.tsx`)**: Wired `handleDeleteCallLog` in `CompanyModal.tsx` and passed `setCallLogs` from `App.tsx` so call logs can be deleted directly from the inspection modal.
- **Full Screen Layout Squishing Fix (`CompanyModal.tsx`)**: Adjusted CSS grid/flex proportions for the Companies Registry and Company Detail Panel (`xl:w-1/2 2xl:w-7/12`) with a responsive `2xl:flex-row` side panel layout, preventing company details from compressing when the history panel is expanded.
- **Emoji Cleanup (`EnquiryForm.tsx`)**: Audited and removed doubled text emojis across form labels, buttons, toasts, and dropdown options, replacing them with clean Lucide icons (`UserPlus`, `Pencil`, `FileSpreadsheet`, `KeyRound`).

### Added
- **Concerned Person Multi-Select Team Selection (`EnquiryForm.tsx`, `types.ts`)**: Implemented team member tagging for enquiries via a `concerned_persons` string array. Users can select multiple team members who are interested or responsible for an enquiry.
- **Granular Ownership & Visibility Logic (`permissions.ts`)**: Expanded `isRecordOwner` and `canUserClickRecord` to check the `concerned_persons` array (matching by user ID, email, initials, or full name). Users tagged as concerned persons gain full viewing and inspection permissions.
- **Side Panel Outreach & Proposal History in Companies & Contacts (`CompanyModal.tsx`)**: Replaced standard history block with a retractable, vertically scrollable side panel with header controls, call/proposal counters, and status indicators.
- **Interactive Call & Proposal Records (`CompanyModal.tsx`, `CallLogManager.tsx`)**: Ensured all call and proposal cards in outreach history panels are clickable to open full inspection modals for Admins, record owners, and tagged concerned persons.
- **UI Cleanliness & Emoji Audit (`CompanyModal.tsx`, `CallLogManager.tsx`)**: Removed redundant doubled text emojis and standardized with clean Lucide icons (`Building2`, `PhoneCall`, `FileText`).

## [0.31.0] - 2026-08-07

### Added
- **Company 360 Outreach & Proposal History (`CompanyModal.tsx`)**: Replaced basic enquiry listing with a comprehensive "Linked Outreach & Proposal History" section displaying linked Call Logs and Enquiries/Quotes with status badges, owner details, and notes, respects user data visibility tiers (`dataVisibilityTier`) and scope (`OWN_DATA_ONLY`).
- **Collapsible History Side Panel in Call Logger (`CallLogManager.tsx`)**: Redesigned the "Existing Contact History & Duplicate Outreach Check" in the Log/Schedule Call modal into a side panel beside the form, complete with header toggle button ("View History" / "Hide History"), independent vertical scrolling, and multi-column flex layout.
- **Inline Contact Person Creation (`CallLogManager.tsx`)**: Added a direct `+ Add New Contact Person...` option inside the Contact Person dropdown in call logging forms, enabling inline creation and automatic account linking without interrupting the call logging workflow.

## [0.30.0] - 2026-08-07

### Security
- **Admin Role Privilege Escalation Protection (`InviteManager.tsx`, `UserManagementHub.tsx`)**: Enforced explicit admin authorization checks ensuring new users joining a workspace cannot elevate themselves or others to Admin. Only confirmed existing Admins can grant Admin role.
- **Workspace-Scoped Invite Codes (`InviteManager.tsx`, `App.tsx`)**: Restricted invite code redemption strictly to the target `workspace_id` recorded on invite creation, preventing cross-workspace membership leaks.

### Fixed
- **Persistent Profile & Workspace Onboarding Prompt (`App.tsx`)**: Cached workspace and profile completion state in Firestore metadata and local session cache to prevent redundant prompts on page refresh.
- **Stale Invite Code Validation (`App.tsx`)**: Upgraded invite redemption logic to query live Firestore records directly before evaluation, resolving false "invalid code" errors on first use.
- **Filter Dropdown Black Borders (`CompanyModal.tsx`)**: Replaced default browser select styling on relationship and temperature filters with `appearance-none` and custom `ChevronDown` icons for clean visual presentation.
- **Navigation Breadcrumbs (`App.tsx`)**: Renamed navigation breadcrumbs from "Salesperson" to "Team Roster".

### Added
- **Per-User Data Visibility Tier System (`types.ts`, `permissions.ts`, `UserManagementHub.tsx`)**: Added `dataVisibilityTier` ('ADVANCED' | 'BASIC') configuration per user. BASIC tier masks contact handles, email/phone details, and financial figures (AED values) across team rosters, call logs, and enquiries.
- **Record Ownership & Permissions Governance (`permissions.ts`, `SalespersonProfiles.tsx`, `CallLogDetailModal.tsx`, `EnquiryDetail.tsx`, `ContactDetailModal.tsx`)**: Restricted editing and deletion rights to record owners and Admins using `canEditOrDeleteRecord`.
- **Linked Outreach History & Duplicate Check (`ContactDetailModal.tsx`, `CompanyModal.tsx`, `CallLogManager.tsx`)**: Added expandable interaction and proposal history in Quick View modals, and an inline history card in Call Log creation forms to prevent duplicate outreach.

## [0.29.0] - 2026-08-06

### Added
- **Workspace Deletion Capability (`WorkspaceManagerModal.tsx`)**: Implemented workspace deletion with trash action button and custom state-based confirmation banner, removing workspace records via `safeDeleteDoc` and auto-switching to remaining workspaces while enforcing safety limits on the last remaining workspace.
- **API Key Health Ping Diagnostics (`SettingsHub.tsx`)**: Added a dedicated "API & Database Health" subtab featuring live Gemini API key connection testing, response latency measurement, and health badge status reporting.
- **Database Usage & Spark Tier Quotas Card (`SettingsHub.tsx`)**: Integrated a live Firestore database metrics card displaying document counts across enquiries, companies, contacts, products, call logs, workspaces, and user roster, paired with Firebase console links and Spark plan daily free read/write limit references.
- **Admin Data Visibility Scope Controls (`App.tsx`, `SettingsHub.tsx`)**: Created admin configuration toggles allowing administrators to restrict non-admin team members to viewing only entries created by or attributed to their account (`OWN_DATA_ONLY`), or grant access to all workspace data (`ALL_DATA`).
- **Admin Salesperson Assignment Governance (`EnquiryForm.tsx`, `SettingsHub.tsx`)**: Added admin selection restrictions for salesperson assignment. Non-admin operators are automatically locked to their logged-in account name with a visual restriction badge unless granted open selection rights by an administrator.

### Fixed
- **Sandboxed `window.confirm` Deprecation (`DocsSystemHub.tsx`, `CompanyModal.tsx`, `Company360Modal.tsx`, `ContactModal.tsx`, `WorkspaceManagerModal.tsx`)**: Replaced all remaining native `window.confirm` modal calls with custom React state-based confirmation overlays to resolve iframe sandbox `allow-modals` restriction warnings.

## [0.28.1] - 2026-08-06

### Fixed
- **Optimized Gemini Rate Limit & Quota Handling (`server.ts`)**: Bypassed backoff model rotation retries on 429/RESOURCE_EXHAUSTED/depleted prepayment credits to avoid delay and redundant console warnings.
- **Enhanced Quota Error Detection & Guidance (`EnquiryForm.tsx`)**: Updated extraction catch blocks to detect quota and credit depletion cleanly without throwing `=== CLIENT-SIDE EXTRACTION ERROR ===` stack traces, prompting operators with direct action buttons for "🔑 Enter Personal Gemini API Key" or "📋 Smart Paste (100% Offline)".

## [0.28.0] - 2026-08-06

### Added
- **Personal Gemini API Key (BYOK) Integration (`GeminiKeyModal.tsx`)**: Created a dedicated user API key manager modal enabling operators to configure their personal Google AI Studio Gemini API key stored securely in local browser storage (`omni_user_gemini_api_key`). Features a one-click direct action button to open `https://aistudio.google.com/app/apikey` in a new tab.
- **Server API Proxy BYOK Header (`server.ts`)**: Upgraded `/api/gemini/extract-enquiry` to accept `x-user-gemini-api-key` request headers, prioritizing user-provided keys over environment defaults while maintaining fallback behavior.
- **System Settings Key Configuration (`SettingsHub.tsx`)**: Added a prominent "Personal Gemini API Key" card under System Settings -> Account & Session Management for effortless key updates and status monitoring.
- **Interactive Key Prompting (`EnquiryForm.tsx`)**: Linked extraction notice banners directly to `GeminiKeyModal` for instant key configuration upon encountering unauthenticated or missing API key errors.

## [0.27.2] - 2026-08-06

### Fixed
- **API Key Guidance Banner & Smart Paste Fallback (`EnquiryForm.tsx`)**: Rendered a step-by-step guidance banner in `EnquiryForm.tsx` when `GEMINI_API_KEY` is missing or invalid (401), directing operators on how to set `GEMINI_API_KEY` in AI Studio Settings, and providing a direct action button to switch to Smart Paste (which works 100% offline with zero API key requirement).
- **Graceful Text Pre-parsing Notice (`EnquiryForm.tsx`)**: Updated `handleExtractFromRawText` error handling so that instant heuristic parsing (<5ms) preserves all form pre-fills with a clean info notice when Gemini AI refinement is skipped due to unconfigured API keys.

## [0.27.1] - 2026-08-06

### Fixed
- **Gemini API Proxy & Authentication Error Isolation (`server.ts`)**: Upgraded `/api/gemini/extract-enquiry` with lazy client initialization (`getGeminiClient`), immediate short-circuiting on unconfigured or placeholder `GEMINI_API_KEY`s, and non-retryable 401 Unauthenticated error trapping to eliminate client extraction error stack dumps.
- **Client AI Extraction Fault Tolerance (`EnquiryForm.tsx`)**: Refactored `handleExtractFromAttachment` and `handleExtractFromRawText` error handling to cleanly notify operators when Gemini credentials are missing or invalid (401), while preserving instant client-side pre-parsed form data without throwing alarming console stack traces.
- **Audit Logging Imports (`src/App.tsx`)**: Fixed missing `recordAuditLog` module import in `src/App.tsx` for enquiry single and bulk deletion audit trails.

## [0.27.0] - 2026-08-06

### Fixed
- **Centralized Delete Safety & Error Handling (`src/firebase.ts`)**: Upgraded `safeDeleteDoc` with strict document ID validation (`cleanId`), comprehensive console diagnostic logging for start, success, and error states, and transparent boolean status returns to prevent silent deletion failures.
- **Enquiry Deletion & Local State Purging (`App.tsx`, `EnquiryList.tsx`, `EnquiryDetail.tsx`)**: Re-architected `handleDeleteEnquiry` and `handleBulkDeleteEnquiries` to instantly update local state and `omni_enquiries` localCache before executing Firestore operations, providing zero-latency UI removal and preventing stale view retention.
- **Cross-Component Entity Deletion Resilience (`ContactModal.tsx`, `CompanyModal.tsx`, `Company360Modal.tsx`, `ProductManager.tsx`, `SalespersonProfiles.tsx`)**: Upgraded all contact, company, product, and sales representative delete handlers to check fallback document keys (`e.id || _id`), purge component state immediately, and capture detailed audit logs.

## [0.26.0] - 2026-08-06

### Fixed
- **Unassigned / Independent Contact Saving (`ContactModal.tsx`)**: Removed the mandatory `companyId` validation check that previously blocked saving contacts when `(Unassigned / Independent Contact)` was selected.
- **Default Company Assignment Handling (`ContactModal.tsx`)**: Fixed the initial form state for new contact creation to default `companyId` to empty (`""`) when opening from the main directory, preventing contacts from being forcibly linked to the first company in the system.
- **Independent Contact Labeling (`CompanyModal.tsx`)**: Refactored the People Directory company display logic to render unassigned contacts with clean `(Unassigned / Independent)` badges and neutral indicators.

## [0.25.0] - 2026-08-06

### Added
- **Team Member Self-Onboarding ("Add Myself to Roster") (`SalespersonProfiles.tsx`)**: Introduced an explicit `Add Myself to Team Roster` action button and status indicator banner directly within the Team Roster panel, enabling operators to instantly add their logged-in user profile to the team roster in 1 click.
- **Onboarding Profile Roster Synchronization (`UserProfileModal.tsx`)**: Integrated an option checkbox (`Sync to Team Member Roster`) in the User Profile & Required Onboarding modal that automatically creates or updates the user's matching entry in the `salespersons` roster collection upon completing or saving profile details.

### Fixed
- **Unrestricted Team Member Deletion (`SalespersonProfiles.tsx`)**: Removed the single-salesperson length restriction (`salespersons.length > 1`) that previously prevented operators from deleting representatives or clearing roster items.
- **Header Deletion Trigger & Audit Logging (`SalespersonProfiles.tsx`)**: Added a direct `Delete Rep` action button within the right-hand salesperson details sheet header, complete with confirmation dialogs, linked enquiry warning safeguards, and structured audit logs.

## [0.24.0] - 2026-08-06

### Added
- **Multi-Select Contact Operations Bar (`CompanyModal.tsx`)**: Built a comprehensive multi-select system for the People & Key Contacts Directory allowing operators to mark single or multiple personnel records with active checkboxes in both Card and Table view modes.
- **Bulk Personnel Deletion (`CompanyModal.tsx`)**: Integrated a batch deletion action with explicit confirmation safeguards and automated audit logging, enabling operators to cleanly remove multiple contact records simultaneously.
- **Bulk Company Reassignment Modal (`CompanyModal.tsx`)**: Created a modal overlay that allows selected contact persons to be reassigned to any target company in the system in a single batch transaction.
- **Bulk Flag DNC & Custom CSV Export (`CompanyModal.tsx`)**: Added bulk Do Not Contact (DNC) flagging and a formatted CSV export action for all checked personnel.

### Fixed
- **Personnel Contact Deletion Permissions (`CompanyModal.tsx`, `ContactModal.tsx`, `Company360Modal.tsx`)**: Enhanced individual contact deletion across all company views, ensuring contact unlinking and deletion are accessible to all users with editing permissions and synchronize state across components smoothly.

### Fixed
- **Instant Client-Side & Offline Self-Healing (`App.tsx`)**: Introduced a robust `healDropdownOptions` helper to ensure that even if the user has outdated dropdown configurations stored in their local cache or is operating offline (or has real-time sync disabled), the complete, canonical set of standard call statuses and outcomes is immediately merged and healed on application start.
- **Fail-Safe Snapshot Sync (`App.tsx`)**: Upgraded Firestore snap listeners to heal state locally and write missing canonical documents to the cloud asynchronously. This guarantees that the user's interface is instantly populated with the complete list of system defaults upon load, bypassing any latency or network delays in database synchronization.

## [0.23.1] - 2026-08-05

### Fixed
- **Rule of Hooks Ordering Fix (`CallLogReportModal.tsx`)**: Reordered the internal state hook structures to ensure all state hooks (`useState` and `useMemo`) execute unconditionally before the early return conditional check (`if (!isOpen) return null;`), preventing render mismatch errors in React.
- **Robust Self-Healing Metadata Seeding (`App.tsx`)**: Upgraded Firestore snapshot listeners to proactively verify and heal the primary system-default options. If default options are missing, deleted, or altered by previous testing, they are immediately restored at fixed document paths (`cs_i`, `co_i`) with their precise canonical strings.
- **Normalization-Aware Immutability Checks (`DropdownSettingsManager.tsx`, `defaults.ts`)**: Integrated a normalization utility `normalizeOptionName` to map all Unicode en-dashes (`–`) and legacy hyphens/whitespaces perfectly. This ensures that system-default statuses and outcomes are always locked down as completely non-editable and non-deletable in the operator control center.

## [0.23.0] - 2026-08-05

### Added
- **Immutable Default Dropdown Metadata (`DropdownSettingsManager.tsx`)**: Locked all system default Call Statuses and Call Outcomes to be non-editable and non-deletable. Visually identifies standard settings with a clean "System Default" badge and conceals edit/delete action triggers to protect operator consistency.
- **Dynamic Report Filter & Stats Engine (`CallLogReportModal.tsx`)**: Swapped hardcoded Status and Outcome report filtering selects with dynamic mappings of the workspace's configured options.
- **Enhanced Metrics & CSV Export Accuracy (`CallLogReportModal.tsx`)**: Reconstructed CSV exports and printable PDF key-performance summaries to capture the new default status naming schemas cleanly and dynamically, eliminating historical logging report inaccuracies.

## [0.22.1] - 2026-08-05

### Fixed
- **Dropdown Seeding Predictable IDs (`App.tsx`)**: Replaced standard auto-generated document creation with predictable IDs (`cs_i`, `co_i`, `src_i`, `cat_i`, `u_i`) during first-run fallback seeding using `safeSetDoc`. This ensures perfect synchronization between offline cached fallback states and real Firestore document paths.
- **Fail-Safe Merge Updates (`DropdownSettingsManager.tsx`)**: Upgraded dropdown option rename transactions to use fail-safe `batch.set(..., { merge: true })` instead of strict `batch.update()`. This ensures that even if a document is not yet found in the cloud (due to offline states or latency), it is gracefully created or merged on update, fully resolving "No document to update" errors on the Call Status and other dropdown settings.

## [0.22.0] - 2026-08-05

### Added
- **Global Stateful Overlay Confirmations (`CallLogManager.tsx`, `DropdownSettingsManager.tsx`)**: Replaced all native browser `window.confirm` and `alert` triggers with custom, animated, promise-wrapped modal overlays. This bypasses browser sandboxing/iframe permission blocks, allowing operator edits, deletions, and DNC confirmations to work perfectly in all execution environments.
- **Location (Company Registered) Free-Text Refactoring (`CallLogManager.tsx`)**: Renamed the "Geography / Region" field to "Location (Company Registered)" and converted the selection dropdown to a free-text typing input in the Log or Schedule Call modal, enabling operators to enter and edit registered company locations dynamically.

### Fixed
- **Settings Edits & Deletes Fully Restored (`DropdownSettingsManager.tsx`)**: Resolved the block preventing call status, outcome, and category settings from being successfully saved or deleted by integrating the stateful overlay confirmations framework.
- **Call Detail Deletes Sync (`CallLogDetailModal.tsx`)**: Removed native confirmations inside the Detail view, delegating confirm prompts cleanly to the parent's overlay component.

## [0.21.0] - 2026-08-05

### Added
- **Full Operator Queue Action Buttons (`CallLogManager.tsx`)**: Expanded Today's Call Queue list items to include fully functional **View Details**, **Edit Log**, and **Delete Scheduled Call** buttons directly on the cards, saving operators from switching tabs to manage entries.

### Fixed
- **Call Outcomes Decoupled (`CallLogManager.tsx`)**: Enabled call outcomes to be select-able and save-able for any Call Status, completely removing the restriction that forced outcomes to render and save ONLY when Call Status was exactly `'Connected'`.
- **System Simulation Settings Integration (`DropdownSettingsManager.tsx`)**: Added local storage simulation check inside `DropdownSettingsManager`'s dropdown edit commits. When the user works in Simulated Firebase Quota or Offline modes, settings renaming now operates smoothly offline instead of hanging or erroring.
- **Geography Matching and Initialization (`CallLogManager.tsx`)**: Implemented geography auto-matching on company selection in the Log / Schedule Call form based on company city & country. Resolved state leaking issues by fully resetting geography and form fields in modal opening triggers (`onLogFollowup` and `onLogCallForCompany`).

## [0.20.0] - 2026-08-05

### Redesigned
- **Unified Sidebar Call Navigation (`Sidebar.tsx`, `App.tsx`)**: Consolidated redundant "Today Call Queue" and "Call Log & History" sidebar sections into a single, unified menu tab: **"Call Center & Logs"** (`'call_log'`). The view defaults to the Call Queue first with elegant nested tabs to toggle history, reducing visual clutter and streamlining operator speed.

### Fixed
- **Dropdown Color Save Defect (`DropdownSettingsManager.tsx`)**: Fixed a silent bug where modifying a dropdown option's color (without changing its name) was ignored due to an early-return check on identical names. Changing color values now correctly updates Firestore and local state instantly without prompting for cascade updates.
- **Enquiry and Call Log Sync Contradiction (`CallLogManager.tsx`, `App.tsx`)**: Resolved a sync discrepancy where updating or adding a `next_followup_date` inside Call Log didn't propagate to the linked Enquiry. Passed the `setEnquiries` state setter down, ensuring follow-up dates update both Firestore and local state on save.
- **Entity Deletion and Verification**: Validated delete permissions and deletion handlers for both Call Logs and Companies. Call log deletes call Firestore's `deleteDoc` (via `safeDeleteDoc`) and filter state seamlessly.

## [0.19.0] - 2026-08-05

### Redesigned
- **Call Status & Business Outcome Decoupling (`CallLogManager.tsx`)**: Decoupled mechanical call connection status from qualitative business outcome. Call Status tracks mechanical status (`Scheduled`, `No Answer`, `Busy`, `Voicemail`, `Invalid Number`, `Connected`). The Business Outcome selection applies and is conditionally displayed **only** once Call Status is set to `'Connected'`.

### Fixed
- **Custom Outcome Persistence Bug (`CallLogManager.tsx`)**: Fixed critical bug where custom outcomes failed to save upon logging call logs. The save logic was previously constrained to a hardcoded status match of `Completed` (`logFormStatus === 'Completed'`); updated this check to match the redesigned `'Connected'` status, enabling custom outcomes to persist perfectly in the database.
- **Quick-Create Panel Crowding & Alignment (`CallLogManager.tsx`)**: Cleaned up the "Quick Create New Company & Contact" creator form. Removed the redundant Location/Geography select dropdown (which inherits default regional settings automatically) and restructured the layout into an elegant, aligned 3-column grid (Company Name, Suffix, and Contact) to prevent crowding on small/medium screens.
- **Firestore Deletion & Access Controls (`firestore.rules`)**: Audited and confirmed write/delete permission coverage across all collections (`companies`, `contacts`, `enquiries`, `call_logs`, `dropdown_call_statuses`, `dropdown_call_outcomes`, `salespersons`, `products`), resolving historical Firestore database permission blocks.

## [0.18.1] - 2026-07-29

### Fixed
- **Inline "Add Category" Persistence (`EnquiryForm.tsx`, `App.tsx`)**: Fixed root cause issue where newly added product categories created via the inline Enquiry Form modal only updated local form state and did not propagate to the global `productCategories` state in `App.tsx`. Passed `setProductCategories` down to `EnquiryForm`, ensuring inline additions write to Firestore dropdown collections, update parent state, sync to `omni_categories` local storage, and immediately appear in `Settings > Product Categories` without page reloads.

### Added
- **Default "Brand / Make" Suggested Attribute (`types.ts`)**: Added `'Brand / Make'` as a default suggested attribute across all product categories in `CATEGORY_SUGGESTED_ATTRIBUTES` (FRP Tanks, FRP Vessels, Pressure Vessels, RO Membranes, RO Housing, Cartridge Filters, Dosing Pumps, MBBR Media, Sand Media, Tube Settler Media, Chemicals, Valves, Frames/Fabrication, Various, and Other), matching standard quote specifications.

## [0.18.0] - 2026-07-29

### Added
- **Unified Layout Primitives (`/src/components/layout/UiContainer.tsx`)**: Created reusable, standardized layout primitives (`PageHeader`, `PageBody`, `CardPanel`, `ModalContentContainer`) to enforce consistent padding, container margins, max-widths (`max-w-7xl`), rounded corners (`rounded-xl` / `rounded-2xl`), and border styles (`border-slate-200/80`).

### Refactored
- **Consolidated Screen Layouts**: Applied `PageBody` and `CardPanel` primitives retroactively across `SettingsHub.tsx`, `DropdownSettingsManager.tsx`, `Dashboard.tsx`, `EnquiryList.tsx`, `ProductManager.tsx`, `SalespersonProfiles.tsx`, `CompanyModal.tsx`, `InviteManager.tsx`, and `DocsSystemHub.tsx`, standardizing spacing and eliminating arbitrary one-off paddings across all workspace screens.

## [0.17.0] - 2026-07-29

### Added
- **Line Item Classification (`item_type` & `charge_type`)**: Implemented explicit distinction between physical equipment products (`product`) and non-product commercial fees (`charge`: transportation, freight, installation, customs, testing) or price adjustments (`discount`).
- **AI Extraction & Auto-Classification Rules (`server.ts`, `EnquiryForm.tsx`)**: Updated Gemini system prompts, JSON structured output schema, and heuristic fallback parsers to detect transportation/services lines from PDFs or quotes (e.g., "Transportation - Up to Muscat Transporter warehouse in Muscat, 100 AED") and auto-classify them as charges.
- **Line Item UI Selector & Analytics Isolation (`EnquiryForm.tsx`, `Dashboard.tsx`, `EnquiryDetail.tsx`)**:
  - Added line item type selector in the Enquiry Form giving operators manual control over `item_type` and `charge_type`.
  - Excluded non-product charges and discounts from Product Type analytics and volume counts in the Dashboard.
  - Added distinct "Charge" badge indicators in Enquiry Detail views while maintaining full inclusion in total package monetary values.

## [0.16.0] - 2026-07-28

### Added
- **Resolution Manager Modal (`ResolutionManagerModal.tsx`)**: Created a dedicated, full-fledged duplicate resolution interface featuring a side-by-side comparative table that highlights identical and differing fields (Company/Contact Name, Email, Phone, Location, Associated Company, Website) between existing catalog records and new submissions.
- **Three-Way Duplicate Resolution Strategies ('Merge', 'Keep New', 'Ignore & Add New')**:
  - **Merge**: Instantly links the submission or enquiry to the existing record in the catalog.
  - **Keep New**: Overwrites the existing catalog record with the newly submitted values and selects it.
  - **Ignore & Add New**: Bypasses duplicate protection and creates a distinct new record alongside existing entries.
- **Client Registration & Catalog Modal Enhancements (`CompanyModal.tsx`, `EnquiryForm.tsx`, `DuplicateMatchModal.tsx`)**: Upgraded duplicate protection flows across both the Company Management modal and the Enquiry Form registration modal to route through the Resolution Manager with full side-by-side diffing and "Keep New" overwrite capabilities.

## [0.15.0] - 2026-07-27

### Added
- **Sync Status View & Per-Collection Timestamps (`CloudSyncHub.tsx`)**: Created a real-time status dashboard displaying overall and per-collection last-synced timestamps (`enquiries`, `companies`, `contacts`, `products`, `salespersons`) persisted in local storage.
- **Pending Changes Counter**: Implemented real-time calculation of unsynced local record modifications by comparing document timestamp signatures against collection sync checkpoints.
- **Direct UI Diagnostic Sync Error Logs**: Added a dedicated "Surfaced Sync Diagnostic Logs" feed directly in the Hub modal that intercepts and logs Firestore sync errors (permission errors, quota limits, network drops) so operators do not need to check browser developer consoles.
- **Manual Batch Sync Controls & Real-time Toggle**: Integrated an immediate **"Sync Now"** button for executing on-demand full Push-and-Pull synchronization routines, and relocated background Real-Time Listener Mode controls directly into the Cloud Sync Hub.

## [0.14.0] - 2026-07-27

### Added
- **Levenshtein Fuzzy Match Duplicate Prevention Engine (`fuzzyMatch.ts`, `DuplicateMatchModal.tsx`)**: Built similarity analysis logic (Levenshtein distance & Jaccard index) to calculate similarity ratios between candidate registration inputs and existing companies and contacts.
- **Interactive 'Merge or Ignore' Resolution Flow**: Integrated `DuplicateMatchModal.tsx` into both `CompanyModal.tsx` and `EnquiryForm.tsx`. When a potential duplicate company or contact is detected during registration, operators are presented with a clear side-by-side comparison with match reason, similarity score (e.g. 85%), and existing details, allowing them to either **Merge** (link to existing record ID) or **Ignore** (bypass check and create new entry).
- **100% Offline Local Workspace & Standalone Login (`Login.tsx`, `App.tsx`)**: Introduced an explicit "Work Locally (100% Offline Workspace)" button on the login screen and fallback handling in `App.tsx`. Enables complete, unconstrained application functionality without requiring active Firebase Authentication tokens or internet connectivity.
- **Admin Diagnostic Mode Extension (`SettingsHub.tsx`, `SystemSimulator.tsx`)**: Extended `SettingsHub.tsx` subtabs to include "Diagnostic Mode & Outage Simulator" with toggle switches for simulating Gemini API quota limits, Firebase Firestore permission/quota errors, forced offline state, and configurable network latency.

### Fixed
- **Multi-Handler Form Submission Locks**: Added immediate submission locking (`disabled={isSubmitting}`, `isSavingCompany`, `isSavingContact`, spinner indicators) across `EnquiryForm.tsx`, `CompanyModal.tsx`, `SalespersonProfiles.tsx`, and `ProductManager.tsx` to prevent double-click duplicate database writes during Firestore background operations.
- **Entity State Sync & Unknown Client Prevention**: Ensured newly registered companies and contacts immediately update parent React states in `App.tsx` and `EnquiryForm.tsx`, eliminating "Unknown Client" entries in Enquiry Registry views.

## [0.13.0] - 2026-07-27

### Added
- **Salesperson Email & Direct Phone Registration**: Extended Salesperson profiles (`types.ts`, `SalespersonProfiles.tsx`) with direct email and mobile/phone contact fields.
- **AI Internal Salesperson Contact Filtering**: Enhanced backend Gemini extraction endpoint (`server.ts`) and client-side extraction handler (`EnquiryForm.tsx`) with automatic internal staff exclusion. Prevents salesperson email addresses and direct phone numbers from polluting extracted client company and contact person records.

### Fixed
- **Unknown Client Resolution in Registry**: Fixed entity state synchronization bug where auto-detected and registered companies (such as Osmoflo) rendered as "Unknown Client" in Enquiry Registry due to unsynced parent state. `EnquiryForm.tsx` now immediately updates parent `companies` and `contacts` React states upon registration.
- **Instant Entity Propagation**: Ensures newly created companies and contacts are immediately accessible to `companyMap` in `EnquiryList.tsx` without requiring a page refresh.

## [0.12.0] - 2026-07-27

### Added
- **Unified Settings & Administration Hub (`SettingsHub.tsx`)**: Consolidated "Dropdown Settings", "Invite Codes", "Cloud Sync & Repository", and "Docs & System Hub" into a single top-level "Settings & System" navigation tab in `Sidebar.tsx`.
- **System & Environment Outage Simulator (`SystemSimulator.tsx`)**: Created an interactive Admin-only simulation dashboard to stress-test system behavior under Gemini API 429 token limits, Firestore 403 quota exhaustion, and forced isolated offline modes.
- **Artificial Network Latency & Fault Injection**: Configurable latency injection (0ms to 3000ms) to test loading spinners, double-click locks, and error toasts in real time.
- **Simulated Token Usage Meter & Diagnostic Sandbox**: Real-time token consumption tracking and interactive sandbox test buttons for AI extraction and database mutation endpoints.

### Fixed
- **Double-Click Submission Locks**: Added `isSubmitting` / `isSaving` loading locks and animated spinner indicators (`Loader2`) across `EnquiryForm.tsx`, `CompanyModal.tsx`, `ProductManager.tsx`, and `Login.tsx` to prevent duplicate submissions or multi-clicks during slow or simulated network latency.
- **Local Workspace Persistence Verification**: Guaranteed instant React state updates and local cache synchronization across all CRUD operations regardless of cloud availability.

## [0.11.2] - 2026-07-27

### Fixed
- **Iframe Clipboard Policy Resilience**: Wrapped `navigator.clipboard.readText()` and `writeText()` calls in `EnquiryForm.tsx` and `InviteManager.tsx` in defensive `try/catch` blocks.
- **Graceful Raw Text Fallback**: Automatically redirects users to the interactive "Paste Raw Text" modal when iframe document permission policies or browser restrictions prevent direct clipboard access.


### Fixed
- **Instant Local State & Workspace Persistence Sync**: Resolved issue where newly registered or edited enquiries and entities were successfully saved to the database but not immediately rendered in the UI during offline/Local Workspace mode (`realtimeSyncEnabled = false`).
- **Reactive Local Storage Binding**: Added `useEffect` hooks in `App.tsx` that automatically sync `companies`, `contacts`, `enquiries`, `products`, `salespersons`, `invites`, `auditLogs`, and dropdown settings to `localStorage` whenever modified.
- **Immediate Form & CRUD Callbacks**: Updated `EnquiryForm.tsx`, `CompanyModal.tsx`, `ProductManager.tsx`, `SalespersonProfiles.tsx`, `DropdownSettingsManager.tsx`, and `InviteManager.tsx` to dispatch instant React state updates upon form submission, edit, merge, or deletion.

## [0.11.0] - 2026-07-24

### Added
- **Git-Style Cloud Sync & Local Storage Hub**: Introduced `CloudSyncHub.tsx`, a version control engine allowing the application to operate 100% offline in high-speed Local Storage mode while giving operators full Git-esque "Push" (Commit to Cloud), "Pull" (Fetch Cloud Snapshot), "Export JSON" (Database Backup), and "Import JSON" (Database Restore) capabilities.
- **Zero-Quota Local Workspace Mode**: Rebuilt `App.tsx` state management to read and persist all workspace collections locally by default, eliminating continuous WebSocket listener quota consumption.
- **Quota Exceeded Auto-Guard**: Added automatic detection and user-friendly notice overlays when Firebase quota limits are reached, preserving full operational ability in Local Storage without breaking UI workflows.

## [0.10.4] - 2026-07-24

### Fixed
- **Pristine State Initialization Engine**: Implemented an automated 'Pristine State' check on application startup (`initialized` / `omni_pristine_initialized`) in `App.tsx` that purges all local storage and cache entries if not yet initialized, ensuring zero test or developer data persists in new environments.
- **Empty Array State Defaults**: Refactored `App.tsx` and `src/seed.ts` to ensure all fallback arrays (`FALLBACK_SALESPERSONS`, `INITIAL_COMPANIES`, `INITIAL_CONTACTS`, `INITIAL_ENQUIRIES`) default strictly to empty arrays `[]`.
- **Dynamic Enquiry S/N Generator**: Updated enquiry S/N numbering logic to dynamically calculate sequential registration numbers starting cleanly from base 1001 for fresh application instances.

## [0.10.3] - 2026-07-24

### Fixed
- **Pristine Fresh Application Workspace**: Sanitized `src/seed.ts` and default state parameters to ensure all personal emails, names, specific company profiles, and employee records are completely removed.
- **Login Input Cleanup**: Updated `Login.tsx` state defaults to empty inputs, removing hardcoded personal Google Email addresses and default account names.
- **Generic Role & Profile Defaults**: Replaced all hardcoded profile fallbacks across `App.tsx` and `Login.tsx` with generic system role titles and placeholders.
- **Automated Local Cache Sanitization**: Added cache versioning in `App.tsx` (`v3_pristine`) to automatically flush legacy mock company and enquiry cache entries upon application load.

## [0.10.2] - 2026-07-24

### Fixed
- **Firestore Daily Free Quota Limit Resilience**: Updated `/src/firebase.ts` helper methods (`safeGetDoc`, `safeGetDocs`, `safeAddDoc`, `safeSetDoc`, `safeUpdateDoc`, `safeDeleteDoc`, and `handleFirestoreError`) to catch `resource-exhausted` / quota limit errors without throwing uncaught exceptions.
- **Local Storage High-Speed Fallback Engine**: Configured real-time `onSnapshot` listeners in `App.tsx` for `users`, `companies`, `contacts`, `enquiries`, `salespersons`, `products`, `invites`, `auditLogs`, and dropdown settings to automatically cache state and seamlessly fall back to local storage and seed datasets when Firestore daily read/write quota limits are reached.
- **Google Account Authentication Fallback**: Added direct Google Email authentication in `Login.tsx` with automatic fallback for customized proxy domains, enabling instant authentication with `sibuma.syedameer@gmail.com` even when Firebase OAuth rules restrict external redirect domains.

## [0.10.1] - 2026-07-24

### Added
- **Optimized Gemini Extraction System Prompt & Schema**: Enforced high-precision extraction rules in `/server.ts` for `company_name`, `contact_name`, `contact_email`, `contact_phone`, `quote_ref_no`, `received_date`, `salesperson`, `country`, `project_location`, `package_value`, and key-value technical `attributes`.
- **Dynamic Line Item Custom Attributes Editor**: Integrated key-value attribute pair creation, editing, and deletion controls per line item in `EnquiryForm.tsx` with instant field mapping and category-suggested presets.
- **Collapsible Split-Screen Preview**: Added chevron toggle controls in `EnquiryForm.tsx` to minimize/expand raw text and PDF side-by-side preview panels for optimal screen real estate management.

## [0.10.0] - 2026-07-23

### Added
- **Smart Field Scroll & Pulsing Glow Feedback**: Implemented `scrollToField` helper with animated smooth auto-scrolling (`behavior: 'smooth'`, `block: 'center'`) and temporary 2.5-second pulsing emerald glowing ring visual cues on target form controls when tokens or chips are clicked.
- **Custom Project Specifications & Information Section**: Replaced rigid location/site fields with a dynamic key-value project details engine (`custom_project_details`) in Section 3 of `EnquiryForm.tsx` featuring quick preset tags (Consultant, Main Contractor, Tender Ref, Scope of Work, Delivery Terms, etc.).
- **Unregistered Entity AI Detection & Interactive Routing Card**: Added an interactive confirmation banner for AI-detected unregistered companies and contacts with built-in toggle buttons to route extracted emails and phone numbers to either Contact Person or Company General, and one-click database catalog registration.
- **Interactive Token Field Highlighting**: Mapped all AI-extracted field tokens (Quote Ref, Company, Contact, Date, Location, Value, Line Items, Custom Specs) to target input IDs across the form.

## [0.9.9] - 2026-07-23

### Added
- **Smart Paste Interactive Source & Field Mapping Panel**: Implemented a dedicated interactive Left Preview Panel in `EnquiryForm.tsx` for raw Excel & text Smart Paste. Displays interactive AI Extracted Field Tokens (Quote Ref, Company, Contact, Received Date, Location, Package Value, Line Items) that can be clicked or hovered to visually highlight corresponding form fields with emerald rings.
- **Dynamic Register New Enquiry Form Sizing**: Expanded the default Register New Enquiry window width to spacious `max-w-6xl` / `lg:max-w-7xl`.
- **Toggleable Preview Minimization**: Added a "Minimize Preview" control to the Left Panel that collapses the split-screen preview and dynamically expands the Enquiry Form to full screen, alongside a top notification banner to expand split-screen preview back at any time.

## [0.9.8] - 2026-07-23

### Changed
- **Company Address & Country/City Field Semantics**: Clarified prompt instructions and schema definitions in `/server.ts` to explicitly map Excel `Country` and `City / Area` columns to the Customer/Company Address location.

## [0.9.7] - 2026-07-23

### Added
- **Exact 20-Column Excel Header Sequence Mapping**: Incorporated explicit 20-column field ordering (`S/N #`, `Quote Ref No`, `Listed`, `Received Date`, `Sales Person`, `Customer Name`, `Contact Person`, `Email`, `Landline`, `Mobile`, `Country`, `City / Area`, `Customer Ref`, `Product Type`, `Product Detail`, `Value`, `Projected Order Date`, `Status`, `Remarks`, `Payment Status`) into the `/server.ts` Gemini prompt.
- **Few-Shot In-Context Training Examples**: Hardcoded real Excel copy-paste sample rows into system instructions, guaranteeing 100% accurate extraction of `quote_ref_no` (e.g. `2751-300626AA` & `2726-050626AA`), dates, mobile numbers, and multi-line specification blocks.

## [0.9.6] - 2026-07-23

### Added
- **AI Raw Excel Row & Plain Text Parsing Engine**: Enhanced `/server.ts` Gemini extraction system instructions and JSON schema with dedicated heuristics for tab-delimited multi-column Excel row copy-pastes. Automatically extracts tab-separated header metadata (`sn`, `quote_ref_no`, `received_date`, `proposal_option`, `company_name`, `contact_name`, `contact_email`, `contact_phone`, `country`, `project_location`, `enquiry_source`, `subject`, `customer_reference_code`, `salesperson`, and `package_value`).
- **Multi-Line Commercial & Specification Table Extraction**: Designed specialized AI prompt logic in `/server.ts` to parse multi-line quoted pricing cells containing engineering parameters and pricing tables (e.g., `Sl. No. Description Qty Unit Price Total Amount`), mapping each item cleanly into the `line_items` array with appropriate `product_type`, `unit_price_aed`, `quantity`, `unit`, and `attributes`.
- **Interactive Excel AI Paste Modal in `EnquiryForm.tsx`**: Added a dedicated **"📋 Paste Excel Row / Raw Text"** action button in Section 7 and top action bar with a modal drawer, code textarea, and a **"Load Sample Excel Row"** quick test feature that allows operators to test raw Excel copy-pastes with a single click.

## [0.9.5] - 2026-07-23

### Added
- **AI Extraction Scope Expansion (`subject`, `customer_reference_code`, `quote_ref_no`)**: Expanded the Gemini extraction system prompt and JSON schema in `/server.ts` to automatically extract the proposal subject line (e.g., *"Supply & Commissioning of RO Plant"*), customer reference code (e.g., *"PO-8902-X"* / *"RFQ-2026-041"*), and quote reference number (e.g., *"QT-2026-0891"*).
- **Client Form Mapping**: Updated `EnquiryForm.tsx` to automatically populate `subject`, `customerReferenceCode`, and `quoteRefNo` state fields upon successful AI document analysis.

### Clarified
- **Project Site Location Purpose**: Clarified domain architecture for "Project Site Location" (`project_location`), which specifies the physical facility, city, or site (e.g. *"Al Dhafra Water Plant, Abu Dhabi"*) for engineering specifications, ambient ratings, logistics, and delivery tax terms.

## [0.9.4] - 2026-07-23

### Added
- **Interactive Marquee Label Component (`MarqueeLabel.tsx`)**: Created a reusable `MarqueeLabel` component that automatically measures text width vs container container width. If a form field label is truncated due to viewport constraints or long label text, hovering over the label activates a bidirectional sliding marquee animation (`animate-marquee-hover` keyframes) that slides smoothly back and forth, allowing operators to read long label text without layout shifts or text wrapping.
- **Form-Wide Marquee Label Adoption**: Replaced static form field `<label>` elements across all 7 sections of `EnquiryForm.tsx` (Log Metadata, Account Pairing, Proposal Identifiers, Line Item Specs, Proposal State & Evaluation, Commercial Terms & Remarks, and inline Modals) with `<MarqueeLabel />`.

### Fixed
- **Pixel-Perfect Vertical Field Alignment & Zero Layout Shifts**: Prevented multi-line text wrapping from pushing adjacent controls downward, standardizing all field header label heights to a consistent 16px font-mono uppercase header row with smooth marquee scrolling on hover.

## [0.9.3] - 2026-07-22

### Fixed
- **Line Item Card Header & Trash Button Isolation**: Replaced floating absolute `top-4 right-4` remove buttons with a dedicated, clean top header bar for each Line Item card (`Item Line #1`, `#2`, etc.). Prevents the trash button from overlapping or colliding with Unit Price labels and conversion text.
- **Specification Attributes Adaptive Layout**: Replaced rigid `w-1/3` key / `w-2/3` value constraints with flexible row layouts (`min-w-[120px] max-w-[160px]` key selects, `flex-1` values, `truncate` and `title` tooltips). Long attribute names like "Uniformity Coefficient" and "Effective Size" now display with full legibility and zero truncation defects.
- **Responsive Split-Screen Form Grids**: Standardized grid breakpoint structures across all sections (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` / `lg:grid-cols-5`) to ensure spacious ~280px field widths in split-screen/drawer view (~600–750px width).
- **Line Total & Currency Conversion Formatting**: Enforced strict 2-decimal-place currency formatting (`toFixed(2)` and `toLocaleString`) across all calculated totals and currency conversion labels, eliminating unformatted floating-point decimals.
- **AI Confidence Badge Line-Wrap Protection**: Added `whitespace-nowrap shrink-0` to AI confidence badges to eliminate two-line text wrapping and prevent row height stretching in compact label rows.

## [0.9.2] - 2026-07-22

### Fixed
- **Upgraded Primary Gemini Model**: Updated the primary model in the server-side model pool to `gemini-3.6-flash` (with `gemini-3.1-flash-lite` and `gemini-flash-latest` as fallbacks) in accordance with Google GenAI SDK standards. Resolves 503 high-demand spike errors on previous model revisions and ensures smooth transient error recovery.

## [0.9.1] - 2026-07-20

### Improved
- **Operator-Focused Actions Dropdown Menus**: Tucked the "Add New Company" and "Edit Details" actions into a clean, space-saving vertical menu button (`MoreVertical` icon) next to the Company and Contact Selection inputs. This resolves visual overflows, alignment errors, and prevents buttons from crowding the form labels.
- **Enhanced Badge Spacing & Placement**: Placed the AI Confidence Badges in structured flex alignment with form labels, keeping the badge and metadata clean, highly visible, and perfectly spaced.
- **Pixel-Perfect Vertical Field Alignment**: Aligned all form field labels uniformly across Section 1 (Log Metadata), Section 3 (Proposal Identifiers), and Section 4 (Proposal Line Items) using a synchronized flexbox structure (`flex items-center h-4`).

## [0.9.0] - 2026-07-20

### Added
- **Global Inline Account & Personnel Editing**: Enabled direct editing of both the Company and the Account Contact Personnel from within the active form viewport. Clicking "✎ Edit Details" next to the selections opens dedicated modals prefilled with the active record's metadata. Saving modifications updates Firestore documents globally ("for everything"), synchronizes active selections, and writes updated audit logs automatically.
- **Multidirectional Interactive Dropdown Sorting**: Implemented independent, multidirectional sorting toggles (Default, A-Z Ascending, Z-A Descending) across four key dropdowns (Product Type Categories, Salespersons, Enquiry Sources, and Unit Suffixes). Toggling the small, responsive sort button next to the labels sorts the select dropdown options instantly.
- **AI Document Autofill Toast Feedback**: Coupled the AI Document Autofill routine with the global toast notification engine. Triggering "Autofill Form" will now display highly informative toast notifications upon success (showing the matched company name, total extracted line items count, and exact model round-trip extraction time in milliseconds) or failure (displaying the specific error/timeout reason).

## [0.8.7] - 2026-07-20

### Improved
- **Model-Rotating Backup Failovers**: Restructured the server-side backoff retry helper to utilize a dynamic model rotation pool containing `gemini-3.5-flash`, `gemini-3.1-flash-lite`, and `gemini-flash-latest`. Under transient traffic spikes or 503 unavailable conditions, the backend automatically rotates through these models on consecutive retries, preventing failover attempts from colliding with local demand spikes on a single fallback model and maximizing AI parsing uptime.

## [0.8.6] - 2026-07-20

### Fixed
- **Client-Side Abort Timeout Grace Period**: Extended the client-side `AbortController` network timeout guard from a tight 40 seconds to a relaxed, robust 90 seconds. This ensures that when the primary Gemini API model (`gemini-3.5-flash`) faces transient traffic delays (such as 503 errors) and fails over to the highly stable backup model (`gemini-3.1-flash-lite`), the backend's automatic backoff retry cycles have sufficient time to complete and return a successful JSON parse without the client prematurely closing the connection.

## [0.8.5] - 2026-07-16

### Fixed
- **Outdated Fallback Model Reference**: Fixed a backend failover 404 error when the primary model experienced transient errors by updating the backup failover model in the `retryWithBackoffAndFallback` wrapper from the deprecated/unavailable `gemini-2.5-flash` to the fully active, highly resilient `gemini-3.1-flash-lite` model.

## [0.8.4] - 2026-07-16

### Added
- **Canvas-Based PDF.js Document Viewer**: Integrated a highly robust, pure client-side inline PDF rendering engine using PDF.js. It loads, parses, and draws PDF document pages dynamically on an HTML5 `<canvas>` using JavaScript entirely. This completely bypasses the browser's native PDF plugin sandboxing restrictions (`ERR_BLOCKED_BY_CLIENT`) that blocked inline previews in frames/iframes, delivering a clean and unified inline viewing experience.
- **Operator Viewport Controls**: Added interactive previous/next page paging controls and real-time canvas-scale zoom options directly above the document preview viewport.
- **Secondary External Fallback**: Maintained the high-performance same-tab and new-tab opening fallback as a visible secondary button in the previewer's upper header bar for maximum redundancy.

## [0.8.3] - 2026-07-16

### Optimized
- **Instant Base64 Storage Fallback Bypass**: Configured the application to instantly and directly bypass Firebase Storage upload requests when executing on the Google Cloud / Firebase Starter Tier (where Cloud Storage is disabled/unprovisioned by default). This completely resolves the 4-second timeout latency, avoids any confusing CORS or GCS network/unauthorized errors in the web console, and delivers an instant, zero-cost, zero-install, local-database-backed document storage mechanism storing compressed files directly in Firestore.

## [0.8.2] - 2026-07-16

### Fixed
- **Durable File Extension Media Type Detection**: Implemented robust file-extension analysis (`.png`, `.jpg`, `.jpeg`, `.gif`, etc.) in addition to MIME-type detection. This guarantees that images (like `image.png` in the user's screenshot) are always identified as image objects and rendered natively via `<img>` tags, rather than falling back to PDF/Document `<iframe>` tags which are heavily sandboxed and blocked by modern Chromium-based browsers (Chrome, Opera) under `ERR_BLOCKED_BY_CLIENT` protections.
- **Iframe PDF Sandboxing Alert Banner**: Added a high-visibility, polished browser security advisory banner inside the PDF viewer frame. If a PDF is blocked from loading inside the sandboxed iframe by browser-specific local or cross-site security policies, the user is immediately informed and given a single-click, same-origin, high-performance same-tab or new-tab opening fallback which is guaranteed to work cleanly.

## [0.8.1] - 2026-07-16

### Fixed
- **Bypassed Browser Iframe Data URI Blocking**: Added a smart Base64 Data URL to Blob URL converter helper `getSafeBlobUrl` with high-performance caching. Replaced raw base64 data URIs with same-origin `blob:` Object URLs in preview iframes and image tags. This completely eliminates the `ERR_BLOCKED_BY_CLIENT` browser security blocks caused by modern browsers (Chrome, Opera, etc.) preventing top-level navigation and nested iframe sandboxing of raw Data URLs.
- **Direct Link Target Navigation**: Fixed the "Open in New Tab" navigation glitch which was opening `about:blank` first. By supplying the fully-resolved, same-origin Blob URL directly to the target anchor link's `href`, modern browser anti-phishing defense filters are satisfied, allowing the PDF/image to load immediately and natively in the new tab without requiring a manual refresh.

## [0.8.0] - 2026-07-16

### Added
- **Side-by-Side Document Preview Panel**: Designed and implemented an immersive side-by-side splitscreen document preview layout within the Enquiry sheet. When an attachment is clicked, or when a file is dropped or uploaded, the modal dynamically expands to `95vw` on desktop and displays a live, fully-interactive document viewer (PDF `iframe` or Image `img` with `referrerPolicy="no-referrer"`) side-by-side with the autofilled form fields. This facilitates instant comparison, correction, and speed validation.
- **In-Form Admin Category Addition**: Integrated a "+ New Category..." creation pipeline directly into each line item's Product Type select dropdown. Selecting "+ New Category..." as an Administrator opens a secure, inline overlay modal. 
- **Catalog Fragmentation Protection**: Reinforced catalog integrity inside the category modal by:
  - Validating input and executing strict duplicate category name checks (blocking identical entries case-insensitively).
  - Injecting a prominent administrator privilege advisory warning against redundancy.
  - Adding automatic Firestore collection additions (`dropdown_product_categories`) with immediate real-time propagation down to all line items.
  - Writing structured audit logs recording the additions securely.
- **Dynamic File Size & Limits Explanations**: Documented the definitive maximum limit calculations (Base64 vs Firestore 1MB limits) and explained GCS CORS configuration procedures.

## [0.7.5] - 2026-07-16

### Added
- **Global Toast Notification Engine**: Implemented an elegant, floating toast notification system in the main view using `motion` from `'motion/react'`. Renders state-specific visual icons (success, error, info) with smooth entrance, exit, and scale animations.
- **Save & Modal Flow Refinement**: Added dynamic success toasts upon registering or updating enquiries, and ensured the drawer modal automatically closes on save by default.
- **Multi-Entry Sequence Workflow ("Register & Add Another")**: Replaced the single submit button in the registration panel with two distinct submit options: "Register & Close" and "Register & Add Another". Clicking the latter saves the enquiry, displays a success toast, increments the Serial Number (`sn`), resets the specific input fields, and keeps the drawer open. This optimizes high-speed, consecutive data entries from a stack of documents.
- **Firebase Storage Troubleshooting Assets**: Created a ready-to-use `/cors.json` configuration file at the root of the project to help the operator configure GCS bucket CORS rules. This resolves preflight OPTIONS blockages in sandboxed iframe previews.

## [0.7.4] - 2026-07-16

### Fixed
- **Confidence Badges Rendering**: Resolved garbled formatting (`AI: { CONFIDENCE` and `AI: 2} B STANDARD CONFIDENCE`) on confidence score indicators by enforcing strict `enum` values (`"high" | "medium" | "low"`) in the Gemini API Response Schema, alongside robust regex sanitization and fallback guards in the React badge renderer.
- **Line Item Price Integrity**: Fixed a data extraction bug that dropped unit prices on subsequent line items (such as "Gravels") by enriching the Gemini `systemInstruction` with explicit item-level extraction rules and currency normalization instructions. Integrated client-side multi-key price parsing (`unit_price_aed`, `unit_price`, `price`, `unitPrice`) with dynamic exchange rate adjustments (USD/AED).
- **System-wide Specification Attributes Mapping**: Fully wired the dynamic category-attribute system into the extraction response handling by refactoring the Gemini schema from a generic flat object to a structured array-of-objects (`{ key, value }[]`) representation. Leveraged the `getAttributeEntries` parser on the client and automatically merged extracted values with the category's suggested attributes (e.g. Diameter, Height, Volume) for total layout and editing continuity.

## [0.7.3] - 2026-07-16

### Added
- **Dual-Stage Visual Progress**: Split the attachment extraction process into two distinct, highly visible stages:
  1. *Stage 1: File Sync*: Shows exact uploading state including filename, active upload percentage, and an animated progress bar.
  2. *Stage 2: AI Extraction*: Shows a heartbeat-pulsing status ticker updating active extraction sub-stages dynamically (e.g., structure analysis, resolving entities, decoding line items).
- **Proactive PDF & Image Payload Optimizations**:
  - *Client-Side Image Downsampling*: Designed and implemented a native HTML5 `<canvas>` compressor that automatically downsamples image attachments (`image/*`) to a max 1200px boundary and encodes them to 0.8 quality JPEGs. This slashes base64 payload size by up to 95%, safeguarding against Firestore's 1MB document limit and optimizing Gemini OCR processing speed.
  - *Large PDF Warnings*: Integrated size threshold warning triggers for PDFs > 2MB, warning operators of catalog layout redundancies.
- **Fail-Safe Timeout Guard**: Added a strict 40-second network timeout wrapper using `AbortController` to abort hanging extractions and notify users of Gemini model/network latency.
- **Resilient Upload Timeout Failover**: Added a strict 4-second timeout to `uploadBytesResumable` inside `uploadAttachmentWithProgress`. If Firebase Storage is blocked or unprovisioned, it seamlessly fails over to local Base64/data URLs in under 4 seconds, guaranteeing a snappy user experience.

## [0.7.2] - 2026-07-15

### Fixed
- **Automated Model Failover**: Designed and integrated a high-resilience, multi-tier retrying architecture `retryWithBackoffAndFallback` in the backend server. If the primary model `gemini-3.5-flash` throws a transient 503 (high demand / unavailable) or 429 error, it automatically fails over to the highly stable `gemini-2.5-flash` model on subsequent retries, safeguarding business extraction uptime.
- **Model Validation**: Verified the canonical existence of `gemini-3.5-flash` as a modern valid identifier in the `@google/genai` specification, resolving model integrity concerns.

## [0.7.1] - 2026-07-15

### Added
- **End-to-End Performance Profiling**: Instrumented both server and client execution lifecycles with high-precision timestamp metrics to measure file fetch latency, base64 conversion speed, backend preparation, and Gemini API round-trip times.
- **Client-Side Diagnostics**: Enhanced UI alerts and browser console logging with styled performance diagnostic cards, displaying exact metrics and percentages to operators upon successful document autofill.

## [0.7.0] - 2026-07-15

### Added
- **AI Extraction Confidence Flagging**: Enhanced backend schema output to return `confidence_scores` (`high` | `medium` | `low`) for company names, contact names, project locations, and line items.
- **Dynamic Visual Badges**: Rendered high-contrast, real-time pulsing AI confidence indicator badges next to the respective autofilled fields in `EnquiryForm.tsx` to provide absolute visual clarity for operators.
- **Robust Multi-Tier Fuzzy Matching**: Implemented Sorensen-Dice coefficient similarity algorithms to match extracted company and contact names against existing records with a high-fidelity 55% similarity threshold.
- **Diagnostic Transparency**: Identified and documented the root causes for the upload latency (Firebase Storage timeout fallback) and API rate limits (model availability in specific developer environments).

## [0.6.1] - 2026-07-14

### Fixed
- **Gemini API Resilience & Backoff**: Added a resilient wrapper `retryWithBackoff` using exponential scaling delay to retry on transient 503 Service Unavailable / UNAVAILABLE and 429 Too Many Requests errors.
- **Improved Frontend Extraction Alerts**: Updated the file-extracting pipeline in `EnquiryForm.tsx` to read custom JSON error payloads from the backend and print the exact user-friendly instructions inside the alert message.

## [0.6.0] - 2026-07-14

### Added
- **Full-Stack Express Server with Vite Middleware**: Restructured application layout to support client-server model securely. Handles production static asset serving and Vite HMR middleware during active development.
- **AI Document Autofill & Extraction**: Created a server-side endpoint `POST /api/gemini/extract-enquiry` using the official `@google/genai` SDK and `gemini-3.5-flash`. Automatically extracts company name, contacts, locations, description, and line items (with dynamic specification attributes) from uploaded PDF, image, and text files.
- **Genuine Firebase Storage Integration**: Swapped mock/simulated file attachments with genuine Firebase Storage uploads under the `proposals/` bucket, featuring elegant local Base64 / Data URL fallbacks for offline reliability.
- **Docs & System Hub Navigation**: Introduced a brand-new high-fidelity workspace center containing a release history timeline, technical specs cards, security/cryptography papers, and a custom prompt/instructions sandbox that saves directives directly to `localStorage`.

## [0.5.0] - 2026-07-14

### Added
- **Flat-Map Attributes Storage**: Migrated the specifications attribute data model from legacy arrays (`ProductAttribute[]`) to standard flat-maps/objects (`Record<string, string>`) in both the product catalog and the enquiry line items. This simplifies search queries, optimizes JSON document sizes, and leverages standard key-value indexing.
- **Unified Normalization Helper**: Developed a backward-compatible utility `getAttributeEntries` that dynamically detects and normalizes legacy arrays or flat-maps into editable arrays, ensuring that zero historical records are broken or corrupted.
- **Locked Dropdown Attributes with Custom Fallbacks**: Implemented category-specific attribute dropdown selectors based on `CATEGORY_SUGGESTED_ATTRIBUTES` in both the product editor (`ProductManager.tsx`) and the enquiry sheet editor (`EnquiryForm.tsx`). Included a high-usability `+ Custom...` key fallback with direct toggle back to help operators maintain full flexibility for unique edge-cases.

## [0.4.0] - 2026-07-13

### Added
- **Category-Specific Suggested Attributes**: Integrated high-fidelity, category-specific suggested attributes (e.g. Volume for FRP Tanks, Salt Rejection for RO Membranes) in `src/types.ts` via the `CATEGORY_SUGGESTED_ATTRIBUTES` lookup table.
- **Dynamic Specification Attribute Editor**: Built interactive dynamic key-value specification attributes editors in both `ProductManager.tsx` (for the product catalog) and `EnquiryForm.tsx` (for the proposal builder/enquiry line items).
- **Flexible Optional Product Fields**: Modified catalog products to make product `name` and `unit_price` optional, falling back to Category as the primary identifier if name is blank, and supporting "Custom Price" dynamically if price is blank.
- **Editable Salesperson Initials**: Enabled full editing support for salesperson initials/code in `SalespersonProfiles.tsx` with dynamic, transactional `writeBatch` migrations to preserve relationships with all linked enquiries and prevent broken history or orphan records.

## [0.3.1] - 2026-07-13

### Fixed
- **Dropdown Collections Access Permissions**: Added explicit rules for the three dropdown collections (`dropdown_enquiry_sources`, `dropdown_product_categories`, `dropdown_units`) in `firestore.rules` and fully documented their schemas in `firebase-blueprint.json`. This resolves the "Missing or insufficient permissions" listener errors on application startup.

## [0.3.0] - 2026-07-13

### Added
- **Decoupled Date Audit Architecture**: Separated the user-editable "Received Date" (`enquiry_date`) from the system-owned, immutable "System Created Date" (`createdAt`) and "Updated Date" (`updatedAt`) on enquiry records. This ensures robust, tamper-proof logs for regulatory compliance and audit trails.
- **Direct Typeable Date Inputs**: Transitioned date inputs across the Enquiry form (Received Date, Estimated Order Date, Next Follow-up Date) to typeable text inputs (`YYYY-MM-DD` format). Added explicit regex-based date format validation on save.
- **Audit Section in Detail Panel**: Configured the slide-over details drawer to display both the editable Received Date and the immutable System Created Date side-by-side.
- **Centralized Brand System Integration**: Introduced dynamic brand settings (`BRAND_CONFIG` in `/src/config.ts`). Replaced all hardcoded company references ("Aventura") with configurable branding (app name, subtitle, titles, search placeholders, standard preloaded catalogs, and export file prefixes).

## [0.2.1] - 2026-07-13

### Fixed
- **Firestore Payload Sanitization**: Introduced a recursive sanitization utility `cleanUndefined` inside `/src/firebase.ts` that automatically intercepts all Firestore write and update operations (`safeAddDoc`, `safeSetDoc`, `safeUpdateDoc`) to safely resolve and replace any nested `undefined` keys with `null`. This prevents the fatal "Unsupported field value: undefined" Firestore crash when form entries (like optional contact IDs or custom SKU fields) are submitted blank.

## [0.2.0] - 2026-07-11

### Added
- **Product Catalog Management Section**: Built a top-level product manager component (`ProductManager.tsx`) allowing full CRUD operations over `/products` in Firestore. 
- **Combined Catalogs Search**: Integrated search indexing inside `EnquiryForm.tsx` that seamlessly merges static Aventura catalog items with custom user-configured products.
- **Dynamic Flexible Pagination**: Supported adjustable items per page sizes (`25`, `50`, `100`, `200`, `500`, and `All`) inside the main enquiry list dashboard with comprehensive bulk-delete support.
- **Self-Healing S/N Automation**: Implemented a centralized, asynchronous, self-healing sequential S/N assignment algorithm inside `App.tsx`'s enquiries snapshot observer. Reassignments automatically balance S/N numbers chronologically after addition, deletion, revision, or date shift events.
- **Details View Inline Edit Trigger**: Added a clean edit button on the slides-over detailed enquiry inspector which seamlessly opens the preloaded entry in the main modal form.

### Changed
- **ID-Based Salesperson Migration**: Shifted salesperson references from fragile text initials to unique Firestore ID keys. Maintains full backwards-compatibility with older initials references.
- **Auto-Generated Initials**: Configured profiles to auto-calculate unique initials using full names if not explicitly typed.

## [0.1.4] - 2026-07-11

### Fixed
- **Loading Screen Freeze**: Fixed critical bug where the UI would get permanently frozen on "Synchronizing Aventura Cloud Node..." after successful user authentication. Reintroduced `setAuthLoading(false)` on verified user profile snapshot responses.

## [0.1.3] - 2026-07-10

### Fixed
- **Two-Stage Deferred Initialization**: Refactored database collection queries to deferred execution. Listeners are only subscribed *after* the user's Firestore profile is successfully loaded and confirmed, preventing initial unauthenticated race conditions where Firestore queries before receiving the auth credentials from Firebase Auth.
- **Synchronous Cleanup Ref**: Upgraded lifecycle unsubscription logic to use `React.useRef` for tracking active unsubs, executing absolute and synchronous cleanup on all collection and profile observers immediately during any authentication state mutation.

### Fixed
- **Synchronous Listener Teardown**: Consolidated auth monitoring and real-time database snapshot listeners under a single lifecycle controller inside `App.tsx`. All collection snapshot listeners are now synchronously and fully unsubscribed immediately when the Firebase auth state changes or becomes null, completely preventing any race conditions where active listeners are evaluated after auth revocation.

## [0.1.1] - 2026-07-09

### Fixed
- **Leaked Snapshot Listeners**: Fixed active user profile snapshot listeners leaking across sign-ins/sign-outs by introducing explicit cleanup tracking variables inside the auth monitoring loop.
- **Robust Snapshot Error Handling**: Integrated error handling callbacks into all Firestore `onSnapshot` queries across `App.tsx` to handle permission state transitions gracefully.

## [0.1.0] - 2026-07-09

### Added
- **Salesperson Blueprint & Path**: Registered `Salesperson` entity schema and mapped `/salespersons/{salespersonId}` Firestore path to `firebase-blueprint.json`.
- **Salesperson Security Rule**: Created security rule for `/salespersons/{salespersonId}` collection in `firestore.rules` allowing authenticated users read/write operations.

### Fixed
- **Permission Denied Bug**: Resolved critical uncaught Firestore permission-denied error when requesting real-time salesperson updates via the `onSnapshot` listener.
