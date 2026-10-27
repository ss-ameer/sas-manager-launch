# Products Catalog, Inventory System & Quotation Integration Overhaul Plan

## 1. Architectural Audit Findings

1. **Custom Bucket Storage (`src/services/attachmentStorage.ts`)**:
   - Currently, `uploadToSupabaseStorage(file, storageConfig, onProgress)` hardcodes the bucket path prefix to `enquiries/${Date.now()}_${cleanFileName}` and only handles enquiry `Attachment[]` arrays.
   - Meanwhile, Quotation Studio branding assets (Company Logos, Stamps, Digital Signatures, Cover Pages/Annexes) in `QuotationStudioModal.tsx` and `SettingsModal.tsx` are converted directly to inline Base64 data-URIs inside Firestore documents, which risks exceeding Firestore's 1 MB document size limit when combined with 15–30 line-item product images.
2. **Product Schema & Cross-Module Parity (`src/types.ts`, `ProductManager.tsx`, `EnquiryForm.tsx`, `QuotationDocument.tsx`)**:
   - `Product` currently stores `name`, `sku`, `category`, `description`, `unit_price`, `cost_price`, `unit`, `attributes`, `hs_code`, `country_of_origin`, `track_inventory`, `stock_on_hand`, `stock_allocated`, and `stock_on_order`.
   - It lacks `brand_make`, `model_part_no`, `default_availability`, `min_stock_threshold`, `image_url`, and `datasheet_attachment` (`Attachment`), forcing users to re-type Brand/Make, Model/Part #, and Availability on every Enquiry/Quotation line item.
   - `LineItem` (Enquiry) and `QuotationLineItem` (Quotation) also lack `image_url`, `datasheet_attachment`, `include_datasheet_in_quote`, `country_of_origin`, and `hs_code` propagation from the catalog.
3. **Products Catalog Top Clipping & Table UX (`src/App.tsx`, `src/components/layout/PageHeader.tsx`, `src/components/ProductManager.tsx`)**:
   - In `src/App.tsx`, `<main className="flex-1 h-screen overflow-y-auto flex flex-col">` has a sticky top workspace bar (`<header className="sticky top-0 z-30">`). Inside `<main>`, `PageHeader.tsx` also applies `sticky top-0 z-20`, causing `PageHeader` to stick at `top: 0` directly *underneath* the `App.tsx` top bar and clipping the Products Catalog header and KPI cards when scrolling.
   - Category pills wrap awkwardly on multi-word categories, product rows lack visual thumbnails and Brand/Model badges, and the `"Custom Price"` / `"Custom Unit"` labels in the modal are confusing.
4. **Hardcoded Industry Attributes (`src/components/ProductManager.tsx`)**:
   - The Register/Edit Product modal hardcodes water-treatment attribute chips (`Membrane Size`, `Flow Rate (GPD)`, `Salt Rejection`, `Housing Material`, `Port Size`, `Operating Pressure`, `Micron Rating`, `Power / Voltage`), which makes the catalog feel rigid for multi-tenant public SaaS users across other industries.
5. **Inventory Terminology & Soft-Delete UX (`src/components/ProductManager.tsx`, `src/components/TrashBinModal.tsx`)**:
   - The Product Modal says `"Track Warehouse Stock"` while the Inbound GRN Modal says `"Track Inventory & Physical Stock"` and hides untracked products until a checkbox is ticked.
   - `handleDeleteProduct` performs a soft delete (`is_deleted: true`), but its confirmation prompt misleadingly states `"This is irreversible"` instead of informing the user that the product moves to the Recycle Bin, and `TrashBinModal.tsx` displays `p.description` instead of `p.name || p.description`.

---

## 2. Implementation Plan Across the 7 Core Pillars

### Pillar 1: Unified Custom Bucket Storage for Product Media & Studio Assets
- **Upgrade `src/services/attachmentStorage.ts`**:
  - Add a folder-aware upload helper `uploadAssetToBucket(fileOrBlob, folder, storageConfig, onProgress)` supporting structured paths:
    - `products/images/` (compressed WebP/JPEG/PNG product photos)
    - `products/datasheets/` (PDF/image technical spec sheets & submittals)
    - `branding/logos/`, `branding/stamps/`, `branding/signatures/`
    - `quotations/annexes/` and `enquiries/`
  - Add client-side image compression (`compressImageForUpload(file, maxDimension, quality)`) before uploading to the custom Supabase/S3-compatible bucket so product thumbnails and branding assets render instantaneously inside the A4 PDF print engine.
  - Provide automatic graceful fallback: if the workspace has not configured a Custom Storage Bucket or is offline, store a compact compressed image or local IndexedDB reference (`idb://`) and cleanly resolve URLs when rendering.
