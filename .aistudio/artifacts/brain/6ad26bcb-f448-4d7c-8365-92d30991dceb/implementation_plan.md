# Quotation Studio 2.0 — Phase 1: Granular Set Sub-Component Row Options & Multi-Page Pagination Engine

Deliver per-row customization and pagination controls (`✂ Page Break`, `Spacer (mm)`, `🎨 Highlight`, `B Bold`, `Hide Price`, and `@tag`-enabled `+ Row Note`) across both top-level line items and every nested sub-component (`1.1`, `1.2`, ..., `1.50`) inside Composite BOM Sets, paired with an optional Auto-Paginate engine and multi-page BOM/Option table continuation safeguards.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and accounting behaviors have been confirmed during Phase 1 alignment:

- **Confirmed Decision 1 — Visual-Only Price Masking (`Hide Price`)**: Toggling `Hide Price` on a top-level line item or Set sub-component renders `Included` (for sub-components) or `—` (for top-level unit/total cells) visually on the A4 quotation while keeping the row's numeric price inside the Set/Option financial rollup so package and grand totals remain 100% accurate.
- **Confirmed Decision 2 — Smart `@Tag` Autocomplete in Row Notes (`+ Note`)**: Custom row notes on both top-level items and Set sub-components use `<AtMentionInput />` and resolve through the frozen quotation snapshot (`renderResolvedQuotationText`), supporting live `@delivery_lead_time`, `@warranty_period`, `@project_location`, and all 38 commercial `@tags`.
- **Confirmed Decision 3 — Orphan-Free Set Header Guard in Auto-Paginate Mode**: When `Auto-Paginate Long Tables & Sets` (`auto_paginate_items`) is enabled, a Composite BOM Set header row and its first sub-component (`1.1`) are always kept together on the same A4 sheet; if both do not fit in the remaining vertical budget of the current sheet, the entire Set starts cleanly at the top of the next continuation sheet.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Elevates every sub-component (`1.1`, `1.2`, ..., `1.50`) inside a Composite BOM Set to a first-class customizable row with its own page break toggle, bottom spacer in millimeters, custom `@tag`-resolvable row note, amber/brand row highlight, bold typography toggle, and price visibility mask.
  - Upgrades the A4 pagination engine so a 50-item BOM Set or Multi-Option schedule can split cleanly across multiple A4 sheets—either at exact manual cut points (`✂ Break After 1.x`) or automatically via `Auto-Paginate Long Tables & Sets`—with automatic `(Continued)` Set headers, continuous `1.11`, `1.12` numbering, zero double-counting of split Set prices, and preserved Option table grouping across all sheets.
- **Target Audience / Persona**: Commercial estimators, proposals engineers, and sales managers preparing complex multi-page engineering BOMs and multi-option commercial offers.
- **Key Value**: Eliminates awkward mid-table clipping and manual workarounds on large BOM sets while guaranteeing mathematical accuracy across multi-page option schedules.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Right Inspector (`items_table` -> Line-Item Pagination, Spacing & Row Options)**:
     - At the top of the section, users can toggle **`Auto-Paginate Long Tables & Sets`** (`auto_paginate_items`). When enabled, long tables and BOM sets automatically split across A4 sheets based on measured row height budgets while honoring any manual `✂ Break` flags as forced cut points.
     - Each top-level item row displays a compact action bar: `✂ Break` (`Break After Table` on the final item), `Spacer (mm)` stepper, `🎨 Highlight`, `B Bold`, `Hide Price`, and `+ Note`.
     - If an item is a Composite Set (`sub_components.length > 0`), an expandable indented sub-tree lists all sub-components (`1.1`, `1.2`, ..., `1.50`), each equipped with the exact same 6 controls (`✂ Break After 1.x`, `Spacer (mm)`, `🎨 Highlight`, `B Bold`, `Hide Price`, `+ Note`).
  2. **Left Panel Line-Item Cards & `CompositePackageEditor`**:
     - Inside the Left Panel's line-item list and inside `CompositePackageEditor`, each sub-component row includes compact quick toggles for `✂ Break After Row`, `🎨 Highlight`, `B Bold`, `Hide Price`, `Spacer`, and `+ Row Note` (with `@tag` autocomplete) so engineers can configure pagination and notes while editing a 50-row BOM.
  3. **Live A4 Multi-Page Preview & Print Canvas**:
     - When a BOM Set splits after sub-component `1.10`, Sheet 1 renders `1.1` through `1.10` followed by a subtle footer notice: `↳ Set #1 continued on next page...` (suppressing premature scope notes until the final slice).
     - Sheet 2 opens with a continuation table header and a dedicated **Set Continuation Header Row**: `#` column shows `1 (Cont.)`, description shows `<Item Name> (Continued)` badge without repeating parent specs/descriptions, and Qty/UOM/Price cells show `—` / `Included above`, followed immediately by `1.11`, `1.12`, etc.
     - For Multi-Option tables (`all_separate_tables`), if Option B spans Sheet 1 and Sheet 2, Sheet 1's Option B table footer displays `OPTION B — Continued on next page (Page Subtotal: AED ...)` and Sheet 2's Option B table footer displays the true cumulative `OPTION B TOTAL (AED ...)`.

