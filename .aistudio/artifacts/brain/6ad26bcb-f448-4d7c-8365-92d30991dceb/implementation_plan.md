# Multi-Component Package / Set System & Multi-Option Tank Quotation Plan

## 1. Architectural Overview & Goal
Enable the Enquiries, Products Catalog, and Quotation Studio to natively build, price, and render **Multi-Component Packages / Composite Sets** (where a single parent system such as a Water Storage Tank Package consists of multiple priced sub-components + included zero-rate accessories) across **multiple commercial options (Option A: SST vs. Option B: GFS)** within a single quotation, complete with a **1-Click Pre-Loaded King Saud Air Base Development STP** template.

---

## 2. Core Data Model Upgrades (`/src/types.ts`)

### 2.1 Sub-Component / BOM Item Schema (`LineItemComponent`)
Introduce a dedicated `LineItemComponent` interface shared across `LineItem`, `QuotationLineItem`, and `Product`:
- `id: string`
- `sn_label?: string` (e.g., `1.1`, `1.2` or bullet for included accessories)
- `item_name: string` (e.g., `SST 475-60; Dia : 16.04m ; Ht : 6.0m ; Gross Cap : 1219KL` or `HDG FLANGED OUTLET 600MM (RF PAD & E TABLE) HDG SIDE`)
- `remark?: string` (e.g., `Equalization Tank (Closed Type Roof)`, `Anoxic Tanks (Open Roof)`, `TSE Tanks (Closed Type Roof)`)
- `specifications?: string` (dimensions, roof type, capacity, or technical note)
- `quantity: number` (e.g., `1`, `3`, `2`, `17`, `4`, `8`)
- `unit: string` (e.g., `NOS`, `SET`, `LOT`)
- `cost_price?: number` (Supplier Ex-Works unit rate, e.g., `$45,500.00`)
- `markup_percent?: number` (Optional markup % over supplier cost to auto-calculate selling unit rate)
- `unit_price: number` (Client selling unit rate)
- `total_price: number` (`quantity * unit_price`)
- `is_included_accessory?: boolean` (When `true`, renders the component with its quantity in the package breakdown while showing `Included` instead of a separate unit rate/amount — matching the 6 HDG outlet, ladder, and airvent rows in the reference PDFs)

### 2.2 Composite Package Controls on `LineItem`, `QuotationLineItem`, and `Product`
Add composite package fields to `LineItem`, `QuotationLineItem`, and `Product`:
- `is_composite_set?: boolean` — Marks the line item as a multi-component package/set.
- `sub_components?: LineItemComponent[]` — Ordered list of priced tank sub-items and included accessories.
- `package_pricing_mode?: 'itemized' | 'lump_sum'` — Controls how the package renders on the Quotation PDF:
  - `'itemized'`: Displays each priced sub-component's `Qty`, `Unit Rate`, and `Total Amount` row-by-row inside the parent package, plus `Included` badges for zero-rate accessories, summing up to the package total.
  - `'lump_sum'`: Displays the parent package total (`Unit Price` / `Total`) on the parent heading row while still listing all sub-components and their quantities underneath (hiding individual component unit rates on the client PDF).
- `option_scope_notes?: string` — Option-specific technical scope & design standards block (e.g., SST Enamel Coated Zn-Al-Mg Steel & PVC Liner spec vs. GFS Glass-Fused-To-Steel AWWA D103-09 spec).

### 2.3 Multi-Option Table & Filter Mode on `Quotation`
Add option presentation settings to `Quotation`:
- `option_display_mode?: 'all_separate_tables' | 'baseline_only' | 'option_a_only' | 'option_b_only' | 'combined_table'` (defaults to `'all_separate_tables'` when multiple options exist so Option A and Option B render as clearly titled, independent option tables with their own subtotals/totals in a single quotation, plus a live filter switcher in Quotation Studio).

---

## 3. UI & Workflow Enhancements

### 3.1 Multi-Component Set / BOM Builder (`EnquiryForm.tsx`, `EnquiryDetail.tsx`, & `QuotationStudioModal.tsx`)
1. **Package / Set Toggle & Sub-Component Table on Any Line Item**:
   - Add a `[ 📦 Multi-Component Set / BOM ]` toggle button on every line item header in `EnquiryForm`, `EnquiryDetail` (Line Items tab), and `QuotationStudioModal`.
   - When enabled, display an structured **Package Components & Accessories Editor** directly inside the line item card:
     - **Batch Supplier Markup Bar**: Quick input to apply a uniform Markup % or Margin % across all sub-component `cost_price` values (or convert USD supplier costs to AED at `3.6725` / SAR at `3.75`) to compute client `unit_price` automatically, while still allowing per-component price overrides.
     - **Pricing Display Toggle**: Instant switch between **Itemized Component Rates** (`itemized`) and **Single Package Lump-Sum** (`lump_sum`).
     - **Sub-Component Rows**: Inline rows for `Model / Component Spec`, `Remark / Tank Purpose (e.g., Equalization Tank - Closed Roof)`, `Qty`, `UOM`, `Supplier Cost`, `Selling Rate`, `Amount`, and an `Included Accessory (Qty Only)` checkbox.
     - **Auto-Rollup**: Automatically sums sub-component costs into the parent item's `cost_price` and sub-component selling totals into the parent item's `unit_price` / `total_price`.