- **Route Quotation Studio & Settings Branding Uploads Through Bucket**:
  - Update logo, stamp, signature, and PDF annex upload handlers in `QuotationStudioModal.tsx` and `SettingsModal.tsx` to upload via `uploadAssetToBucket` when custom storage is configured, storing the clean HTTPS URL in Firestore.

### Pillar 2: Product Images & End-to-End Quotation Line-Item Image Rendering
- **Product Image Management**:
  - Add `image_url?: string` to `Product`, `LineItem`, and `QuotationLineItem` in `src/types.ts`.
  - Support drag-and-drop file upload (compressed & uploaded to Custom Bucket), direct image URL input, preview, and removal in the Register/Edit Product Modal, plus per-line-item image override in Enquiry Form and Quotation Studio (`Deal Data & Content` tab + Line Item Editor).
- **Quotation Studio Line Items Table Image Modes & Sizing**:
  - Extend `QuotationTemplateConfig` in `src/types.ts` with:
    - `showLineItemImages?: boolean`
    - `lineItemImageLayout?: 'column' | 'inline'` (`Dedicated Image Column` vs `Inline Thumbnail beside Item Title & Specs`)
    - `lineItemImageSize?: 'sm' | 'md' | 'lg'` (`32px`, `48px`, `64px`)
  - Add these controls to the **Line Items Table Inspector** (Right Drawer) and Left Drawer in `QuotationStudioModal.tsx`.
  - Render crisp, aspect-ratio-preserved product thumbnails in `QuotationDocument.tsx` across both `column` and `inline` modes with print-safe styling.