- **Visual Identity & Theme**:
  - **Aesthetic Direction**: High-density enterprise light-mode studio controls (`bg-white`, `bg-slate-50/70`, `border-slate-200`) paired with crisp, print-faithful A4 commercial typography.
  - **Color Palette & Mood**:
    - Active page break badges & indicators: Amber accent (`bg-amber-50/90 text-amber-800 border-amber-300`).
    - Highlighted table rows (`row_highlight`): Soft warm tint (`bg-amber-50/60 print:bg-amber-50/50`) that prints cleanly without obscuring text contrast.
    - Set Continuation banners: Subtle slate/indigo structural tint (`bg-slate-100/80 text-slate-700 border-slate-200`).
  - **Typography & Hierarchy**: Monospace tabular numerals (`font-mono tabular-nums`) for all `#`, `1.x` sub-indices, quantities, spacer millimeter inputs, unit rates, and subtotals; clean sans-serif hierarchy for item titles and italic resolved `@tag` row notes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Stable Composite Keys Over Positional Array Indices**
  - *Chosen Approach*: Key all row overrides (`itemPageBreaks`, `itemRowSpacers`, and per-row style/note overrides) by stable `item.id` (for top-level items) and `${item.id}::${sub.id}` (for sub-components), while syncing directly onto the serialized `line_items` and `sub_components` objects.
  - *Why*: Reordering items or inserting a new sub-component at row `1.5` never shifts page breaks, spacers, or notes onto the wrong row.
- **Decision 2: Global Pre-Pass Before Sheet Chunking**
  - *Chosen Approach*: Compute `distinctOptionGroupsAll`, `parentItemNumber`, `globalOptionItemNumber`, `fullOptionGroupTotals`, and `finalChunkIndexByOptionKey` across the full unchunked `lineItems` array before `splitLineItemsIntoChunks` slices items across sheets.
  - *Why*: Prevents a continuation sheet that only contains `Option B` rows from losing its `Option B` table banner or resetting item numbering to `1`, and guarantees that split Composite Sets are never double-counted in option or grand totals.
- **Decision 3: Hybrid Manual + Auto-Pagination Engine**
  - *Chosen Approach*: Keep `auto_paginate_items` optional (default `false` for backward compatibility with existing saved quotes) and treat manual `page_break_after` flags as hard cut points that reset the running sheet height counter during auto-pagination.
  - *Why*: Existing quotations preserve their exact page count and layout, while users with 30–100+ row BOMs can turn on `Auto-Paginate` with 1 click and still fine-tune specific breaks manually.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        QuotationStudioModal (State)                          │
