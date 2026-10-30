# Quotation Studio 2.0 — Phase 2: Decluttered Commercial Summary & Totals Hub

Consolidate scattered financial summary settings, multi-option table display modes, BOM package pricing defaults, and unpriced submittal controls into a single **Commercial Summary & Totals Hub** in the Right Inspector, complete with lossless price-restore memory (**Choice B1**) and reorderable financial rows with live currency previews.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and UX decisions were confirmed during interactive clarification and govern this implementation:

- **Confirmed Decision 1 — Unpriced Submittal / DO Mode Rendering**: Activating **Unpriced Submittal / DO Mode** hides Unit Price and Line Total columns, suppresses per-option subtotal footer rows on the document while preserving quantities, units, and technical specifications, and hides the bottom Financial Summary block. Switching back to a Priced mode restores the exact prior column and block visibility snapshot (**Choice B1**).
- **Confirmed Decision 2 — Reorderable Standard & Custom Financial Rows**: Standard accounting rows (`Subtotal`, `Freight`, `Tax / VAT`) can be reordered alongside custom financial adjustment rows (`Special Discount`, `Mobilization Advance`, `Rebate`), with custom rows also supporting `Above Grand Total` or `Below Grand Total` placement and Bold/Highlight styling.
- **Confirmed Decision 3 — Single Source of Truth for Option & Package Modes**: The duplicate Multi-Option & Package Layout card inside the Line Items Table inspector is replaced with a clean 1-click navigation card (**`Configure Options, Totals & Package Pricing →`**) that opens the unified **Commercial Summary & Totals Hub** (`totals` Inspector), eliminating duplicate controls across drawers.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the `totals` Right Inspector into a unified **Commercial Summary & Totals Hub** structured into three focused cards:
  1. **Card 1 — Document Pricing & Option Mode**: 3 top-level mode selectors (**`Standard / Combined Table`**, **`Multi-Option View`**, and **`Unpriced Submittal / DO`**) with automatic **Choice B1** snapshot/restore memory, option filter pills (`All Separate Option Tables`, `Option A Only`, `Option B Only`, `Option C Only`), custom option banner titles, and a 2-choice toggle for `Per-Option Totals Only` vs. `Per-Option Totals + Combined Bottom Summary`.
  2. **Card 2 — BOM Set Pricing Default**: Batch-action buttons (**`Set All Packages to Lump Sum`** and **`Set All Packages to Itemized`**) with a live package breakdown counter (`X Lump Sum · Y Itemized`) that updates composite line items in bulk without locking out individual per-item overrides.
  3. **Card 3 — Financial Summary Rows & Live Currency Preview**: Reorderable standard rows (`Subtotal`, `Freight`, `VAT`) showing live calculated figures right inside the inspector, plus reorderable custom financial rows with enable/disable checkboxes, Up/Down ordering, Bold/Highlight toggles, and `Above Grand Total` vs. `Below Grand Total` placement.
