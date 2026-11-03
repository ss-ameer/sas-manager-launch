# Quotation Studio Header Reorganization & Dual-Drawer 3-Pane Layout

Reorganizes the Quotation Studio modal header into two structured, non-wrapping horizontal rows and enables simultaneous Left Controls + Right Contextual Inspector drawers in a balanced 3-pane workspace with automatic A4 canvas scaling.

## User Review & Critical Decisions

> [!IMPORTANT]
> Both design decisions below were confirmed during interactive clarification and govern the studio layout restructuring:

- **Confirmed Decision 1 — Two-Row Studio Header Bar**: Split the overcrowded top header into two distinct, non-wrapping horizontal rows:
  - **Row 1 (Primary Identity & Actions Bar)**: Studio title, document reference number, client/vendor & assigned rep context on the left; primary **Save**, **Issue / Update**, and **Close (`×`)** actions pinned strictly to the right so they never wrap onto a lower left line.
  - **Row 2 (Document Suite Mode, Status & Drawer Toolbar)**: Client (`QT`, `DO`, `REC`) and Vendor (`PO`, `PV`, `MRN`, `DN`) document mode switchers, status lifecycle selector (`Draft`, `Sent`, `Approved`, `Rejected`, `Superseded`), revision controls (`Clone as R2`, revision history switcher), and independent **Left Drawer** / **Right Inspector** toggle buttons.
- **Confirmed Decision 2 — Simultaneous Dual-Drawer 3-Pane Workspace**: Remove the mutual-exclusion lock between the Left Controls Drawer and Right Contextual Inspector Drawer:
  - Both drawers can remain open at the same time as slimmer side panels (`380px` width on desktop) flanking the center A4 preview canvas.
  - Each drawer has its own independent toggle button in the toolbar and header, and the center A4 preview automatically recalculates its fit/scale when one or both drawers open or close so the document remains centered and never clips.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Commercial Document & Quotation Studio into a true 3-pane desktop publishing workspace (Left Controls Panel + Center Live A4 Canvas + Right Section Inspector) with a structured 2-tier top bar.
- **Target Audience / Persona**: Commercial engineers, estimators, and procurement teams configuring multi-option quotations, delivery notes, purchase orders, and vouchers while inspecting live A4 pagination and section formatting.
- **Key Value**: Eliminates awkward multi-line button wrapping in the modal header and allows users to edit global document content/blocks on the left while simultaneously fine-tuning section columns, specs, or branding in the right inspector without one drawer forcibly closing the other.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Clean Top-Bar Scanning & Action Execution**: When opening Quotation Studio, Row 1 immediately presents the document identity (`Quotation Studio • AVENTURA/UAE/...`) and client/rep metadata on the left, while `Save Quotation`, `Issue Quotation`, and `Close` stay anchored at the top-right corner across all viewport widths.
  2. **Document Type & Lifecycle Switching (Row 2)**: Directly beneath Row 1, a dedicated studio toolbar houses the Client/Vendor document mode switchers on the left, lifecycle status & revision controls in the center, and drawer toggle buttons (`Left Controls`, `Right Inspector`) on the right.
  3. **Simultaneous Dual-Drawer Editing**: Clicking any section on the A4 preview (such as the Line Items Table, Header, Recipient Card, Totals, or Signatories) opens or updates the Right Inspector Drawer **without closing** the Left Controls Drawer. Users can toggle either drawer independently at any time, or click `Fit Page` (or let auto-fit adjust the scale) to view the full A4 sheet comfortably between both open drawers.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density enterprise document publishing studio with crisp 1px structural dividers (`border-slate-200`), zero-wrap single-line toolbar controls (`whitespace-nowrap shrink-0`), and clear visual hierarchy.
  - *Color Palette & Mood*: Crisp white (`#FFFFFF`) header and drawer surfaces, cool neutral canvas (`bg-slate-200/80`) for the physical A4 viewport, primary blue (`#2563EB`) for active client document modes and primary CTAs, and indigo (`#4F46E5`) for vendor document modes and revision actions.
  - *Typography & Hierarchy*: Clean sans-serif UI controls paired with tabular monospace (`font-mono tabular-nums`) for document reference codes, revision badges, zoom percentages, and A4 geometry metrics.
