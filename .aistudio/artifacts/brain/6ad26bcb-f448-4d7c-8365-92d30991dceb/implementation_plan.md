# Enquiry Module 80/20 Progressive Disclosure & Headless Architecture

This upgrade transforms the Enquiry workflow from a high-density 45-field form into a calm, high-velocity **30-Second Core Flow** powered by Contextual Progressive Disclosure and a modular Headless Controller architecture, eliminating visual fatigue and permanently insulating Firebase/state logic from UI edits.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions have been confirmed from your answers and will govern Phase 1 implementation:

- **Confirmed Phase 1 Scope**: Execute the **Enquiry Form 80/20 Progressive Disclosure Redesign and Headless Controller Split** first, establishing the clean architectural template before propagating mobile card views across registries.
- **Confirmed Default 80/20 Surface ("30-Second Core Flow")**: Only **Company, Contact, Subject / Scope Summary, and compact Line Items** remain visible on initial load. Auto-generated metadata (`S/N`, `Quote Ref`, `Logged Date`, `Assigned Rep`, `Currency`, `Status`) collapses into a single-line interactive summary bar at the top, and secondary sections expand on demand via inline `+ Add` triggers.
- **Confirmed Mobile Card Quick-Actions Contract**: Mobile summary cards will support four direct thumb-friendly interactions: **Tap card to view/edit details**, **Quick button to log/schedule a call**, **Quick button to open Quotation Studio**, and **One-tap WhatsApp or phone dialer action**.
- **Strict Zero-Quota & Zero-Regression Guarantee**: All Firestore queries, sequence reservation rules, BOM cost/margin math, AI RFQ extraction pipelines, and RBAC confidentiality masks remain 100% preserved inside the headless controller hook without adding any new Firestore read effects.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the monolithic 9,200-line `EnquiryForm` view with a separated Headless Controller hook (`useEnquiryFormController`) and focused, lightweight visual sub-components that surface only the essential 20% of controls needed for 80% of daily enquiry logging—while keeping 100% of advanced capabilities (multi-option scopes, BOM kits, custom engineering specs, AI extraction, currency overrides, and attachments) one click away.
- **Target Audience / Persona**: Sales engineers, commercial estimators, and executives logging and pricing RFQs who need rapid, distraction-free data entry on both desktop monitors and mobile phones.
- **Key Value**: Cuts initial visual clutter by ~70% so a standard enquiry can be logged in under 30 seconds, while modularizing the codebase so future UI refinements never risk breaking Firestore quota circuit breakers or state synchronization.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Zero-Clutter Arrival & Auto-Metadata Summary Bar**:
   - Opening **Register New Enquiry** displays a single quiet summary bar at the top of the drawer:
     `S/N #2752 · Ref: Auto (2752-091126AA) · Today · Rep: Syed Ameer · Currency: AED · Status: Active` with an inline `[Customize Metadata]` toggle.
   - If the user never needs to override the sequence number, backdate the enquiry, or change the currency, they never see those six input boxes. Clicking any segment or `[Customize Metadata]` smoothly reveals the metadata override drawer.
2. **Step 1 — Core Client & Subject Entry**:
   - Immediately below the summary bar sits a clean, single-elevation card containing **Company Search & Pairing**, **Contact Person Selection**, and **Enquiry Subject / Description**.
   - Optional context fields are presented as quiet inline micro-triggers right below the Subject input: `+ Project & Location`, `+ Source & Assigned Team`, `+ Custom Engineering Specs`, and `+ AI / Clipboard Autofill`. When an enquiry already has values in any of those fields (when editing an existing record or after AI extraction), that specific sub-panel auto-expands automatically.
3. **Step 2 — Compact Line Items with Inline Progressive Disclosure**:
   - Each Line Item starts as a single, scannable horizontal row: **Catalog/Item Name**, **Qty**, **Unit**, **Unit Price**, and **Line Total**.
   - Directly beneath the row sit quiet text triggers for optional power features: `+ Classification & Option Scope`, `+ Technical Specs (0)`, `+ Product Photo / Media`, `+ Vendor Cost & Margin`, and `+ Convert to Composite BOM`.
   - Clicking any trigger reveals only that specific sub-drawer on that line item. Existing line items that already contain specs, photos, or BOM sub-components automatically show an active indicator pill and expand when inspected.
