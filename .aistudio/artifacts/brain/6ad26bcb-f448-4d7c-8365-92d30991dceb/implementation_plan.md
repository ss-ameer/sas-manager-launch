# Stage 1 Polish: Tooltips, Team Roster, Products Catalog & Spec Variants

## 1. `<FieldHelpHint />` Double-Tooltip Fix & Label Simplification
- **`src/components/common/FieldHelpHint.tsx`**:
  - Remove the native browser `title={hint}` attribute on the `<button>` trigger so hovering or focusing displays only the custom styled floating popover without a duplicate browser tooltip.
- **`src/components/ProcurementPayablesHub.tsx` & `src/components/EnquiryDetail.tsx`**:
  - Strip redundant `<FieldHelpHint />` icons from self-explanatory labels (`Select Vendor from Directory`, `Supplier / Vendor Legal Name`, `Expected Delivery Date`, `PO Line Items`, `Vendor Invoice #`, `GRN Number`, `Receipt Date`, `Payee / Vendor Legal Name`, `Supplier / Vendor Name`, `Contact Person`).
  - Retain `<FieldHelpHint />` strictly where it shortens verbose explanatory labels (`Link to Enquiry`, `Landed Cost Mode`, and `Link to Supplier Bill`).
- **`src/components/SalespersonProfiles.tsx`**:
  - In the `Edit Your Profile` / `Add Team Member` modal, replace `"Salesperson Email (Excludes from client contact detection)"` with `"Email Address"` + `<FieldHelpHint />` and `"Salesperson Direct Phone / Mobile (Excludes from client contact detection)"` with `"Direct Phone / Mobile"` + `<FieldHelpHint />`.

## 2. Team Roster (`src/components/SalespersonProfiles.tsx`) Confidentiality & UX Polish
- **Confidential Deal Value Protection in `Linked Enquiries`**:
  - Replace the broad workspace read check on each row with a dedicated profile-level visibility check: a non-admin `Member` viewing another rep's profile can only see the `AED` value and open the enquiry if they are the record owner, assigned rep, or an explicit collaborator (`collaborators` / `shared_with`).
  - For unshared enquiries on another rep's profile, mask the deal value as `AED ••••` (`Confidential`) and disable row click-through while still displaying the enquiry title, project, and status badge.
  - For enquiries on another rep's profile that are shared with the viewing user, display a **`Shared with You`** badge and allow 1-click navigation to the enquiry.
- **Role Fallback, Header Alignment & Pipeline Filtering**:
  - Provide a clean role fallback (`Sales Representative`) whenever a team member's `role` field is blank.
  - Add status filter pills (`All`, `Active`, `Won`, `Lost`) and sort controls (`Newest`, `Highest Value`, `Updated`) directly above the `Linked Enquiries` list.

## 3. Products Catalog UI/UX & Modal Layout Overhaul (`src/components/ProductManager.tsx`)
- **Sticky Header Clearance, Column Headers & Clickable Rows**:
  - Adjust sticky header / toolbar spacing so the search and category filter bar never clips behind `<PageHeader>` on scroll.
  - Shorten the `Brand / Model / SKU` column header to `Brand / SKU` with `whitespace-nowrap` so it never wraps onto multiple vertical lines.
  - Make every product table row clickable (`cursor-pointer`) to open the product editor/viewer modal, with `e.stopPropagation()` on all row action buttons.
- **Compact `Edit Catalog Product` Modal & Top-Surfaced Specs**:
  - Make the top product summary banner inside `Edit Catalog Product` more compact and tighten vertical spacing in Tab `1. Overview & Pricing` so `UNIT (UOM)`, `SELLING PRICE`, and `BASE COST PRICE` fit cleanly at 100% zoom without slicing.
  - Reorder Tab `2. Specs, Image & Datasheet` so the **Technical Specifications / Attributes (`S1, S2, S3`)** editor appears at the top of the tab, followed by a compact side-by-side uploader for Product Image and Technical Datasheet.

## 4. Product Spec Variants & Variation System (`src/types.ts`, `src/components/ProductManager.tsx`, `src/components/EnquiryDetail.tsx`, `src/components/ProcurementPayablesHub.tsx`, `src/components/quotations/QuotationStudioModal.tsx`)
- **Data Model & Variant Helper (`src/types.ts` & `src/utils/productVariantFormat.ts`)**:
  - Add optional `variant_parent_id?: string | null` and `product_family?: string | null` fields to `ProductRecord` (and automatic family detection by normalized base product name `I1` so existing products work automatically).
  - Create a shared formatting utility that computes differentiating spec keys across sibling variants (e.g. `S3: 15-20` vs `S3: 20-40`) and formats selector labels cleanly across the app: `I1 (S3: 15-20 • S1: Black, S2: 1.1) [SKU] — Stock: 4`.
- **1-Click `+ Add Spec Variant` Flow (`src/components/ProductManager.tsx`)**:
  - Add a `+ Add Spec Variant` button on product table rows and inside the `Edit Catalog Product` modal header.
  - Clicking `+ Add Spec Variant` opens the modal pre-filled with the exact base product name (`I1`, without appending `(Copy)`), category, brand, description, and cloned spec attributes (`S1, S2, S3`), opening directly on Tab `2. Specs, Image & Datasheet` with quick inline inputs for **SKU Code**, **Selling Price**, **Cost Price**, and **Opening Stock** at the top so creating a new spec variation takes seconds.
- **Smart Spec Diff Highlighting & `Group Variants` Toggle (`src/components/ProductManager.tsx`)**:
  - Default to a flat catalog list where sibling variants display a family badge (`Variant • 2 SKUs`) and highlight differentiating spec pills (e.g. `S3: 15-20` vs `S3: 20-40`) in high-contrast indigo/amber pills while shared specs (`S1: Black`, `S2: 1.1`) render in subtle slate pills.
  - Provide a **`Group Variants`** toggle in the catalog filter bar to collapse/expand sibling variants cleanly under their parent product family (`I1 — 2 Variants`).
- **Unmistakable Variant Selection Across Enquiries, Studio & Supplier POs**:
  - Update product dropdowns and search selectors in `EnquiryDetail.tsx`, `QuotationStudioModal.tsx`, and `ProcurementPayablesHub.tsx` to display each product's differentiating spec attributes, shared specs, SKU, and live stock count.
