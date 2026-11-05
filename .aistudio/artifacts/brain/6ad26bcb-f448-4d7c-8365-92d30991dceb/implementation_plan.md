# Quotation Studio Architecture Fix — Selection, Right Drawer, Independent Cards & Text Style Bar

Resolve four foundational interaction defects in Quotation Studio so every document mode (`QT`, `PI`, `INV`, `DO`, `REC`, `PO`, `PV`, `MRN`, `DN`) supports reliable single-card selection, guaranteed Right Inspector drawer opening, modular Receipt/Voucher/Totals Lego blocks, direct whole-card Text & Style Bar formatting, and clean reference prefixes across mode switches.

### User Review & Critical Decisions

> [!IMPORTANT]
> All four architectural fixes below are strictly scoped to the Quotation Studio workspace and A4 document engine without altering unrelated application modules.

- **Guaranteed Right Inspector Drawer Opening**: Automatically synchronize missing specialized modular blocks into the Studio layout state whenever the document mode changes or a canvas block is clicked, and synthesize a fallback block configuration so clicking any card or the top-right `[Right Inspector]` toggle always opens a populated inspector drawer.
- **Strict Single-Card Selection & Modular Receipt / Voucher / Totals Cards**: Decouple the Payment Receipt (`REC`), Payment Voucher (`PV`), and Financial Summary (`totals`) body cards from `quote_meta` so only one card on the A4 canvas highlights at a time, and split `REC` and `PV` body sections into independent, resizable, reorderable Lego cards with dedicated Right Inspector controls.
- **Direct Whole-Card Text & Style Bar Formatting**: Remove the multi-target dropdown in the Text & Style Bar so formatting controls apply directly to the selected card by default (with a 1-click `[Style Whole Card]` reset pill whenever a specific text element inside the card is clicked), and ensure child elements inherit custom colors, font sizes, weights, alignments, and accent bars cleanly.
- **Canonical Reference Sanitization on Mode Switch**: Strip stale auxiliary prefixes (`DO-`, `REC-`, `PO-`, `PV-`, `MRN-`, `DN-`) and intermediate `-01` sequence tokens before `-R1` whenever switching document modes so `PO` and `PV` always generate `PO-...` and `PV-...` references cleanly.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades the Quotation Studio interactive canvas and Right Inspector architecture so every visual card on the A4 sheet—across Sales Quotations, Delivery Notes, Payment Receipts, Purchase Orders, Payment Vouchers, Material Returns, and Debit Notes—behaves as a true self-contained modular block with single-selection isolation, a dedicated Right Inspector drawer, and live whole-card typography styling.
- **Target Audience / Persona**: Commercial operations, finance, and logistics teams designing, customizing, and issuing commercial documents in Quotation Studio.
- **Key Value**: Eliminates silent inspector drawer failures, prevents confusing multi-card selection rings, gives users full layout control (`Left 50%` | `Full 100%` | `Right 50%`) over Receipt and Payment Voucher cards, makes the Text & Style Bar work predictably on first click, and prevents `DO-` reference prefixes from bleeding into Purchase Orders or Payment Vouchers.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Clicking Any Specialized Card (`DO`, `MRN`, `DN`, `PV`, `REC`, `Totals`)**:
     - Clicking *Dispatched & Released By*, *Goods Received in Good Order By*, *Authorized Return / Claim By*, *Vendor Return Acknowledgment*, *Treasury & Disbursement Details*, *Beneficiary & Payee Details*, *Treasury Approval & Sign-off Matrix*, *Amount Received Banner*, *Payment Instrument & Reference Details*, *Account Settlement & Balance Statement*, *Amount Disbursed Banner*, *Outbound Bill Settlement & Allocation Schedule*, or the *Financial Summary / Totals* card immediately places a crisp blue selection ring around **only** that card and opens its dedicated Right Inspector panel.
     - Clicking the top-right `[Right Inspector]` toolbar button when the drawer is closed always opens the drawer (defaulting to the active section or Document Meta if none is selected).
  2. **Customizing Payment Receipt (`REC`) & Payment Voucher (`PV`) Cards**:
     - In `REC` mode, the body renders three independent modular cards:
       - **Amount Received Banner** (`rec_amount_banner`, default `Full 100%`)
       - **Payment Instrument & Reference Details** (`rec_payment_instrument`, default `Left 50%`)
       - **Account Settlement & Balance Statement** (`rec_balance_statement`, default `Right 50%`)
     - In `PV` mode, the top **Amount Disbursed Banner** (`pv_disbursed_banner`, default `Full 100%`) and **Outbound Bill Settlement & Allocation Schedule** (`pv_bill_allocation`, default `Full 100%`) are independently selectable modular blocks separate from the top-right Document Meta header card.
     - Each block supports `Left 50%` | `Full 100%` | `Right 50%` width toggles, Up/Down reordering, Show/Hide toggles, and field-level editing in the Right Inspector.
  3. **Formatting via the Text & Style Bar**:
     - Selecting any card on the canvas targets that entire card by default (`Styling: Whole Card`).
     - Changing Font Size (`XS`–`XL`), Bold (`B`), Italic (`I`), Underline (`U`), Case (`AA` / `Aa`), Alignment, Text Color, Highlight Background, or Left Accent Bar immediately updates the visual styling of the card and its text contents.
     - Clicking a specific text element inside a card scopes formatting to that element and displays a `Styling: Selected Text / Field` indicator with a 1-click `[Style Whole Card]` reset button.
  4. **Switching Between Document Modes (`DO` -> `PO` / `PV`)**:
     - Switching from a Delivery Note (`DO-TEST/10/2026/5-01-R1`) to a Purchase Order (`PO`) or Payment Voucher (`PV`) automatically strips the `DO-` prefix and intermediate `-01` sequence token before `-R1`, producing `PO-TEST/10/2026/5-01-R1` or `PV-TEST/10/2026/5-01-R1`.