### Pillar 3: Full Data & Schema Parity (Catalog ↔ Enquiry ↔ Quotation)
- **First-Class Catalog Fields**:
  - Expand `Product` in `src/types.ts` and `ProductManager.tsx` with:
    - `brand_make?: string` (Brand / Make)
    - `model_part_no?: string` (Model / Part #)
    - `default_availability?: string` (e.g., `Ex-Stock`, `2–3 Weeks`, `4–6 Weeks`, `Made to Order`, or custom)
    - `country_of_origin?: string` & `hs_code?: string`
    - `unit_price?: number` (`Default Selling Price`), `cost_price?: number` (`Unit Cost Price`), and live **Gross Margin % & Markup %** indicator badge
    - `unit?: string` (`Unit of Measure` with quick presets + custom input, replacing the confusing `"Custom Price"` / `"Custom Unit"` labels)
    - `datasheet_attachment?: Attachment` (Technical Datasheet / Spec Sheet PDF or image uploaded to Custom Bucket)
- **Auto-Propagation & Technical Datasheet Annex Carry-Over**:
  - Selecting a catalog product in `EnquiryForm.tsx` or `QuotationStudioModal.tsx` automatically populates `brand_make` (`brand`), `model_part_no` (`part_no`), `default_availability` (`availability`), `country_of_origin`, `hs_code`, `unit_price`, `unit`, `image_url`, `attributes`, and `datasheet_attachment`.
  - When a line item has a `datasheet_attachment`, automatically include it in the Quotation's **Attached Submittals / Technical Annexes** with a per-line toggle (`include_datasheet_in_quote?: boolean`, defaulting to `true`) so users can include or exclude individual product spec sheets with 1 click.

### Pillar 4: Multi-Tenant SaaS Flexibility for Attributes, Categories & Cloning
- **Dynamic Workspace-Aware Attribute Chips**:
  - Remove hardcoded water-treatment attribute pills from `ProductManager.tsx`.
  - Dynamically derive quick-add specification pills from existing attributes used in the workspace (prioritizing attributes used within the currently selected Category), plus allow users to add or remove custom quick-attribute suggestions for their workspace.
- **1-Click Duplicate / Clone Product**:
  - Add a **Duplicate / Clone** action button on every product row in `ProductManager.tsx` that opens the Register Product Modal pre-filled with the source product's specs, category, brand, pricing, and attributes (with `(Copy)` appended to the name and a fresh auto-generated or editable SKU) for rapid variant creation.

### Pillar 5: Products Catalog UI/UX, Scroll Clipping Fix & 3-Tab Modal Redesign
- **Fix Sticky Header & KPI Card Clipping**:
  - Update the layout container between `src/App.tsx` and `src/components/layout/PageHeader.tsx` so `<main>` keeps the top workspace bar fixed in a flex column while the inner content viewport scrolls independently (or adjust sticky offset), completely eliminating the overlap where `PageHeader` and KPI cards get clipped behind the top bar.
- **Catalog Table Polish**:
  - Add product thumbnail avatars (`40x40` rounded frame with category icon fallback) on the left of every product row.
  - Display `Brand / Make` and `Model / Part #` pills alongside the SKU badge.
  - Fix category badge text wrapping with `whitespace-nowrap`.
  - Standardize the right-aligned `Actions` column: `Receive Stock (GRN)`, `Adjust Stock`, `Duplicate`, `Edit`, and `Delete`.
- **Redesigned 3-Tab Register / Edit Product Modal (`max-w-3xl`) with Live Header Summary Card**:
  - **Live Header Summary Card**: Shows live product thumbnail preview, Product Title, SKU, Category badge, Brand/Model, Selling Price, Margin % pill, and Stock status pill as the user types.
  - **Tab 1 — Overview & Pricing**: Product Name, SKU (with 1-click Auto-Generate SKU button), Category selector + inline new category creator, Brand / Make, Model / Part #, Description, Default Selling Price, Unit Cost Price, live Margin/Markup calculator card, and Unit of Measure selector.
  - **Tab 2 — Specs, Image & Datasheet**: Product Image uploader (Bucket upload + URL + live preview), Technical Datasheet / Spec Sheet uploader (PDF/Image to Bucket), and Dynamic Technical Specifications builder with category-aware quick chips.
  - **Tab 3 — Inventory & Logistics**: Unified `Track Inventory & Physical Stock` toggle, Opening / Current Stock on Hand, Minimum Stock Alert Threshold (`min_stock_threshold`), Default Lead Time / Availability, Country of Origin, and HS Code.

### Pillar 6: Unified Inventory, Quick Stock Adjustments & Live Enquiry Stock Badges
- **Unified Terminology & Auto-Enable on GRN**:
  - Standardize terminology to **"Track Inventory & Physical Stock"** across the Product Modal, GRN Modal, and Stock Ledger.
  - In the Inbound GRN Modal, allow selecting any catalog product and automatically enable `track_inventory: true` if a GRN is recorded for a previously untracked product.
- **Quick Stock Adjustment Modal & Minimum Stock Alert Filter**:
  - Add a **Quick Stock Adjustment Modal** accessible from each product row and inside the Stock Ledger Modal supporting:
    - `Opening Stock / Initial Count`
    - `Physical Recount (Set Exact On-Hand Qty)`
    - `Damage / Write-Off / Scrap (Deduct Qty)`
    - `Manual Addition / Return`
    with required reference/reason notes recorded as an `ADJUSTMENT` entry in `stock_movements`.
  - Add `min_stock_threshold?: number` per product and a **Low Stock** filter chip in `ProductManager.tsx` highlighting items where `Available Stock <= min_stock_threshold`.
- **Live Stock Availability Badges in Enquiries & Quotations**:
  - When picking or viewing products in `EnquiryForm.tsx` and `QuotationStudioModal.tsx`, display live stock pills (`Available: X [Unit]`, `Low Stock: X`, `Out of Stock`, or `Order-to-Order / Non-Stock`) and warn if line-item quantity exceeds available stock.

### Pillar 7: Safe Deletion & Recycle Bin Integration
- **Clear Soft-Delete Messaging & Recycle Bin Restoration**:
  - Update the Delete Product confirmation modal in `ProductManager.tsx` so it clearly states that the product will be moved to the **Recycle Bin** (and can be restored anytime) while preserving historical Enquiries, Quotations, and Stock Ledger entries.
  - Fix `src/components/TrashBinModal.tsx` so deleted products display their `name` (`p.name || p.description`), SKU, and Brand, and can be cleanly restored or permanently purged.
