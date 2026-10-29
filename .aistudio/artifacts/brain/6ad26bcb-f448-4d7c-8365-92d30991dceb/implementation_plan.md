# Universal B2B SaaS Multi-Component Package (BOM) & Multi-Option Architecture Plan

## 1. Product & Architectural Overview
Transition the Multi-Component Set / Package (BOM) and Multi-Option Quotation capabilities from a project-specific preset (`kingSaudTankPreset.ts`) into a **100% generic, standardized, multi-tenant B2B SaaS architecture** integrated across the **Products Catalog**, **Enquiries & Proposals**, **Inventory & Stock Ledger**, and **Quotation Studio**.

### Alignment with Clarified Requirements
- **Catalog Sub-Component Price Behavior**: Sub-components linked to Catalog Products snapshot their cost/selling price upon linking and display a **1-click `[ ↻ Refresh from Catalog ]`** action when catalog prices change.
- **Multi-Option Inventory Reservation**: When an Enquiry is marked Won, stock reservation (`reserveEnquiryStock`) and project dispatch (`dispatchProjectStock`) process only active/selected option items (defaulting to `Default / Included` and `Option A` unless a specific winning option is designated), preventing duplicate stock locks across mutually exclusive options.
- **Multi-Option Commercial Summary**: When a Quotation displays separate Option tables (`Option A`, `Option B`, `Option C`), the Financial Summary renders **per-option summary cards** (`Subtotal Excl. VAT`, `5% VAT`, `Option Net Total`) alongside a **toggleable Combined Grand Total** row.

---

## 2. Pillar-by-Pillar Implementation Specification

### Pillar 1: Remove Hardcoded Client Preset & Standardize Universal SaaS Terminology
1. **Replace `/src/utils/kingSaudTankPreset.ts` with `/src/utils/compositeBomUtils.ts`**:
   - Delete `/src/utils/kingSaudTankPreset.ts`.
   - Create `/src/utils/compositeBomUtils.ts` containing pure, reusable BOM & Option utilities:
     - `recalculateCompositeItemTotals(components, parentQty)`
     - `applyMarkupToSubComponents(components, markupPercent)`
     - `parseBulkSubComponentsText(rawText)` (smart TSV/CSV/multi-line clipboard parser)
     - `cloneLineItemToNextOption(item, existingItems)` (deep-clones a line item and its `sub_components` with fresh IDs and assigns the next logical Option Group: `Default` → `Option A` → `Option B` → `Option C`)
     - `getEffectiveWinningOptionFilter(lineItems, selectedWinningOption)` (determines which items/sub-components participate in baseline deal totals and stock reservation)
2. **Remove All Project-Specific Preset Buttons & Imports**:
   - Remove `⚡ Load King Saud STP` buttons, handlers, and imports from `EnquiryForm.tsx`, `EnquiryDetail.tsx`, and `QuotationStudioModal.tsx`.
3. **Universal B2B SaaS Microcopy Standardization**:
   - Update `CompositePackageEditor.tsx`, `QuotationDocument.tsx`, `QuotationStudioModal.tsx`, `EnquiryForm.tsx`, and `EnquiryDetail.tsx` to use industry-agnostic terminology:
     - `Single Item` vs. `Composite Package / Kit (BOM)`
     - `Sub-Components & Priced Items`
     - `Included Accessories & Zero-Price Sub-Items`
     - `Component Name / Spec`, `Application / Scope Note`, `Supplier Cost`, `Selling Rate`

---

### Pillar 2: First-Class Composite Package / BOM Support in `Products Catalog` (`ProductManager.tsx`)
1. **Extend `LineItemComponent` & `Product` in `/src/types.ts`**:
   - Add `product_id?: string` and `sku?: string` to `LineItemComponent` so sub-components inside a BOM can link directly to existing Catalog Products.
   - Add `option_group_titles?: Record<string, string>` and `show_combined_options_total?: boolean` to `Enquiry` and `QuotationConfig` so custom option headers (e.g., `Option A — Standard Configuration`, `Option B — Premium Configuration`) persist cleanly.
2. **Upgrade Register / Edit Product Modal (`ProductManager.tsx`)**:
   - Add a prominent segmented selector at the top of the Product Modal:
     - `Standard Single Product` vs. `Composite Package / Kit (BOM)`
   - When `Composite Package / Kit (BOM)` is active:
     - Widen the modal container (`max-w-5xl`) for comfortable multi-column BOM editing.
     - Embed `CompositePackageEditor` directly inside the modal so users can add/edit priced sub-components, included zero-price accessories, default `package_pricing_mode` (`itemized` vs. `lump_sum`), global markup %, and `option_scope_notes`.
     - Auto-sync the calculated BOM `packageUnitPrice` and `packageCostPrice` into the product's `unit_price` and `cost_price` fields.
3. **Catalog Sub-Component Linking & Price Snapshot Refresh**:
   - Pass `products` into `CompositePackageEditor.tsx`.
   - On each sub-component row (and in the section header), provide a **`[ 🔗 Link Catalog SKU ]`** searchable popover that populates `product_id`, `sku`, `item_name`, `unit`, `cost_price`, and `unit_price` as a snapshot.
   - If a linked catalog product's current `unit_price` or `cost_price` differs from the snapshot, display an inline **`[ ↻ Refresh from Catalog ]`** button to sync the latest catalog rate on demand.
