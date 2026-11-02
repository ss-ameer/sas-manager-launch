# Products Catalog & Inventory Module — 10-Point Polish & Architecture Plan

## 1. System Architecture & Root-Cause Resolution

This plan resolves the 10 UI, layout, and workflow issues identified during the live walkthrough of the **Products Catalog & Inventory** module (`src/components/ProductManager.tsx`, `src/components/quotations/CompositePackageEditor.tsx`, `src/utils/productVariantFormat.ts`, and `src/services/inventoryService.ts`).

### Core Architectural Fixes

1. **`PageHeader` & Catalog Table 100% Zoom Fit (`src/components/ProductManager.tsx`)**:
   - **Header Button De-crowding**: Keep the 3 high-frequency actions (`Receive Stock (GRN)`, `Adjust Stock`, `+ Create Product`) in `<PageHeader>` and move `Stock Ledger` and `Procurement & Payables` into the filter/toolbar strip so the `Product Catalog` title and product count badge never crush or wrap on medium viewports.
   - **Table Column & Action Tightening**: Merge the standalone `Unit` column into the `Stock & Lead Time` / `Standard Price` display (`AED 100.00 / Nos`), remove the redundant text `Edit` button from the `Actions` column (since every row is click-to-edit), and use compact icon buttons (`GRN`, `Adjust`, `Clone`, `Delete`) paired with a compact `Variant` pill so all columns fit 100% inside the viewport with zero horizontal scrollbar.

2. **`Edit / Register Catalog Product` Modal Slicing & Stuck `UNIT (UOM)` Input (`src/components/ProductManager.tsx`)**:
   - **UOM Dropdown & Reset Fix**: Always merge `UNIVERSAL_UNITS` (`Nos`, `Pcs`, `Set`, `Unit`, `Lot`, `Mtr`, `Kg`, `Ltr`, `Roll`, `Box`, `Pack`) with workspace custom units and existing product units so standard UOMs are always present. Reset `isCreatingUnit` and `isCreatingCategory` to `false` whenever opening Add, Edit, Variant, or Duplicate modals, and add a clear `Cancel` (`<X />`) button next to `[ Add ]` in custom UOM mode.
   - **Vertical Space Reclamation**: Remove the redundant 95px intermediate product summary card between the modal header and the 3-tab bar; surface live `SKU`, `Category`, and `Selling Price / Margin` badges directly inside the top modal header. Widen the modal to `max-w-4xl` (`max-w-5xl` when Composite BOM is enabled) and use compact `p-4 space-y-3.5` spacing so Tabs 1, 2, and 3 fit cleanly at 100% zoom without vertical slicing.

3. **Spec Variant Family Grouping & Diff Highlighting (`src/utils/productVariantFormat.ts` & `src/components/ProductManager.tsx`)**:
   - **Root Cause**: `ProductVariantAnalysis` in `src/utils/productVariantFormat.ts` defined `isVariantFamily`, `varyingKeys`, `diffSpecs`, and `sharedSpecs`, whereas `ProductManager.tsx` and `CompositePackageEditor.tsx` accessed `vInfo.isVariant`, `vInfo.differentiatingKeys`, `vInfo.differentiatingAttributes`, and `vInfo.sharedAttributes`. In addition, products linked via `variant_parent_id` need transitive family grouping alongside `product_family` and normalized `name`.
   - **Fix**: Unify family grouping across `variant_parent_id`, `product_family`, and normalized `name`, and expose both property sets on `ProductVariantAnalysis` so differing specs (e.g., `Height: 100mm` vs `Height: 120mm` on `Cup`) always render with high-contrast indigo diff badges (`bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold`) and `Variant • N SKUs` family indicators.

4. **Composite Package / Kit (BOM) Editor Reflow (`src/components/quotations/CompositePackageEditor.tsx`)**:
   - **Zero Duplicate Icons**: Fix the `+ + Add Included Accessory (No Extra Charge)` button by removing the duplicate `+` character inside the label span.
   - **Spacious 2-Line Sub-Component Layout**: Reflow each Priced Sub-Component in `CompositePackageEditor.tsx` so primary commercial inputs (`#`, `Component Name / Spec`, `Qty`, `UOM`, `Supplier Cost`, `Selling Rate`, `Total`, `Actions`) sit cleanly on the top line, while `Catalog SKU Link / Stock / Drift Badges`, `Application / Scope Note`, and `Photo / PDF Layout & Spacer (mm)` sit on a structured secondary bar below—eliminating horizontal scrollbars and clipped inputs.

