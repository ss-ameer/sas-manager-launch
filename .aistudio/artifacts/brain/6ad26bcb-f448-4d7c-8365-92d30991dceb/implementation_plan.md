# Comprehensive Image Systems & Visual Media Architecture Plan

## 1. Executive Summary & Architectural Goals

This plan upgrades how product images, technical diagrams, BOM sub-component thumbnails, custom block visuals, and branding media are uploaded, adjusted, and rendered across the application—with a primary focus on **formal A4 Quotations** and **strict UI/UX spatial discipline**.

### Core Design Decisions (Aligned with Your Preferences)
1. **Local Per-Quote Overrides + One-Click Catalog Sync**: Adding a secondary technical diagram, caption, or visual adjustment on an Enquiry or Quotation line item remains local to that deal by default, accompanied by a one-click **Sync Media to Catalog** action inside the item's Image Options popover when linked to a catalog product.
2. **Photo Schedule Flow & Dedicated Annex Toggle**: When `Bottom Photo Schedule / Visual Grid` mode is selected, the labeled photo grid (`2-col` or `3-col`) flows naturally below the commercial line-items table by default, with a **Start Photo Schedule on New Annex Page** toggle in the Table Inspector.
3. **Non-Destructive Image Adjustments + Optional Bake**: Rotation (`0° | 90° | 180° | 270°`), zoom/padding scale, and background fill (`transparent | white | slate`) are stored as lightweight non-destructive metadata (`image_adjustments`) for instant preview and reversal, alongside a **Bake & Re-Upload Rotation** button inside the Lightbox when a permanent file transformation is desired.

---

## 2. Anti-Cramming & Progressive Disclosure UI Architecture

To ensure **zero visual clutter or layout overflow** in narrow side drawers (`320px–400px`) and split-pane editors:

```
+-----------------------------------------------------------------------------------+
| #1  [Thumb]  [🖼 Opts]   Item Name / Model Input            Qty    Unit    Rate   |
|              +-------------------------------------------+                        |
|              | IMAGE OPTIONS & OVERRIDES (Popover/Panel) |                        |
|              |-------------------------------------------|                        |
|              | [Primary Photo]     [+ 2nd Tech Diagram]  |                        |
|              | [🔍 Zoom / Rotate]  [↻ Sync to Catalog]   |                        |
|              |-------------------------------------------|                        |
|              | Placement Override  | Size Override       | (2-col grid-cols-2)    |
|              | [Inherit Table  v]  | [Inherit (MD)    v] |                        |
|              | Aspect Ratio        | Frame / Background  |                        |
|              | [Inherit (1:1)  v]  | [White Card      v] |                        |
|              |-------------------------------------------|                        |
|              | Caption: [Fig 1.1: Dimensional Layout   ] |                        |
|              +-------------------------------------------+                        |
+-----------------------------------------------------------------------------------+
```

### Spatial Guardrails
* **Line Item Cards (`EnquiryForm`, `EnquiryDetail`, `CompositePackageEditor`, `QuotationStudioModal`)**:
  * Default card view shows only the **interactive thumbnail** (click to open Lightbox, drag-over or `Ctrl+V` to upload) and a compact **`Image Options`** badge button.
  * Clicking **`Image Options`** opens a clean, self-contained 2-column sub-panel/popover for per-item placement, size, aspect ratio, caption, and secondary technical drawing—keeping the main row uncluttered.
* **Quotation Studio Table Inspector (`~400px` Right Drawer)**:
  * Controls use strict `grid-cols-2` layouts, `min-w-0` containment, and compact segmented buttons with `whitespace-nowrap`.
* **A4 Table Numeric Column Protection (`QuotationDocument.tsx`)**:
  * `Qty`, `UOM`, `Unit Price`, and `Total` columns enforce minimum percentage/pixel widths and `whitespace-nowrap tabular-nums`.
  * When `Dedicated Image Column` is active, width is allocated from the `Description` column rather than squeezing numeric currency columns.

---