4. **Catalog Table & Picker Badges**:
   - Display a clean structural indicator (`Kit / BOM · N components`) in `ProductManager.tsx` (plus a filter tab for `Kits / BOMs`) and in all Catalog Picker dropdowns across `EnquiryForm.tsx`, `EnquiryDetail.tsx`, and `QuotationStudioModal.tsx`.
   - Selecting a Composite Package from any Catalog Picker deep-clones its `sub_components` (with fresh IDs), `is_composite_set: true`, `package_pricing_mode`, and `option_scope_notes` onto the Enquiry/Quotation line item.

---

### Pillar 3: Universal Productivity Tools — Bulk Paste Importer & 1-Click Option Cloning
1. **Bulk Paste / Table Importer (`[ 📋 Paste Sub-Components ]`) in `CompositePackageEditor.tsx`**:
   - Clicking `[ 📋 Paste Sub-Components ]` opens an inline modal/drawer where users can paste tab-separated (Excel/Sheets) or pipe/comma-separated rows.
   - Automatically parses columns (`Component Name / Spec`, `Application / Scope Note`, `Qty`, `Unit`, `Supplier Cost`, `Selling Rate`) and detects zero-price / `"Included"` rows as `is_included_accessory: true`.
   - Shows a live preview table before appending or replacing sub-components.
2. **1-Click Clone to Next Option (`[ 🔀 Clone as Next Option ]`)**:
   - Add a 1-click `[ 🔀 Clone as Option B ]` (or next available option) action button on every line item card in `EnquiryForm.tsx`, `EnquiryDetail.tsx`, and `QuotationStudioModal.tsx`.
   - Clones the line item and all BOM sub-components with new unique IDs, sets `option` to the next option group (`Option A` → `Option B` → `Option C`), and scrolls/focuses the newly created option card for rapid variant pricing.

---

### Pillar 4: Customizable Multi-Option Group Titles & Commercial Summary Controls
1. **Custom Option Group Titles (`option_group_titles`)**:
   - Whenever an Enquiry or Quotation contains items assigned to `Option A`, `Option B`, `Option C`, or `Optional Add-on`, render an **Option Group Headers Bar** allowing the user to customize the display title for each option (e.g., `Option A: Stainless Steel 316L Package`, `Option B: Carbon Steel Epoxy Coated Package`).
   - Persist `option_group_titles` on both `Enquiry` and `QuotationConfig`.
2. **Quotation Studio Inspector & Financial Summary Controls (`QuotationStudioModal.tsx` & `QuotationDocument.tsx`)**:
   - In the Quotation Studio Right Inspector (`Line Items Table` section), add:
     - **Option Display Mode**: `Separate Option Tables (A, B, C)`, `Combined Single Table`, or `Single Option Filter (Option A / B / C Only)`.
     - **Editable Option Group Titles**: Inline inputs for each active option group's table banner heading.
     - **Multi-Option Summary Toggle**: `Show Per-Option Comparison Cards` (enabled by default when multiple options exist) + `Show Combined Grand Total Across All Options` toggle (`show_combined_options_total`).

---

### Pillar 5: Inventory Roll-Up & Stock Visibility for Composite Bundles
1. **Live Stock Visibility Inside `CompositePackageEditor.tsx`**:
   - When a sub-component has a linked `product_id` pointing to an inventoried catalog product (`is_inventoried: true`), display its live available stock (`Available: X vs. Required: Parent Qty × Sub Qty`) directly on the sub-component row.
2. **Composite Sub-Component Roll-Up in `/src/services/inventoryService.ts`**:
   - Create a helper `extractInventoriedStockRequirements(lineItems, winningOptionFilter)` in `inventoryService.ts`:
     - Filters line items to only active/winning options (`Default / Included` and `Option A`, or the explicitly designated winning option).
     - For standard line items with `item.product_id`, requires `item.quantity`.
     - For composite packages (`item.is_composite_set && item.sub_components?.length`), iterates over linked `sub_components` with `sub.product_id`, requiring `(Number(item.quantity) || 1) * (Number(sub.quantity) || 0)` and aggregating quantities by `product_id`.
   - Update `reserveEnquiryStock`, `releaseEnquiryStock`, and `dispatchProjectStock` to use this roll-up helper so stock reservations, releases, and project dispatches accurately track physical sub-components inside BOM kits.

---

### Pillar 6: Visual & Typography Integration on the A4 Document (`QuotationDocument.tsx`)
1. **Theme & Typography Compliance**:
   - Ensure all sub-component rows (`1.1`, `1.2`, etc.), included accessory rows, `option_scope_notes` callout boxes, and Option Group Header banners inherit the active `fontFamily`, `typoScale`, `themePalette`, `tableHeaderStyle`, and `tableDensity`.
2. **Multi-Page A4 Pagination & Page-Break Safety**:
   - Apply `break-inside: avoid` (`page-break-inside: avoid`) to individual `<tr>` sub-component rows and option summary cards, while keeping `break-inside: auto` on the `<table>` container so large 15+ row BOM packages split cleanly across A4 page boundaries with repeating `<thead>` headers.

---

## 3. Files to Create / Modify / Delete
- **Delete**: `/src/utils/kingSaudTankPreset.ts`
- **Create**: `/src/utils/compositeBomUtils.ts`
- **Modify**:
  - `/src/types.ts`
  - `/src/components/quotations/CompositePackageEditor.tsx`
  - `/src/components/ProductManager.tsx`
  - `/src/components/SaveToCatalogModal.tsx`
  - `/src/components/EnquiryForm.tsx`
  - `/src/components/EnquiryDetail.tsx`
  - `/src/components/quotations/QuotationStudioModal.tsx`
  - `/src/components/quotations/QuotationDocument.tsx`
  - `/src/services/inventoryService.ts`
