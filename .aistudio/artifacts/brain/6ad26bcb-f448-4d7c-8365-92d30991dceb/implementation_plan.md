# Quotation Studio, A4 Document Engine & Settings Hub — Implementation Plan

## 1. Non-Expanding Free-Floating Stamp & Signature Overlays
- **Goal**: Changing the size, offset, or rotation of the Company Stamp/Seal or Signature image must never stretch or resize the Signatory block or push adjacent document content.
- **Changes (`src/components/quotations/QuotationDocument.tsx`)**:
  - Anchor both the Signature image and Official Company Stamp inside zero-footprint absolute overlay containers (`position: absolute; pointer-events: auto; height: 0; width: 0; overflow: visible`) positioned relative to the fixed-height signatory slot (`min-h-[64px]`).
  - Keep the Signatory card's structural height locked to its text and signature-line geometry regardless of `stampSizePx` (`50px–260px`) or `signatureSizePx` (`24px–160px`).

## 2. Context-Aware Page Break & Vertical Spacer Insertion + Last-Row Line Item Break
- **Goal**: Make Page Breaks and Vertical Spacers take effect immediately where expected without requiring manual "Move Up" clicks.
- **Changes (`src/components/quotations/QuotationStudioModal.tsx` & `src/components/quotations/QuotationDocument.tsx`)**:
  - **Right Inspector Insertion (Above Selected Block)**: Update `handleAddPageBreak(insertBeforeBlockId?: string)` and `handleAddSpacer(insertBeforeBlockId?: string)` so clicking `+ Insert Page Break` or `+ Insert Vertical Spacer` inside a block's Right Inspector inserts the break/spacer **immediately above (before)** the currently inspected block in `layoutBlocks`.
  - **Left Drawer Insertion (Below Last Item)**: Keep the Left Drawer (`Bottom Sections (Drag or Reorder)`) buttons appending **below the last item**, and preserve trailing breaks in `partitionBlocksIntoSheets` when needed or provide immediate visual feedback.
  - **Line Items Table Last-Row Break (`splitLineItemsIntoChunks`)**: Fix `splitLineItemsIntoChunks` in `QuotationDocument.tsx` so toggling a page break on the **final line item** (`item.page_break_after === true && isLastItem`) emits a clean continuation sheet for the bottom closing sections (`terms`, `totals`, `remittance`, `signatory`, `acceptance`) instead of ignoring the break.

## 3. Header Logo-Only Stacking, Contact Icon Wrapping & Zone Alignment UI
- **Goal**: Fix awkward 3-column header layouts in Logo-Only mode, prevent contact icons (`MapPin`, `Phone`, `Mail`, `Globe`) from floating to the far left when right-aligned lines wrap, and unclutter the Right Inspector alignment controls.
- **Changes (`src/components/quotations/QuotationDocument.tsx` & `src/components/quotations/QuotationStudioModal.tsx`)**:
  - **Stack Brand Fields Below Logo in Logo-Only Mode**: When `showCompanyName === false` (`Logo Only (Hide Company Name)`), switch the Brand Lockup container from horizontal (`flex-row`) to vertical (`flex-col`) so `underName` fields (such as `TRN / VAT Reg`) stack cleanly **below the logo** rather than creating a separate middle column.
  - **Brand / Logo Zone 2D Alignment**: Apply `brandHorizontalAlign` (`left | center | right`) and `brandVerticalAlign` (`top | middle | bottom`) directly to the logo box and its stacked brand fields across all display modes (`logo_only`, `logo_and_name`, `no_logo`).
  - **Inline Contact Icon Wrapping**: Update `renderFieldItemNode` in `QuotationDocument.tsx` so the field icon (`MapPin`, etc.) renders inline with the text span (`inline-flex` / inline icon before text) rather than a full-width flex row that pushes the icon to the far left when right-aligned address text wraps to 2+ lines.
  - **Full-Width Zone Alignment Cards in Right Inspector**: Change the `Brand / Logo Zone` and `Contact / Details Zone` alignment container in `QuotationStudioModal.tsx` from a cramped 2-column grid (`grid-cols-2`) to a clean vertical stack (`grid-cols-1 gap-2.5`) so `Left | Center | Right` and `Top | Middle | Bottom` buttons have full readable width.

## 4. Direct "Save Changes" Persistence in Settings Preview & Studio Sandbox
- **Goal**: Allow users editing in the Settings interactive preview or Full Quotation Studio Sandbox to directly save their changes to the active workspace profile and selected preset without having to create a duplicate preset.
- **Changes (`src/components/quotations/QuotationStudioModal.tsx`, `src/components/WorkspaceDocumentProfileSettings.tsx`, & `src/components/SettingsView.tsx`)**:
  - **Update Active Preset & Profile Button in Studio (`QuotationStudioModal.tsx`)**:
    - Alongside `+ Save as New Preset`, add an explicit **`Save to Active Preset & Profile`** action (and wire the primary `Save Studio Defaults` / `Save Changes` button in Sandbox mode) so any edits to header layout, logo sizing, stamp/signature overlays, theme, and block layout persist directly to the currently selected preset (`saveQuotationPreset`) AND sync shared branding/header/signatory defaults back to the active Workspace Document Profile (`saveWorkspaceDocumentProfile`).
  - **Streamlined Settings Hub Navigation (`SettingsView.tsx` & `WorkspaceDocumentProfileSettings.tsx`)**:
    - Clarify the relationship between **Corporate Identity & Header Defaults** and **Quotation Presets & Live Studio Sandbox**, and add a sticky/prominent **`Save All Changes to Active Profile & Preset`** action bar directly above the Live A4 Preview in Settings so edits made in either the form or the interactive preview save in one click.

## 5. Granular Sub-Element Click Selection & Right Inspector Auto-Scroll
- **Goal**: Clicking a specific sub-element on the A4 preview (Logo, a specific Header field like Address/TRN, Company Stamp, or Signature) should open the Right Inspector and automatically scroll to and highlight that specific control group.
- **Changes (`src/components/quotations/QuotationDocument.tsx` & `src/components/quotations/QuotationStudioModal.tsx`)**:
  - Extend `onSelectSection` (or add `onSelectSubElement?: (section: StudioSectionId, subTarget?: string) => void`) in `QuotationDocument.tsx`.
  - Attach `stopPropagation` click handlers on:
    - **Corporate Logo box** → opens `'header'` inspector and scrolls/highlights `#inspector-header-logo`.
    - **Individual Header / Footer Field (`address`, `trn`, `phone`, `email`, etc.)** → opens `'header'` or `'footer'` inspector and scrolls/highlights `#inspector-field-${fieldId}` (and focuses its input).
    - **Official Company Stamp / Seal** → opens `'signatory'` inspector and scrolls/highlights `#inspector-signatory-stamp`.
    - **Authorized Signature Image** → opens `'signatory'` inspector and scrolls/highlights `#inspector-signatory-signature`.
  - Add smooth auto-scroll (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) and a temporary visual highlight ring on the target control card inside the Right Inspector drawer.