## 3. The 7 Implementation Pillars

### Pillar 1: Real-World Quotation Line-Item Image Layouts & Placement Modes
We will expand `QuotationPresetColumns` in `src/types.ts` and the rendering engine in `src/components/quotations/QuotationDocument.tsx` + `src/components/quotations/QuotationStudioModal.tsx`:

```
1. DEDICATED COLUMN          2. INLINE LEFT              3. INLINE RIGHT (Float)
+---+-------+-------------+  +---+--------------------+  +---+--------------------+
| # | Image | Description |  | # | [Img] Title        |  | # | Title        [Img] |
| 1 | [Img] | Title & Spec|  | 1 |       Specs...     |  | 1 | Specs...           |
+---+-------+-------------+  +---+--------------------+  +---+--------------------+

4. BELOW DESCRIPTION (Diagram Banner)       5. BOTTOM PHOTO SCHEDULE (2 or 3 Cols)
+---+------------------------------------+  +------------------+------------------+
| # | Title & Technical Specifications   |  | [   Image #1   ] | [   Image #2   ] |
| 1 | [   Wide Diagram / Dual Photos   ] |  | Item #1: Pump    | Item #2: Valve   |
+---+------------------------------------+  +------------------+------------------+
```

* **5 Placement Modes (`lineItemImageLayout`)**:
  1. `column` (`Dedicated Image Column`) — with configurable column position (`before_desc` vs `after_desc`) and **Smart Auto-Collapse** (automatically hides the column if zero visible items in that table have an image).
  2. `inline_left` (and legacy `'inline'`) — thumbnail beside item title and specs.
  3. `inline_right` — thumbnail floated cleanly to the top-right of the description cell so item titles and bullet specs remain 100% left-aligned.
  4. `below_specs` (`Below Description / Technical Diagram Banner`) — renders below the technical specifications block inside the description cell; ideal for wide schematics or side-by-side Primary Photo + Secondary Diagram.
  5. `photo_schedule` (`Bottom Photo Schedule / Visual Grid`) — keeps the commercial table 100% text-only and renders a structured 2-column or 3-column **Product Visual Schedule** (labeled `Item #1 — [Item Name]`, SKU, and caption) either directly below the table or on a dedicated Annex page (`photoScheduleNewPage?: boolean`).
* **Expanded Sizing & Styling Controls**:
  * **Sizes (`lineItemImageSize`)**: `xs` (`32px`), `sm` (`48px`), `md` (`72px`), `lg` (`110px`), `xl` (`160px`), or `custom` (`24px–280px` slider/input).
  * **Aspect Ratio (`lineItemImageAspectRatio`)**: `1:1` (Square), `4:3` (Standard), `16:9` (Wide Diagram), `auto` (Natural height).
  * **Fit & Frame (`lineItemImageObjectFit`, `lineItemImageBgFill`, `lineItemImageFrame`)**: `contain` vs `cover`; background fill (`transparent`, `white`, `slate`); frame style (`card`, `rounded`, `minimal`, `shadow`).

---

### Pillar 2: Per-Line-Item Image Overrides, Multi-Image & Zero-Placeholder Discipline
* **Zero Empty Box Guarantee**:
  * In `inline_left`, `inline_right`, `below_specs`, and `photo_schedule` modes, items without an image consume `0px` of image space—never printing an empty placeholder box.
  * In `column` mode, if some items have images and one does not, its cell renders a clean empty space (or subtle `—` only in interactive preview). If *no* items in the table have images, the entire `Image` column auto-collapses.
* **Per-Item Override Properties (`QuotationLineItem` & `LineItem`)**:
  * `image_display_override?: 'inherit' | 'column' | 'inline_left' | 'inline_right' | 'below_specs' | 'hidden'`
  * `image_size_override?: 'inherit' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'`
  * `image_aspect_override?: 'inherit' | '1:1' | '4:3' | '16:9' | 'auto'`
  * `image_caption?: string` (renders in crisp micro-typography below the image)
  * `secondary_image_url?: string` & `secondary_image_caption?: string` (allows showing both a product photo and a dimensional diagram side-by-side or stacked).