- **Visual Identity & Theme**:
  - Preserves the executive light-mode Studio workspace (`--background: #f8fafc`, crisp white A4 canvas sheet, `--primary: #2563eb` active selection ring with subtle badge label, and high-contrast slate typography).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Auto-Synchronized Layout Blocks + Synthesized Fallback Block in Right Inspector**
  - *Chosen Approach*: Whenever a quotation is loaded or `documentType` changes, run `ensureSpecializedDocumentBlocks` on `layoutBlocks` in Studio state, AND in `selectedBlock` resolution, synthesize a fallback `QuotationBlockConfig` if a known block ID is clicked before state hydration completes.
  - *Why*: Guarantees `selectedBlock` is never `null` when a user clicks a specialized block on the canvas, eliminating the bug where `selectedSection` became non-null while the Right Inspector drawer remained hidden.
- **Decision 2: First-Class Block IDs for `REC`, `PV`, and `Totals` Instead of Shared `'quote_meta'`**
  - *Chosen Approach*: Assign distinct block IDs (`rec_amount_banner`, `rec_payment_instrument`, `rec_balance_statement`, `pv_disbursed_banner`, `pv_bill_allocation`, and `totals`) instead of routing their click handlers to `'quote_meta'`.
  - *Why*: Routing body cards to `'quote_meta'` caused both the top-right header metadata card and multiple body cards to show active blue selection rings simultaneously, and prevented independent sizing/reordering.
- **Decision 3: Unified Style Property Alignment & Scoped CSS Inheritance**
  - *Chosen Approach*: Align `colorTone` / `textColor`, `accentBar` / `showAccentBar`, and `highlightBg` between the Studio Style Bar and A4 Document renderer, and apply a scoped inheritance wrapper when custom card formatting is active so child labels and values inherit custom color, size, weight, style, transform, decoration, and alignment.
  - *Why*: Previously, the Style Bar wrote `colorTone` and `accentBar` while the document renderer only read `textColor` and `showAccentBar`, and child Tailwind classes (`text-slate-900`, `text-[10px]`, `font-semibold`) blocked parent inline styles from cascading.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         QuotationStudioModal State                         │
│  ┌──────────────────────────────┐      ┌────────────────────────────────┐  │
│  │ layoutBlocks Auto-Sync       │      │ Selection & Style State        │  │
│  │ • ensureSpecializedBlocks()  │      │ • selectedSection (1 ID only)  │  │
│  │ • Fallback Block Synthesizer │      │ • activeStyleKey (Card default │  │
│  │ • Mode-Switch Ref Sanitizer  │      │   or focused child element)    │  │
│  └──────────────┬───────────────┘      └───────────────┬────────────────┘  │
└─────────────────┼──────────────────────────────────────┼───────────────────┘
                  │                                      │
                  ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│       QuotationDocument Canvas      │  │      Right Inspector Drawer       │
│  • Single Active Ring per Block ID  │  │  • Guaranteed Open on Click/Toggle│
│  • Modular Grid (50% L/R or 100%):  │  │  • Dedicated Panels for:          │
│    - DO: Dispatch / Receiving       │  │    - DO / MRN / DN / PV Blocks    │
│    - MRN/DN: Claim / Acknowledgment │  │    - REC: Banner, Instrument,     │
│    - REC: Banner, Instrument,       │  │      Balance Statement            │
│      Balance Statement              │  │    - PV: Disbursed Banner &       │
│    - PV: Disbursed Banner, Bill     │  │      Allocation Schedule          │
│      Allocation, Treasury, Payee,   │  │    - Totals / Financial Summary   │
│      Approval Matrix                │  │  • Direct Text & Style Bar with   │
│    - Totals: Financial Summary Card │  │    [Style Whole Card] Reset Pill  │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Canvas Click Handler (`handleCanvasSelectSection`)**: Sets `selectedSection` to the exact clicked section/block ID, ensures the block exists in `layoutBlocks` if it is a modular block, defaults `activeStyleKey` to the whole-card key (`block:<id>`, `header_card`, `recipient_card`, `offer_card`, `subject_banner`, `items_table_card`, `footer_card`), and opens the Right Inspector drawer.
  - **Right Inspector Toggle Button**: Evaluates `isRightDrawerOpen` based on whether a visible inspector panel is active; clicking when closed restores the last inspected section or defaults to `'quote_meta'` and scrolls the inspector into view.
  - **Canonical Reference Sanitizer (`sanitizeCanonicalQuoteRef` & `handleSwitchDocumentType`)**: Strips any leading `(QT|DO|REC|PO|PV|MRN|DN|PI|INV)-` prefix and any intermediate `-\d{2}` sequence token before `-R\d+` so switching between `DO`, `PO`, `PV`, `REC`, `MRN`, and `DN` always constructs a clean target reference (`PO-TEST/10/2026/5-01-R1`).