│  • autoPaginateItems (boolean)                                               │
│  • itemPageBreaks / itemRowSpacers / itemRowCustomizations (stable ID keys)  │
│  • itemCompositeOverrides (sub_components with per-row break/spacer/style)   │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌───────────────────────────────────────┐      ┌───────────────────────────────┐
│   Right Inspector & Left BOM Editor   │      │       QuotationDocument       │
│  • Auto-Paginate Master Toggle        │      │  1. Global Pre-Pass:          │
│  • Top-Level Row Options Bar          │      │     - distinctOptionGroupsAll │
│  • Expandable 1.1..1.N Sub-Row Tree   │      │     - parentItemNumber &      │
│  • CompositePackageEditor Quick Tools │      │       globalOptionItemNumber  │
│  • @Tag-Enabled Row Note Inputs       │      │     - fullOptionGroupTotals   │
└───────────────────────────────────────┘      │  2. splitLineItemsIntoChunks: │
                                               │     - Manual item & 1.x cuts  │
                                               │     - Auto-Paginate height    │
                                               │       budget (parent+1.1 kept │
                                               │       together)               │
                                               │  3. renderItemsTable:         │
                                               │     - Set (Cont.) Header Row  │
                                               │     - 1.11..1.N numbering     │
                                               │     - Page Subtotal vs Final  │
                                               │       Option Total Footers    │
                                               └───────────────────────────────┘
```

### Data Model & State
- **Per-Row Customization Fields (on `LineItemComponent`, `LineItem`, and `QuotationLineItem`)**:
  - `page_break_after?: boolean`
  - `row_spacer_after_mm?: number`
  - `row_note?: string`
  - `row_highlight?: boolean`
  - `row_bold?: boolean`
  - `hide_row_price?: boolean`
- **Runtime Continuation Metadata (on `QuotationLineItem`)**:
  - `isCompositeContinuation?: boolean`
  - `hasMoreSubComponentsAfter?: boolean`
  - `subComponentStartIndex?: number`
  - `parentItemNumber?: number`
  - `globalOptionItemNumber?: number`
- **Quotation & Preset Setting**:
  - `auto_paginate_items?: boolean` on `Quotation` and `QuotationPreset`, hydrated and persisted via `QuotationRepository`.

### Interactive Component & State Mapping
1. **Global Pre-Pass & Sub-Component Chunking**:
   - Before splitting `lineItems`, annotate each item with `parentItemNumber` (`1..N`), `globalOptionItemNumber` (`1..M` within its option group), and ensure every sub-component has a deterministic ID (`sub.id || `${item.id}_sub_${sIdx}``).
   - Calculate `fullOptionGroupTotals[optionKey]` and `finalChunkIndexByOptionKey[optionKey]` across non-continuation items.
   - In `splitLineItemsIntoChunks(lineItems, { autoPaginate })`:
     - Support splitting an item across multiple chunks whenever any sub-component `k < sub_components.length - 1` has `sub.page_break_after === true` OR when `autoPaginate` exceeds the current sheet's height budget (~175mm on Sheet 1, ~220mm on Sheet 2+).
     - Enforce the **Orphan-Free Set Header Guard**: estimate the parent row + first sub-component (`1.1`) height together before starting a Set on the current sheet; if their combined height exceeds the remaining budget on a non-empty chunk, flush the current chunk first so the Set header and `1.1` start together on the next sheet.
     - If the final sub-component (`k === sub_components.length - 1`) has `page_break_after === true`, promote it to `page_break_after: true` on that final item slice (including triggering the `Break After Table` sheet split when it is the last item in the quotation).
2. **Table Rendering (`renderItemsTable`)**:
   - Use `distinctOptionGroupsAll.length > 1` so continuation sheets with a single option group retain their Option banner and structure.
   - Skip `it.isCompositeContinuation` in all subtotal/group reducers so split Sets are never double-counted.
   - Render Set Continuation Header rows (`#1 (Cont.)`, `<Item Name> (Continued)`, `Included above` in price cells) when `item.isCompositeContinuation === true`.
   - Render sub-components using `subSn = ${item.parentItemNumber || itemNumber}.${(item.subComponentStartIndex || 0) + subIdx + 1}`, applying `row_highlight`, `row_bold`, `hide_row_price`, `@tag`-resolved `row_note`, and `row_spacer_after_mm` to both parent rows and sub-component rows.
   - Render `↳ Set #X continued on next page...` when `item.hasMoreSubComponentsAfter === true`, and render Option continuation footers (`Page Subtotal` vs final `OPTION X TOTAL`) based on `finalChunkIndexByOptionKey`.