* **One-Click Sync to Catalog**:
  * When a line item is linked to a catalog `product_id` (or matched by SKU/name), the `Image Options` popover includes a **`Sync Media to Catalog`** button that updates the master `Product` record with the primary image, secondary image, caption, and adjustments.

---

### Pillar 3: Composite Package / BOM Sub-Component Image Controls
* **Sub-Component Image Support (`LineItemComponent`)**:
  * Extend `LineItemComponent` in `src/types.ts` with `image_url?: string`, `image_caption?: string`, and `image_adjustments?: ImageAdjustmentConfig`.
  * When adding a sub-component from the Product Catalog in `CompositePackageEditor.tsx`, automatically inherit its `product.image_url`.
  * Add a compact, non-intrusive `28x28px` thumbnail uploader/preview button inside each sub-component row in `CompositePackageEditor.tsx` (supporting click-to-upload, `Ctrl+V` paste, and Lightbox preview).
* **Independent Quotation Table Toggle**:
  * Add `bomSubComponentImageMode?: 'off' | 'small' | 'match_parent'` (default `'off'`) in the Quotation Studio Table Inspector so users can choose whether BOM child rows (`1.1`, `1.2`) display thumbnails or keep only the parent system photo visible.

---

### Pillar 4: App-Wide Clipboard Paste (`Ctrl+V`), Lightbox Modal & Non-Destructive Adjustments
* **Universal Reusable Components**:
  * Create `src/components/common/ImageLightboxModal.tsx` and `src/components/common/LineItemImageOptionsPopover.tsx`.
* **Clipboard Paste (`Ctrl+V`) & Drag-and-Drop Everywhere**:
  * Enhance image uploaders in `ProductManager.tsx`, `SaveToCatalogModal.tsx`, `EnquiryForm.tsx`, `EnquiryDetail.tsx`, `CompositePackageEditor.tsx`, and `QuotationStudioModal.tsx` so hovering/focusing an image slot and pressing `Ctrl+V` (or dropping a file) immediately compresses and uploads via `uploadWorkspaceMediaAsset`.
* **Interactive Lightbox & Non-Destructive Adjustments**:
  * Clicking any existing product/line-item thumbnail opens `ImageLightboxModal` showing the high-res image, SKU/Title, caption editor, and quick adjustment controls:
    * **Rotate `90°` Left / Right** (`rotation: 0 | 90 | 180 | 270`)
    * **Zoom / Padding Scale** (`scale: 0.75` to `1.5`)
    * **Background Fill** (`transparent | white | slate`)
    * **Bake Rotation & Re-Upload**: Optional one-click action that renders the rotated/padded image onto an HTML5 `<canvas>`, exports a clean PNG/WebP, and uploads the permanently transformed file via `uploadWorkspaceMediaAsset`.

---

### Pillar 5: Custom Block Images, Branding Assets & Annexes
* **Custom Block Image Pieces (`QuotationBlockPiece` where `type === 'image'`)**:
  * Upgrade the Lego Block Image Piece inspector in `QuotationStudioModal.tsx` and renderer in `QuotationDocument.tsx` with:
    * **Width Presets**: `25% | 50% | 75% | 100%` (plus custom height in `mm`).
    * **Alignment**: `Left | Center | Right`.
    * **Frame & Fit**: `Contain vs Cover`, `Minimal | Bordered Card | Rounded | Shadow`.
    * **Side-by-Side Dual Image**: Optional secondary image slot inside an Image Piece so two photos/diagrams can sit side-by-side with individual captions.
* **Full-Page Image Annexes**:
  * Ensure image attachments marked as Technical Annexes support both **Fit inside A4 Frame (with Header/Footer)** and **Full-Bleed A4 Page** modes cleanly without clipping.

---