4. **Step 3 — Terms, Valuation & Attachments Drawer**:
   - A streamlined footer section shows calculated **Net Subtotal**, **VAT (5%)**, and **Grand Total**, with one-click toggles for `+ Lump-Sum Package Override`, `+ Remarks & Follow-up Notes`, and `+ Source Attachments`.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian precision inspired by Linear and Stripe Billing—calm neutral canvases, crisp hairline borders, unboxed typographic metadata, and high-contrast tabular numerals.
- **Color Palette & Mood**:
  - **60% Dominant Neutral Canvas**: Slate-50 (`bg-slate-50/80 dark:bg-slate-950/70`) drawer background with crisp white (`bg-white dark:bg-slate-900`) primary work surfaces.
  - **30% Structural Surfaces**: Subtle hairline dividers (`border-slate-200/80 dark:border-slate-800`) and muted secondary labels (`text-slate-500 dark:text-slate-400`).
  - **10% Accent Budget**: High-intent Royal Blue (`bg-blue-600 text-white`) reserved strictly for primary save actions and active focus rings; Emerald (`text-emerald-600`) for AI autofill confidence and positive margin states; Amber/Crimson for price discrepancies and RBAC locks.
- **Typography & Hierarchy**:
  - Clean sans-serif UI labels (`font-sans`) paired with strict tabular monospace (`font-mono tabular-nums`) for all prices, quantities, margins, serial numbers, and quotation references.
  - Zero all-caps shouting on long headers; clear contrast between section titles (`text-sm font-semibold text-slate-900 dark:text-slate-100`) and inline disclosure triggers (`text-xs font-medium text-slate-500 hover:text-blue-600`).