5. **Inbound GRN, Stock Adjustment & Stock Movement Ledger Polish (`src/components/ProductManager.tsx` & `src/services/inventoryService.ts`)**:
   - **Single Clean Stock Summary in Product Dropdowns**: Update `formatProductVariantSelectorLabel` so product `<select>` options in GRN and Stock Adjustment modals display stock once: `Jackson Disk Diffuser (Width: 10mm) [TI02] — Avail: 8 Nos (On Hand: 10)`.
   - **Inbound GRN Modal**:
     - Default `Update product catalog standard cost price to this unit cost` (`grnUpdateCost`) to `false`, while always recording `last_landed_cost` and `last_grn_ref` on the product in `processStockGrn`.
     - Provide a clean Supplier/Vendor selector (linked to workspace `companies` + custom input) and Open Supplier PO / Delivery Note reference selector in a compact 2-column layout so the entire GRN modal fits at 100% zoom without vertical slicing.
   - **Stock Movement Ledger Modal**:
     - Resolve missing `movement.product_name` on historical records (`PROJECT_VOID` / `STOCK_RELEASE`) by looking up `products.find(p => p.id === m.product_id)?.name` (falling back to `"Linked Project Stock Item"`).
     - Render clear reservation impact badges for `STOCK_RESERVE` (`Reserved: +2 (Avail: 10 → 8)` in amber) and `STOCK_RELEASE` (`Released: -1 (Avail: 3 → 4)` in indigo) instead of confusing `10 → 10` physical on-hand numbers.
     - Widen the Ledger modal to `max-w-6xl` with compact cell padding so all columns including `User` fit without horizontal scrolling.

---

## 2. Visual Direction & Domain Ergonomics

- **High-Density B2B ERP Scannability**: Clean white surfaces (`#FFFFFF`) with `1px` structural borders (`border-slate-200`), compact row density, and `tabular-nums` (`font-mono`) for all SKUs, stock quantities, unit costs, selling prices, and margins.
- **Semantic Status Tokens**:
  - **Indigo (`bg-indigo-50 text-indigo-700 border-indigo-200`)**: Spec Variant family badges, differentiating specification pills, and released reservation indicators.
  - **Emerald (`bg-emerald-50 text-emerald-700 border-emerald-200`)**: Healthy available stock, positive gross margin ($\ge 20\%$), and inbound GRN receipts.
  - **Amber (`bg-amber-50 text-amber-800 border-amber-200`)**: Low-stock alerts and active order stock reservations.
- **Standing Guardrail Compliance**:
  - Zero duplicate `+ +` icons across all buttons.
  - Universal row click-to-view/edit with `e.stopPropagation()` on row action buttons.
  - 100% zoom viewport fit across all tables and modals with zero horizontal scrollbars or vertically sliced inputs.

---

## 3. File-by-File Execution Plan

1. **`src/utils/productVariantFormat.ts`**:
   - Enhance `buildCatalogVariantAnalysisMap` to group sibling variants by `variant_parent_id` parent chains as well as `product_family` and normalized `name`.
   - Expose `isVariant`, `isVariantFamily`, `familyDisplayName`, `differentiatingKeys`, `differentiatingAttributes`, and `sharedAttributes` on `ProductVariantAnalysis`.
   - Refine `formatProductVariantSelectorLabel` to format stock cleanly once (`Avail: X UOM (On Hand: Y)` or `Non-Stock`) without duplicating caller text.
2. **`src/services/inventoryService.ts`**:
   - Update `processStockGrn` to always persist `last_landed_cost` and `last_grn_ref` on the catalog product when `unitCost > 0`, while only overwriting standard `cost_price` when `data.update_cost_price` is explicitly `true`.
3. **`src/components/quotations/CompositePackageEditor.tsx`**:
   - Remove the duplicate `+` from `+ Add Included Accessory (No Extra Charge)`.
   - Reflow Priced Sub-Component rows so `Application / Scope Note`, `Catalog SKU` link/stock pills, and `Photo / PDF Layout & Spacer` controls sit in a clean 2-line structure without horizontal overflow.
4. **`src/components/ProductManager.tsx`**:
   - De-crowd `<PageHeader>` and tighten Catalog table columns and action buttons so the table fits 100% width with zero horizontal scrollbar.
   - Fix stuck `UNIT (UOM)` custom input state, ensure standard UOM options are always available, and add a `Cancel` (`<X />`) button to custom UOM entry.
   - Remove the redundant intermediate product summary card in the 3-tab product modal, move live pricing/SKU badges into the modal header, and widen the modal to `max-w-4xl`.
   - Polish the Inbound GRN modal (`grnUpdateCost` defaulting to `false`, vendor/PO selector, compact 2-column grid), Quick Stock Adjustment dropdown labels, and Stock Movement Ledger modal (`max-w-6xl`, product name fallback lookup, and `STOCK_RESERVE` / `STOCK_RELEASE` availability impact display).
5. **Verification**:
   - Run `compile_applet` to verify zero TypeScript or build errors.