- **Target Audience / Persona**: Commercial estimators, proposal engineers, and sales managers preparing standard quotations, multi-option comparative offers (Option A / B / C), lump-sum or itemized BOM packages, and unpriced technical submittals or delivery orders.
- **Key Value**: Eliminates hunting across multiple tabs and drawers for pricing and option controls, prevents accidental loss of column/totals settings when toggling Unpriced Submittal mode, and gives real-time visibility into financial figures while customizing summary rows.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **1-Click Hub Entry from Left Panel & Table Inspector**:
     - In Left Panel → Tab 2 (`Deal Data & Content`) → `Tax & Financial Adjustments`, clicking **`Configure Totals, Options & Price Display →`** opens the `totals` Right Inspector.
     - In the `items_table` Right Inspector, the former duplicate Multi-Option card is replaced by a streamlined summary banner with a 1-click **`Configure Options, Totals & Package Pricing →`** shortcut to the `totals` Hub.
  2. **Switching Document Pricing & Option Modes (Card 1)**:
     - Clicking **`Unpriced Submittal / DO`** snapshots `{ showUnitPrice, showLineTotal, totalsBlockVisible, showAmountInWords, optionDisplayMode }` into `savedPricedConfigRef`, hides the price columns and bottom `totals` block, and suppresses option subtotal rows on the canvas. An amber restore banner with a 1-click **`Restore Priced Quote Settings`** button appears immediately.
     - Clicking **`Standard / Combined Table`** or **`Multi-Option View`** (or the restore button) automatically restores the saved priced configuration from `savedPricedConfigRef` before applying the chosen table mode.
     - When **`Multi-Option View`** → **`All Separate Option Tables (A / B / C)`** is selected, a 2-choice segmented toggle lets the user pick **`Per-Option Totals Only`** (with an explanatory notice that each option table displays its own subtotal and amount in words so mutually exclusive options aren't summed together) or **`Per-Option Totals + Combined Bottom Summary`**.
  3. **Batch BOM Set Pricing Without Locking Overrides (Card 2)**:
     - Clicking **`Set All Packages to Lump Sum`** or **`Set All Packages to Itemized`** updates `package_pricing_mode` across all composite BOM line items while preserving the user's ability to toggle any individual Set later. A live counter displays `X Lump Sum · Y Itemized`.
  4. **Configuring & Reordering Financial Summary Rows (Card 3)**:
     - Each standard row (`Subtotal`, `Freight`, `VAT`, `Grand Total`) displays its live calculated currency amount (`AED X,XXX.XX`) in monospace tabular numerals (`tabular-nums`) right inside the inspector row, alongside Up/Down reorder buttons and inline label editing.
     - Custom financial rows (e.g., `Special Discount`, `Mobilization Advance`, `Rebate`) provide an enable/disable checkbox, label and `@tag`-enabled value inputs, Up/Down reorder buttons, a **Bold / Highlight** toggle (`isHighlight`), and a **Placement** selector (`Above Grand Total` vs. `Below Grand Total`).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft enterprise light mode with crisp slate surfaces (`#FFFFFF` cards on `#F8FAFC` inspector tracks) and semantic accents (`blue-600` primary commercial actions, `indigo-600` multi-option/BOM controls, `amber-600` unpriced submittal state & restore banner).
  - *Typography & Hierarchy*: Clean sans-serif UI labels paired with strict monospace tabular numerals (`font-mono tabular-nums`) for all live currency previews (`AED 0.00`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Lossless Price-Restore Memory (`Choice B1`)**:
  - *Chosen Approach*: Store a ref/state snapshot (`savedPricedConfigRef`) capturing `{ showUnitPrice, showLineTotal, totalsBlockVisible, showAmountInWords, optionDisplayMode }` at the exact moment the user enters **Unpriced Submittal / DO Mode**.
  - *Why*: Users frequently generate an unpriced technical submittal PDF and immediately switch back to the commercial quote. Snapshot memory guarantees that custom combinations (such as hiding Unit Price while keeping Line Total visible, or using Separate Option Tables) are restored faithfully instead of resetting to naive defaults.
- **Decision 2 — Stateless Batch Action for BOM Set Pricing**:
  - *Chosen Approach*: Apply batch updates directly to each composite line item's `package_pricing_mode` override rather than introducing a global override flag.
  - *Why*: Allows an estimator to set 10 BOM packages to Lump Sum in one click and still switch 1 specific package to Itemized Rates without fighting a global lock.
- **Decision 3 — Unified Reorderable Financial Summary Architecture**:
  - *Chosen Approach*: Use `fieldOrder` on the `totals` block for standard pre-total accounting rows (`['subtotal', 'freight', 'tax']`) and extend `QuotationBlockCustomRow` with `isHighlight?: boolean` and `position?: 'above_grand_total' | 'below_grand_total'`.
  - *Why*: Supports both standard accounting order adjustments and post-total commercial adjustments (such as `Less: 10% Advance Payment` or `Net Payable Upon Delivery` below Grand Total) while remaining 100% backward-compatible with existing saved quotations and presets.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        QuotationStudioModal (State)                        │
│  • savedPricedConfigRef (Choice B1 Snapshot Memory)                        │
│  • optionDisplayMode / showCombinedOptionsTotal / optionGroupTitles        │
│  • visibleColumns (showUnitPrice, showLineTotal)                           │
│  • layoutBlocks['totals'] (is_visible, fieldOrder, customRows, labels)     │
│  • itemCompositeOverrides (per-item package_pricing_mode)                  │
└───────────────┬────────────────────────────────────────┬───────────────────┘
                │                                        │
                ▼                                        ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────────┐
│   Commercial Summary & Totals Hub     │  │     QuotationDocument (PDF)     │
│   (Right Inspector: 'totals')         │  │                                 │
│  ┌─────────────────────────────────┐  │  │  • renderItemsTable:            │
│  │ Card 1: Pricing & Option Mode   │  │  │    Suppresses option subtotal   │
│  │  • Standard / Combined Table    │  │  │    footer when unpriced         │
│  │  • Multi-Option View (A/B/C)    │  │  │                                 │
│  │  • Unpriced Submittal / DO      │  │  │  • renderTotalsBlock:           │
│  ├─────────────────────────────────┤  │  │    1. Per-Option Summary Cards  │
│  │ Card 2: BOM Set Pricing Default │  │  │    2. Ordered Standard Rows     │
│  │  • All Lump Sum / All Itemized  │  │  │       (subtotal, freight, tax)  │
│  │  • Live X Lump · Y Itemized     │  │  │    3. Custom Rows (Above Total) │
│  ├─────────────────────────────────┤  │  │    4. Grand Total Banner        │
│  │ Card 3: Financial Summary Rows  │  │  │    5. Custom Rows (Below Total) │
│  │  • Live AED Previews & Reorder  │  │  │    6. Amount in Words           │
│  │  • Custom Rows (Above/Below GT, │  │  └─────────────────────────────────┘
│  │    Bold/Highlight, Reorder)     │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

### Data Model & State

- **`QuotationBlockCustomRow`**:
  - Extended with `isHighlight?: boolean;` (renders row with bold typography and subtle accent highlight) and `position?: 'above_grand_total' | 'below_grand_total';` (defaults to `'above_grand_total'`).
- **`PricedConfigSnapshot` (`savedPricedConfigRef`)**:
  - Stores `{ showUnitPrice: boolean; showLineTotal: boolean; totalsBlockVisible: boolean; showAmountInWords: boolean; optionDisplayMode: QuotationOptionDisplayMode }`.
  - Automatically populated when entering **Unpriced Submittal / DO Mode** and consumed when returning to **`Standard / Combined Table`** or **`Multi-Option View`** (or clicking **`Restore Priced Quote Settings`**).

### Interactive Component & State Mapping

1. **Entry Shortcuts**:
   - Left Panel Tab 2 (`Tax & Financial Adjustments` card) and Right Inspector (`items_table` card) invoke `handleInspectSection('totals')`, opening the `totals` Inspector drawer.
2. **Mode Transitions (Card 1)**:
   - **To `Unpriced Submittal / DO`**: If not already in unpriced mode, saves current `visibleColumns.showUnitPrice`, `visibleColumns.showLineTotal`, `totals` block `is_visible`/`enabled`, `amountInWordsEnabled`, and `optionDisplayMode` into `savedPricedConfigRef.current`. Sets `showUnitPrice: false`, `showLineTotal: false`, and `totals` block `enabled: false, is_visible: false`.
   - **To `Standard / Combined Table`**: If currently in unpriced mode, restores `showUnitPrice`, `showLineTotal`, `totals` block visibility, and `amountInWordsEnabled` from `savedPricedConfigRef.current` (fallback: `true`), and sets `optionDisplayMode` to `'combined_table'`.
   - **To `Multi-Option View`**: If currently in unpriced mode, restores priced columns and `totals` block visibility from `savedPricedConfigRef.current`, and sets `optionDisplayMode` to the saved multi-option mode (or `'all_separate_tables'` if previously `'combined_table'`).
3. **Batch BOM Package Mode (Card 2)**:
   - Iterates over composite line items in `quotationLineItems` and updates `itemCompositeOverrides[itemKey].package_pricing_mode` (and `customStudioLineItems` if active) to `'lump_sum'` or `'itemized'`.
4. **Financial Rows & Custom Adjustments (Card 3 & Document Renderer)**:
   - Standard rows (`subtotal`, `freight`, `tax`) render in the order defined by `selectedBlock.fieldOrder` (default `['subtotal', 'freight', 'tax']`) with Up/Down reorder buttons and live `AED` amounts from `financialTotals`.
   - Custom rows on `totals` support Up/Down reordering, `enabled` toggle, `isHighlight` toggle (bold/tinted row styling), `position` toggle (`'above_grand_total'` vs `'below_grand_total'`), and `hideIfEmpty` toggle.