### Pillar 6: A4 Print Pagination Reliability & Pre-Print Image Readiness
* **Pagination Height Estimator (`splitLineItemsIntoChunks` in `QuotationDocument.tsx`)**:
  * Upgrade `estimateParentRowHeightMm` and `estimateSubRowHeightMm` to calculate the exact vertical height contributed by `md`, `lg`, `xl`, `custom`, and `below_specs` images (converting `px` to `mm` at `3.78 px/mm`), preventing large diagrams from overflowing the bottom footer of an A4 sheet.
* **Pre-Print Image Readiness Check**:
  * Before triggering `window.print()` in `QuotationStudioModal.tsx`, await `img.decode()` / `complete` across all `<img>` elements inside `.quotation-print-root` (with a safe timeout fallback) so external bucket URLs never print as blank frames.

---

## 4. File-by-File Modification Summary

1. **`src/types.ts`**:
   * Add `ImageAdjustmentConfig` interface (`rotation`, `scale`, `bgFill`, `objectFit`).
   * Extend `Product`, `LineItem`, `QuotationLineItem`, and `LineItemComponent` with `secondary_image_url`, `image_caption`, `secondary_image_caption`, `image_adjustments`, and per-item override fields (`image_display_override`, `image_size_override`, `image_aspect_override`).
   * Extend `QuotationPresetColumns` with expanded placement modes, column position, smart auto-collapse, `xs`–`xl`/`custom` sizes, aspect ratio, frame style, BOM sub-component image mode, and photo schedule options.
   * Extend `QuotationBlockPiece` with `imageWidthPercent`, `imageFrameStyle`, `imageObjectFit`, `imageSecondaryUrl`, and `imageSecondaryCaption`.
2. **`src/components/common/ImageLightboxModal.tsx`** *(New)*:
   * Full-screen zoom modal with non-destructive rotation/scale/background controls, optional canvas "Bake & Re-Upload" button, caption input, and Replace/Remove triggers.
3. **`src/components/common/LineItemImageOptionsPopover.tsx`** *(New)*:
   * Compact progressive-disclosure popover/panel for line items providing Primary + Secondary image slots, `Ctrl+V` paste support, per-item layout/size/aspect overrides, caption input, and one-click **Sync Media to Catalog**.
4. **`src/components/quotations/QuotationDocument.tsx`**:
   * Implement all 5 placement modes (`column` before/after description with smart auto-collapse, `inline_left`, `inline_right`, `below_specs`, and `photo_schedule` 2/3-col visual grid).
   * Implement per-item overrides, secondary image side-by-side rendering, image captions, non-destructive CSS transforms, BOM sub-component images, custom block image width/frame enhancements, and image-aware A4 row-height pagination math.
5. **`src/components/quotations/QuotationStudioModal.tsx`**:
   * Upgrade the Table Inspector with a clean 2-column Image Layout & Styling section (`Placement Mode`, `Column Position`, `Size`, `Aspect Ratio`, `Frame/Fit`, `BOM Sub-Images`, `Photo Schedule Options`).
   * Integrate `LineItemImageOptionsPopover` and `ImageLightboxModal` into the Deal Data & Content line-item cards and Lego Custom Block image pieces.
   * Add pre-print image decode readiness check before `window.print()`.
6. **`src/components/quotations/CompositePackageEditor.tsx`**:
   * Add sub-component thumbnail preview, upload, `Ctrl+V` paste, and catalog image inheritance.
7. **`src/components/ProductManager.tsx` & `src/components/SaveToCatalogModal.tsx`**:
   * Add `Ctrl+V` clipboard paste, Lightbox preview, non-destructive adjustments, and Secondary Image (Technical Drawing) upload support on Catalog Products.
8. **`src/components/EnquiryForm.tsx` & `src/components/EnquiryDetail.tsx`**:
   * Integrate progressive-disclosure `LineItemImageOptionsPopover`, `ImageLightboxModal`, and `Ctrl+V` paste on enquiry line items, plus full forward-propagation of all new image fields when converting an Enquiry to a Quotation.