### 3.2 Single-Quotation Multi-Option Tables & Filter Toggle (`QuotationDocument.tsx` & `QuotationStudioModal.tsx`)
1. **Structured Parent + Sub-Component Rendering on A4 Document (`QuotationDocument.tsx`)**:
   - When a line item has `sub_components?.length > 0`:
     - Render the **Parent Package Row** (`#1`, HSN/SAC code badge `73090090`, bold package title, e.g., `Supply of Secure Store Water Storage Tank (SST)` or `Glass-Fused-To-Steel (GFS) Water Storage Tank`).
     - Render numbered/indented **Sub-Component Rows** underneath with clean typographic hierarchy:
       - Model & dimensions (`SST 475-60; Dia : 16.04m ; Ht : 6.0m ; Gross Cap : 1219KL`)
       - Bold **Remark** pill/line (`Remark: Equalization Tank (Closed Type Roof)`)
       - `Qty` (`1.00`, `3.00`, `2.00`, `17.00`) and `UOM` (`NOS`)
       - In `itemized` mode: shows each component's `Unit Price` and `Total`, and shows `Included` for accessory rows (`HDG FLANGED OUTLET 600MM`, `HDG CAGE LADDER`, `HDG GOOSE NECK AIRVENT`).
       - In `lump_sum` mode: shows the full package price on the parent row and displays `Included (Set)` on the component rows so the client sees all technical specs and quantities without component price breakdown.
     - Render any `option_scope_notes` (Scope of Work & Tank Design Standards) cleanly below the option table.
2. **Option A (SST) & Option B (GFS) Separate Tables + Studio Filter Bar**:
   - When a quotation contains multiple options (`Option A`, `Option B`, etc.), `QuotationDocument` can render:
     - **Separate Option Tables Mode (Default)**: Renders a dedicated, clearly badged commercial table for **Option A — Secure Store Water Storage Tank (SST)** with its own Option A Total (`USD 631,250.00` or marked-up total), followed by **Option B — Glass-Fused-To-Steel (GFS) Water Storage Tank** with its own Option B Total (`USD 834,250.00` or marked-up total), plus an **Executive Option Summary Comparison Box** in the Financial Totals block so the client can approve either Option A or Option B.
     - **Quick Option Filter Pill Bar in Quotation Studio**: Lets you switch between `Show Both Options (A & B Tables)`, `Option A Only (SST)`, or `Option B Only (GFS)` with one click if the client asks for a standalone PDF of just one option.

### 3.3 1-Click Pre-Loaded "King Saud Air Base STP (SST & GFS)" Template & Catalog Bundles
1. **Ready-to-Use King Saud Air Base STP Generator (`src/utils/kingSaudTankPreset.ts`)**:
   - Include the exact, complete dataset from both attached PDFs (`26-27/SQ/1898` SST Offer and `26-27/SQ/1899` GFS Offer):
     - **Option A — Supply of Secure Store Water Storage Tank (SST)** (`HSN: 73090090`, Base Value `USD 631,250.00`):
       - All 8 priced SST tanks (`SST 475-60` $45,500 × 1, `SST 85-48` $13,500 × 3, `SST 310-60` $29,750 × 3, `SST 155-48` $17,500 × 3, `SST 70-48` $12,000 × 1, `SST 105-48` $16,000 × 1, `SST 1720-84` $173,500 × 2, `SST 70-36` $9,500 × 3)
       - All 6 included HDG accessories with exact quantities (`17`, `4`, `8`, `2`, `3`, `17`)
       - SST Scope of Work & Design Standards + Commercial Terms
     - **Option B — Glass-Fused-To-Steel (GFS) Water Storage Tank** (`HSN: 73090090`, Base Value `USD 834,250.00`):
       - All 8 priced GFS tanks (`GFS475-60` $59,500 × 1, `GFS85-48` $18,000 × 3, `GFS310-60` $40,000 × 3, `GFS155-48` $23,250 × 3, `GFS70-48` $16,000 × 1, `GFS105-48` $21,500 × 1, `GFS1720-84` $228,000 × 2, `GFS70-36` $12,500 × 3)
       - All 6 included HDG accessories with exact quantities (`17`, `4`, `8`, `2`, `3`, `17`)
       - GFS Scope of Work & Design Standards + Commercial Terms
   - Expose a prominent **`[ ⚡ Load King Saud STP Tank Package (SST + GFS) ]`** action button in the **Enquiries & Quotes** header and inside **Enquiry Form / Quotation Studio** so you can immediately create or populate the Enquiry and open it in Quotation Studio ready to apply your markup, toggle itemized vs. lump-sum, and export the PDF.
   - Support saving any multi-component line item set to the **Products Catalog** via `SaveToCatalogModal` so reusable tank/equipment packages retain their full `sub_components` BOM.

---

## 4. Verification Plan
1. Verify TypeScript compilation (`compile_applet`) with zero errors.
2. Verify creating/loading the **King Saud Air Base Development STP** enquiry populates both Option A (SST — USD 631,250.00) and Option B (GFS — USD 834,250.00) with all 8 priced tank rows and 6 included accessory rows.
3. Verify applying a supplier markup % updates all component selling rates and package totals, and toggling between **Itemized Component Prices** and **Lump-Sum Package Price** updates the A4 Quotation preview cleanly.
4. Verify switching the **Option Filter** in Quotation Studio (`Both Option A & B Tables`, `Option A Only`, `Option B Only`) accurately updates the A4 document tables and totals block.