- **Interactive Feedback & Motion**: Smooth layout transitions when toggling either drawer, with automatic responsive zoom adjustment so the A4 page never overflows horizontally when both sidebars are open.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Decoupling Left Controls Drawer & Right Inspector State**
  - *Chosen Approach*: Remove `if (resolved !== null) setIsLeftDrawerOpen(false)` from `setSelectedSection` and remove `if (next) setSelectedSectionState(null)` from the Left Controls toggle button. Add a dedicated Right Inspector toggle button in the toolbar (defaulting to `'items_table'` if no section was previously selected when clicked).
  - *Why*: Users frequently jump between global content/block ordering (Left Drawer) and granular table column/spec visibility (Right Inspector). Allowing both to stay open eliminates repetitive re-opening clicks.
  - *Alternatives Considered*: Docking both panels into a single tabbed sidebar was passed over because having both visible side-by-side provides faster cross-reference on widescreen displays.
- **Decision 2: Responsive Widths & Auto-Fit Zoom Compensation**
  - *Chosen Approach*: Standardize the Left Controls Drawer and Right Contextual Inspector Drawers to `360px–380px` (`lg:w-[360px] xl:w-[380px]`) and automatically adjust the A4 preview `zoomScale` when both drawers are open on standard laptop viewports so the `210mm` A4 sheet fits cleanly inside the center pane.
  - *Why*: Two `460px–500px` drawers would consume `960px` of horizontal space, squeezing the center canvas on `1366px–1440px` screens. Slimming each drawer to `360px–380px` and auto-fitting the canvas preserves generous breathing room for the live A4 preview.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ MODAL CONTAINER (max-w-[1680px] w-[98vw] h-[95vh])                                       │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ HEADER ROW 1: [Icon + Studio Title + Ref Code + Client/Rep Subtitle] ──► [Save] [Issue] [X]│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ HEADER ROW 2: [Client: QT|DO|REC] [Vendor: PO|PV|MRN|DN] ──► [Status & Revs] [Left|Right]│
├──────────────────────┬────────────────────────────────────────────┬──────────────────────┤
│ LEFT CONTROLS DRAWER │ CENTER LIVE A4 PREVIEW VIEWPORT            │ RIGHT INSPECTOR      │
│ (w-[360px–380px])    │ (flex-1 min-w-0)                           │ (w-[360px–380px])    │
│ • Preset Selector    │ ┌────────────────────────────────────────┐ │ • Contextual Section │
│ • Content & Metadata │ │ Preview Toolbar: A4 Geometry | Zoom/Fit│ │   Inspector (Header, │
│ • Layout & Blocks    │ └────────────────────────────────────────┘ │   Recipient, Table,  │
│ • Independent Close  │ • Auto-Scaled A4 Sheet (210mm × 297mm)     │   Totals, Footer)    │
│   Toggle             │ • Click-to-Inspect Section Handlers        │ • Independent Close  │
└──────────────────────┴────────────────────────────────────────────┴──────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Independent Drawer State**:
    - `isLeftDrawerOpen` (`boolean`) controls only the Left Controls Drawer. Opening it never clears `selectedSection`.
    - `selectedSection` (`StudioSelectedSection`) controls the Right Contextual Inspector Drawer. Selecting a section on the A4 canvas or from the block list opens/updates the Right Inspector without closing `isLeftDrawerOpen`.
    - `lastInspectedSectionRef` remembers the most recently inspected section (defaulting to `'items_table'`) so clicking the toolbar's **Right Inspector** toggle button can reopen the inspector at any time even if no canvas section was just clicked.
  - **Smart Canvas Zoom Auto-Fit**:
    - An effect observing `isLeftDrawerOpen` and `Boolean(selectedSection)` measures available width in `previewScrollRef` and smoothly clamps `zoomScale` when both drawers are open so the `210mm` (`794px`) A4 sheet never causes horizontal clipping.
