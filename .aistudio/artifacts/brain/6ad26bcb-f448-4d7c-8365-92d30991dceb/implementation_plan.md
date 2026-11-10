# Enquiry Form & Package/Kit Simplification Plan

## 1. Executive Summary
Based on your screenshots and feedback, the Enquiry Form still suffers from visual repetition at the top and unnecessary complexity inside Proposal Line Items—especially when quoting a **Package / Set** (such as the `AUTOMATIC DUPLEX MMF SYSTEM 4.32m3/hr` with included parts).

This plan streamlines the Enquiry Form into a clean, predictable workflow with zero jargon:
1. **Every Line Item Shares One Consistent Main Row**: Whether an item is a single product or a complete system/set, the main row always displays `Item Name / Heading`, `Qty`, `Unit` (e.g., `Set`, `Nos`), `Unit Price (AED/USD)`, and `Line Total`.
2. **Simple "Included Items / Sub-Items" Checklist**: Replaces the confusing 3-part *"Composite Package / Kit (BOM) Breakdown"* and *"Itemized vs Single Package Lump-Sum"* toggle with a single, clean **Included Items / Package Contents** list underneath the main row.
3. **No More "Supplier Cost Markup %" Bar**: Removes the markup calculator bar completely and keeps internal `Unit Cost` and `Margin %` tucked behind the optional `+ Cost & Margin` toggle.
4. **One Unified Top Bar & Sequential 1–2–3 Chapters**: Eliminates the duplicate top bars and fixes the broken chapter numbering where Step `2` disappeared unless toggled.

---

## 2. Concrete Fixes Informed by Your Screenshots

### A. Simplify Package / Set & Included Items (`src/components/quotations/CompositePackageEditor.tsx` & `src/components/EnquiryForm.tsx`)
- **Keep the Main Price Row Visible at All Times**:
  - Previously, clicking *"Convert to BOM Kit"* hid the main item's `Qty`, `Unit`, and `Selling Price` inputs and replaced them with a full-width *"PACKAGE / BOM KIT HEADING"* box, forcing the price down into sub-components and causing your `AED 7,157.00` package price to show as `AED 0.00` on the line item.
  - **New Behavior**: Every line item always keeps its standard top row (`Item Name`, `Qty`, `Unit`, `Unit Price`, `Total`).
- **Fix the `AED 0.00` Package Price Disconnect**:
  - If a package has a main unit price (e.g., `AED 7,157.00`) and included zero-price items (`2 x Top and bottom distribution system`, `1 x Vacuum Breaker`, `1 x Riser Pipe`), the line item preserves `Unit Price = 7,157.00` and `Total = 7,157.00` directly on the main row—no more zeroing out the parent price or relying on *"Manual Lump-Sum Override"* at the bottom of the form.
  - If individual sub-items *do* have prices entered, a subtle helper pill (`Sum of sub-items: AED X,XXX — Apply to Unit Price`) lets you sync or keep your main package price in one click.
- **Single Compact "Included Items / Package Contents" List**:
  - Replaces the three separate sections (*"1. Priced Main Components"*, *"2. Included Accessories & Zero-Price Sub-Items"*, *"3. Package / Option Scope Notes"*) with **one compact single-line list**:
    - Each row has: `Qty` (e.g. `2`), `Unit` (`Nos` / `Set`), `Item / Component Name` (`Top and Bottom Distribution System`), optional `Price` (`Included` by default when `0`, or enter a price if itemized), a Catalog link icon, and a delete button.
    - Removes the mandatory second-row *"Optional application / scope remark..."* input from every sub-item so 3 included items take 3 compact lines instead of 6+ tall cards. An optional note or scope remark can still be opened on demand via a tiny `+ Note` icon.
- **Remove Jargon & Markup Calculator**:
  - Removes the *"Supplier Cost Markup: 25% [Apply Markup to Costs]"* bar.
  - Removes the *"Itemized Component Prices | Single Package Lump-Sum"* toggle bar.
  - Renames *"Convert to Composite Package / Kit (BOM)"* to a simple inline toggle pill: **`+ Included Items / Package Contents`** alongside the other line-item pills (`+ Category & Scope`, `+ Tech Specs`, `+ Brand & Media`, `+ Cost & Margin`).

