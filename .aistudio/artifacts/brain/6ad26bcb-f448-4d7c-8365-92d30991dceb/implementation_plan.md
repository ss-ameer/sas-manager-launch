# Quotation Studio & Enquiries Registry UI/UX Declutter, Collapsible Left Drawer & Sticky Headers

Surgical UI/UX enhancements across Quotation Studio and the Enquiries Registry to maximize A4 canvas preview space with a collapsible Left Controls Drawer, declutter the Custom Block Lego Piece inspector with a collapsible icon-based Typography & Style accordion, prevent `@` tag autocomplete clipping, and pin the Enquiries Registry table header and compact action buttons.

## User Review & Critical Decisions

> [!IMPORTANT]
> Both design decisions from Phase 1 have been confirmed and incorporated into this plan:

- **Confirmed Decision 1 (Save & Issue Accessibility When Left Drawer Is Collapsed)**: When `isLeftDrawerOpen` is `false`, compact **Save Quotation** and **Issue Quotation** (or **Update Preset & Close** in sandbox mode) buttons remain accessible in the top header bar alongside the **Show Controls** toggle so users can save or issue directly from full-width A4 preview mode.
- **Confirmed Decision 2 (Default Piece Typography Accordion State)**: Inside the Custom Block inspector, each Lego piece's **Typography & Style** toolbar (`openFormatPieceId`) starts collapsed by default (`null`) so the 336px Right Inspector remains clean and scannable, expanding on demand when clicked.

## 1. Overview & Core Concept

- **What It Does**:
  1. **Collapsible Left Controls Drawer in Quotation Studio**: Adds `isLeftDrawerOpen` state with toggle controls in the Modal Top Header (`Hide Controls` / `Show Controls`), inside the Left Drawer sticky header (`PanelLeftClose`), and in the Live Preview toolbar (`Show Controls`), plus quick-save actions in the top header when the drawer is collapsed.
  2. **Decluttered Collapsible `Typography & Style` Toolbar**: Replaces the always-expanded 4-row button cluster in Custom Block Lego pieces with a compact `Typography & Style` toggle button (`openFormatPieceId === piece.id`) and an inline `+ @Insert Data Tag` selector, revealing icon-driven formatting controls (`Bold`, `Italic`, `Underline`, `AlignLeft`, `AlignCenter`, `AlignRight`, `AlignJustify`, font scale, ink color, line height, and highlight swatches) only when opened.
  3. **Clean Multi-Column Default Headings**: Removes placeholder `'LEFT COLUMN'` and `'RIGHT COLUMN'` heading strings from `createDefaultPiece('columns')` so blank column splits never print dummy labels on quotations.
  4. **Unclipped `@Tag` Floating Autocomplete Dropdown**: Updates `AtTagFloatingDropdown` to `z-[70]` and `max-h-56` so it floats cleanly above adjacent inspector and modal controls.
  5. **Sticky Enquiries Table Header & Compact Action Bar**: Locks the Enquiries Registry `<thead>` at `sticky top-0 z-10` inside a vertically scrollable table container (`max-h-[calc(100vh-270px)] overflow-y-auto`) and shortens secondary header action labels (`Reserve Gap`, `Claim Ref`, `Import`, `Export CSV`) to prevent wrapping.
- **Target Audience / Persona**: Commercial estimators, sales engineers, and executives reviewing multi-page A4 quotations and managing high-volume enquiry logs.
- **Key Value**: Eliminates visual clutter in the 336px block inspector, gives users 1-click full-width A4 preview space, and keeps column headers visible while scrolling through 25–50+ enquiries.

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Full-Width Preview Toggle**: Clicking `Hide Controls` in the Studio header (or the collapse icon next to `+ Save as New Preset`) smoothly hides the 460px–500px left drawer so the A4 canvas expands across the viewport; clicking `Show Controls` in either the header or preview toolbar restores the drawer.
  - **On-Demand Piece Formatting**: Clicking `Typography & Style` on any Heading, Rich Text, or List piece toggles its formatting accordion (`openFormatPieceId`), while `+ @Insert Data Tag` remains directly accessible on the top bar of the piece.
  - **Sticky Registry Scrolling**: Scrolling down through the Enquiries Registry keeps `S/N`, `Company`, `Quote Ref`, `Rep`, `Date`, `Status`, `Value`, and `Actions` pinned at the top of the table viewport with a frosted backdrop (`backdrop-blur-xs`).
- **Visual Identity & Theme**:
  - Clean slate/indigo/blue executive styling with Lucide iconography (`PanelLeft`, `PanelLeftClose`, `Type`, `Bold`, `Italic`, `Underline`, `AlignLeft`, `AlignCenter`, `AlignRight`, `AlignJustify`).

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single Active Formatting Accordion (`openFormatPieceId`)**
  - *Chosen Approach*: Track `openFormatPieceId: string | null` in `QuotationStudioModal` so at most one Lego piece's formatting panel is expanded at a time.
  - *Why*: Prevents vertical scroll bloat when a Custom Block contains 4–8 Lego pieces.
- **Decision 2: Bounded Scroll Container for Enquiries Table**
  - *Chosen Approach*: Apply `max-h-[calc(100vh-270px)] overflow-y-auto relative` to the table wrapper and `sticky top-0 z-10` to `<thead>`.
  - *Why*: Native CSS sticky `<thead>` requires a bounded scrolling ancestor so the table header stays locked while the pagination footer remains immediately visible below the scroll area.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        QuotationStudioModal                              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Modal Header: [Hide/Show Controls] + Compact Save/Issue (if closed)│  │
│  └───────────────┬────────────────────────────────────┬───────────────┘  │
│                  ▼                                    ▼                  │
│  ┌───────────────────────────────┐    ┌───────────────────────────────┐  │
│  │ Left Drawer (isLeftDrawerOpen)│    │ Right Column: Live A4 Preview │  │
│  │ • Preset Bar + Collapse Icon  │    │ • Preview Toolbar:            │  │
│  │ • Structure & Content Tabs    │    │   [!isLeftDrawerOpen -> Show] │  │
│  │ • Sticky Save/Issue Footer    │    │ • Right Contextual Inspector: │  │
│  └───────────────────────────────┘    │   • openFormatPieceId Toggle  │  │
│                                       │   • AtTagFloatingDropdown z70 │  │
│                                       └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                            EnquiryList                                   │
│  • PageHeader secondaryActions: Reserve Gap | Claim Ref | Import | CSV   │
│  • Table Container (max-h-[calc(100vh-270px)] overflow-y-auto)           │
│    └── <thead className="sticky top-0 z-10 backdrop-blur-xs">            │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - `isLeftDrawerOpen` (`boolean`, default `true`): Controls conditional rendering of the Left Column drawer, header toggle button styling, preview toolbar quick-open button, and header fallback Save/Issue buttons.
  - `openFormatPieceId` (`string | null`, default `null`): Controls which Lego piece's `Typography & Style` panel is expanded inside `renderStandardTextToolbar(..., piece.id)`.