- **Interactive Feedback & Motion**:
  - Instant (<150ms) expand/collapse transitions on progressive disclosure drawers.
  - Auto-expansion of any collapsed section when AI Smart Paste or PDF extraction populates fields inside it, paired with a subtle emerald highlight pulse so the user sees every extracted value immediately.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Contextual Progressive Disclosure (`+ Add` Triggers) vs. Global Simple/Advanced Toggle**
  - *Chosen Approach*: Inline contextual disclosure bars and per-feature `+` triggers that auto-expand when populated.
  - *Why*: Sales engineers frequently need just *one* advanced capability (e.g., setting a USD exchange rate or adding 2 technical specs to item #1) without wanting 40 other irrelevant fields cluttering the screen. Auto-expanding populated fields also guarantees zero hidden data when editing existing enquiries.
  - *Alternatives Considered*: A global "Simple / Advanced" switch was rejected because flipping to Advanced Mode re-exposes all 45 inputs at once, recreating the exact cognitive overload we are solving.
- **Decision 2: Headless Controller Extraction vs. In-Place Monolith Editing**
  - *Chosen Approach*: Extract state, validation, AI extraction, and Firestore persistence into a dedicated controller module and break the UI into focused visual sub-components (`EnquiryMetadataBar`, `EnquiryClientScopeCard`, `EnquiryLineItemRow`, `EnquiryTermsAttachmentsCard`).
  - *Why*: Separating business/database logic from JSX presentation ensures future visual tweaks are fast, predictable, and mathematically incapable of introducing Firestore read loops or breaking sequence counters.
  - *Alternatives Considered*: Keeping everything in a single 9,200-line file was rejected because it causes context truncation and makes holistic layout review brittle.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   useEnquiryFormController (Headless Hook)                  │
│  • Form State, Dirty Tracking & Validation                                  │
│  • Safe Firestore Reads/Writes (safeGetDoc,Sequence Cache, RBAC Guards)     │
│  • AI PDF / Excel Smart Paste Extraction & Entity Matching                  │
│  • Live Financial Totals, Multi-Currency Conversion & BOM Rollup Math       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Props & Action Handlers (Zero DB Code)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EnquiryForm Drawer Shell                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. EnquiryMetadataSummaryBar                                               │
│     ├─ Quiet Inline Summary: S/N · Ref · Date · Rep · Currency · Status     │
│     └─ [Customize] Expandable Drawer (Manual SN, Gap Pool, FX Rate, Status) │
├─────────────────────────────────────────────────────────────────────────────┤
│  2. EnquiryClientAndScopeSection                                            │
│     ├─ Always Visible: Company Combobox + Contact Picker + Subject Input    │
│     └─ Inline Triggers (+):                                                 │
│        ├─ [Project & Location]     ├─ [Source & Team Roster]                │
│        ├─ [Custom Project Specs]   └─ [AI / RFQ Document & Clipboard Paste] │
├─────────────────────────────────────────────────────────────────────────────┤
│  3. EnquiryLineItemsWorkspace                                               │
│     ├─ Compact Core Row: Item / Catalog Picker · Qty · Unit · Price · Total │
│     └─ Per-Item Inline Triggers (+):                                        │
│        ├─ [Classification & Option] ├─ [Technical Specs Grid]               │
│        ├─ [Product Media & Image]   ├─ [Supplier Cost & Margin]             │
│        └─ [Composite Package / BOM Editor]                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  4. EnquiryValuationAndAttachmentsSection                                   │
│     ├─ Inline Triggers (+): [Lump-Sum Override] · [Remarks] · [Attachments] │
│     └─ Sticky Executive Footer: Live Totals + Cancel / Save & Add / Save    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Zero Schema Changes**: The `Enquiry`, `LineItem`, `Company`, `Contact`, and `Product` interfaces remain 100% backward-compatible with all existing Firestore documents and `QuotationStudioModal` integrations.
- **Disclosure UI State**:
  - `isMetadataExpanded`: boolean (defaults to `false` on new enquiries; auto-expands if user clicks `[Customize]` or claims a reserved sequence gap).
  - `expandedScopePanels`: set of active optional panels (`'location' | 'routing' | 'custom_specs' | 'ai_intake'`), automatically hydrated with any panel that has non-default data when editing an existing enquiry or after AI extraction.
  - `expandedLineItemPanels`: map of `lineItemIndex -> Set<'classification' | 'specs' | 'media' | 'costing' | 'bom'>`, keeping new line items ultra-compact while automatically badging and expanding populated sub-sections.

### Interactive Component & State Mapping

- **Metadata Summary Bar (`EnquiryMetadataSummaryBar`)**:
  - Displays live computed values (`sn`, `quoteRefNo`, `receivedDate`, `assignedTo`, `formCurrency`, `status`).
  - Clicking any token opens the override grid and focuses that specific control (e.g., clicking `Currency: AED` opens the currency & exchange rate selector).
- **Core Client & Scope Card (`EnquiryClientAndScopeSection`)**:
  - Preserves instant fuzzy search for companies, inline `+ New Company` / `Edit Company` modals, filtered contact dropdowns, and `+ New Contact` creation.
  - Clicking `+ AI / RFQ Autofill` or `Auto-Detect Clipboard` runs the existing Gemini extraction pipeline and automatically expands any section that receives extracted tokens.
- **Compact Line Item Row (`EnquiryLineItemRow`)**:
  - Renders the 5 primary commercial fields on a single clean row with catalog autocomplete and variant selection.
  - Toggling `+ Technical Specs` opens the attribute key/value editor; toggling `+ Supplier Cost & Margin` opens the RBAC-protected cost/markup calculator; toggling `+ Composite BOM` mounts `CompositePackageEditor`.
- **Mobile Enquiry Card Quick-Action Readiness (`EnquiryList` Mobile View)**:
  - Aligns mobile card actions so smartphone users (< 640px) have direct 44px touch targets for: Tap card to view/edit, Log/Schedule Call, Open Quotation Studio, and One-Tap WhatsApp/Phone dialer.