### B. Clean Up Line Item Tech Specs & Cost Toggles (`src/components/EnquiryForm.tsx`)
- **Unclipped Spec Attribute Inputs**:
  - In Screenshot 5, the 14 attribute cards (`Tank Size`, `Vessel Qty`, `Valve Model`, `Manufacturing Standard`) clip their values (`24" x 72" (Dia x`, `USA ASME Stan`) because the key dropdown takes up 175px inside a narrow 2-column split.
  - **Fix**: Adjust the attribute row layout so the key label/select is compact (`w-32 sm:w-36`) and the value input gets full remaining width with clean text visibility, plus a `Clear Empty` action if needed.
- **Unified `+ Cost & Margin` Toggle**:
  - Works identically for both single items and packages—tucked away by default, showing `Unit Cost (AED)`, live `Margin %` badge, and optional `Line Total Override` only when clicked.

### C. Merge Duplicate Top Bars & Fix Chapter Numbering (`src/components/EnquiryForm.tsx` & `src/components/enquiry/EnquiryMetadataSummaryBar.tsx`)
- **Eliminate Triple-Stacked Top Action Bars**:
  - Currently, below the modal title bar, there are three separate bars with duplicate buttons (`AI / RFQ Autofill`, `Paste RFQ`, `Files / AI`, `Auto-Detect Clipboard`).
  - **New Unified Sticky Top Bar**:
    - Left side: Clean sequential section jump tabs that match the actual visible cards:
      - **`1. Client & Details`**
      - **`2. Line Items (N)`**
      - **`3. Summary, Terms & Files (N)`**
    - Right side: One **`Paste RFQ`** button and one **`Files / AI Autofill`** button.
- **Clean Chapter 1 Header & Consolidated Metadata Drawer**:
  - Inside Chapter 1 (`1. Client, Contact & Subject`), display the quiet auto-metadata summary pills (`#67`, `AVENTURA/UAE/VWS/2853-201026`, `19/10/2026`, `Nitin Srivastava`, `Dubai, UAE`, `AED`) right in the Chapter 1 sub-bar with a single **`Customize Details`** toggle.
  - When expanded, combine `Sequence, Quote Ref, Dates, Salesperson, Currency` and `Country, City, Client Ref, Option Scope` into one clean, well-aligned grid instead of two separate stacked sub-cards with duplicate toggle pills (`Sequence, Quote Ref & Log Dates` + `Location, Client Ref & Option Scope`).
  - Fix the truncated `Option Scope` select (`None / Single Opti` -> full readable width).

### D. Declutter Chapter 3: Financial Summary, Terms & Source Files (`src/components/EnquiryForm.tsx`)
- **Compact Attachment & AI Panel**:
  - When a file is already attached and previewing on the left (like `2853-201026_AVENTURA Proposal...pdf`), collapse the giant dashed drag-and-drop upload zone and the technical *"Cloud Storage Target: proposal-attachments"* banner into a compact, single-row toolbar (`+ Attach Another File`, `Paste Raw Excel/Text`, and AI Model selector) right above the attached file row.

---

## 3. Files to Modify
1. `src/components/quotations/CompositePackageEditor.tsx`:
   - Redesign into a clean, jargon-free **Included Items / Package Contents** checklist with single-line rows (`Qty`, `Unit`, `Item Name`, optional `Unit Price` / `"Included"` badge, optional `+ Note`, and `Bulk Paste`), removing the Supplier Cost Markup calculator bar and preserving parent package pricing.
2. `src/components/EnquiryForm.tsx`:
   - Keep the main `Item Name`, `Qty`, `Unit`, `Selling Price`, and `Total` row visible for all line items (including packages/sets).
   - Add `+ Included Items (N)` to the line item progressive-disclosure pill bar and auto-preserve parent unit price when adding included items.
   - Merge the duplicate top bars, renumber visible chapters sequentially (`1. Client & Details`, `2. Proposal Line Items`, `3. Summary, Terms & Files`), unify Chapter 1's metadata expansion into a single clean grid, fix attribute input clipping, and compact the Chapter 3 file upload zone when attachments exist.
3. `src/components/enquiry/EnquiryMetadataSummaryBar.tsx`:
   - Streamline into a compact inline metadata pill strip without duplicate `Paste RFQ` / `Files / AI` buttons that already live in the sticky top bar.
