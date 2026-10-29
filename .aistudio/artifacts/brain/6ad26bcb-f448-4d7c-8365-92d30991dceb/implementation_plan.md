# UI/UX Uniformization Phase 4 — Data Tables & Pagination

This phase unifies all tabular data grids, row density, interactive hover/selection states, row action clusters, and pagination footers across the platform into a single high-density enterprise B2B SaaS standard while preserving all sorting, filtering, selection, and business logic.

## User Review & Critical Decisions

> [!IMPORTANT]
> All data table headers, row cells, action button clusters, and pagination footers across the Enquiry Log, Companies/Contacts/Phones Directory, Projects & Operations Registry, Product & Inventory Catalog, and Executive Dashboard will be aligned to the unified specification below without altering any underlying state or event handlers.

- **Confirmed Decision 1 (Unified Table Header Typography)**: Standardize every table header (`thead` / `thead tr`) to `bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500`, converting mixed-case `font-sans` headers in the Product Catalog and Dashboard Overdue Follow-ups table to uppercase `text-[11px] font-mono`.
- **Confirmed Decision 2 (Unified Row Density & Hover Accent)**: Standardize all `th` and `td` cells to `py-3 px-4` and unify `tbody tr` interactive states to `border-l-2 border-l-transparent hover:border-l-blue-500 hover:bg-slate-50/80 transition-colors` (and `border-l-2 border-l-blue-600 bg-blue-50/50` when selected).
- **Confirmed Decision 3 (Unified Row Action Button Cluster)**: Standardize right-hand row actions across tables into three consistent button tokens (Primary Inspect/View, Edit, and Delete icon button).
- **Confirmed Decision 4 (Unified Pagination Footer)**: Standardize pagination footers across the Enquiry Log, Product Catalog, and Directory Pagination Bar to `px-5 py-3.5 bg-slate-50/60 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600` with a `Rows per page` selector and bordered `Prev` / `Next` controls.

---

## 1. Overview & Core Concept

- **What It Does**: Harmonizes the visual rhythm, typography, cell spacing, row hover feedback, action button affordances, and pagination bars across every primary data table in the application.
- **Target Audience / Persona**: Sales engineers, commercial estimators, and operations managers scanning hundreds of enquiries, corporate accounts, contacts, telecom numbers, projects, and inventory items daily.
- **Key Value**: Eliminates visual jitter when switching between modules by ensuring every table shares identical header contrast, row height, left-edge selection/hover indicators, action button hierarchy, and pagination ergonomics.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Scanning & Sorting Tabular Records**: Users scan uppercase `11px` monospace column headers with `py-3 px-4` alignment and tabular numerals (`tabular-nums`) for instant vertical alignment of prices, quantities, and dates.
  2. **Row Hover & Selection**: Hovering any row reveals a crisp `2px` blue left accent border (`hover:border-l-blue-500`) with a subtle slate tint (`hover:bg-slate-50/80`). Selected rows lock to `border-l-2 border-l-blue-600 bg-blue-50/50`.
  3. **Row-Level Actions**: Users trigger primary inspection (`Details` / `Inspect` / `View`), editing (`Edit`), or deletion (`Trash`) via a consistent right-aligned button cluster.
  4. **Pagination Navigation**: Users adjust page size (`Rows per page`) and step through pages (`Prev` / `Next`) inside a unified footer bar anchored to the bottom of each table card.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density, crisp light-mode enterprise SaaS data grid.
  - *Color Palette & Mood*: Pure white table surface (`bg-white`), soft slate headers and footers (`bg-slate-50/80`, `bg-slate-50/60`), hairline dividers (`border-slate-200/80`), blue selection/edit accents (`blue-600`, `blue-50/70`), and rose destructive hover states (`hover:text-rose-600 hover:bg-rose-50`).
  - *Typography & Hierarchy*: `text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500` for headers; `font-sans` for entity titles paired with `font-mono tabular-nums` for reference IDs, dates, counts, and currency values.
  - *Component Styling & Layout*: Uniform `py-3 px-4` cell padding across all columns and tables.
- **Interactive Feedback & Motion**: Smooth `transition-colors` on row hover, left-border indicator, and action buttons within `150ms`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Uniform `py-3 px-4` Cell Density**
  - *Chosen Approach*: Apply `py-3 px-4` to all `th` and `td` elements across Enquiry Log, Companies/Contacts/Phones, Projects Registry, Product Catalog, and Dashboard tables.
  - *Why*: Balances compact scannability (previously `py-2.5 px-3` in Enquiries) with comfortable breathing room for multi-line badges (previously `py-4 px-6` in Products).
  - *Alternatives Considered*: Keeping module-specific cell padding was rejected because it made tables feel disconnected across tabs.
- **Decision 2: Three-Tier Row Action Button Hierarchy**
  - *Chosen Approach*:
    - Primary Inspect/View button: `px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition inline-flex items-center gap-1`
    - Edit button: `px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 border border-blue-200/80 transition inline-flex items-center gap-1`
    - Delete icon button: `p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition`
  - *Why*: Clearly distinguishes non-destructive inspection from state modification and destructive deletion without visual clutter.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  UNIFIED ENTERPRISE DATA TABLE CONTRACT                    │
├────────────────────────────────────────────────────────────────────────────┤
│  <thead>                                                                   │
│    bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-mono       │
│    font-semibold uppercase tracking-wider text-slate-500 (th: py-3 px-4)   │
├────────────────────────────────────────────────────────────────────────────┤
│  <tbody>                                                                   │
│    <tr class="border-l-2 border-l-transparent hover:border-l-blue-500      │
│               hover:bg-slate-50/80 transition-colors">                     │
│      ├─ Selected State: border-l-2 border-l-blue-600 bg-blue-50/50         │
│      ├─ Cells (td: py-3 px-4)                                              │
│      └─ Right Action Cluster:                                              │
│           ├─ [Inspect / View / Details] (White bordered surface)           │
│           ├─ [Edit] (Soft blue surface)                                    │
│           └─ [Delete Icon] (Quiet slate -> rose hover)                     │
├────────────────────────────────────────────────────────────────────────────┤
│  <PaginationFooter>                                                        │
│    px-5 py-3.5 bg-slate-50/60 border-t border-slate-200/80                 │
│    flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600│
│    ├─ Left: Showing X to Y of Z records                                    │
│    └─ Right: [Rows per page: <select>]  [Prev] Page P of T [Next]          │
└────────────────────────────────────────────────────────────────────────────┘
         │                  │                  │                 │
         ▼                  ▼                  ▼                 ▼
  ┌─────────────┐   ┌───────────────┐   ┌──────────────┐  ┌──────────────┐
  │ Enquiry Log │   │ CRM Directory │   │   Projects   │  │   Product    │
  │ & Dashboard │   │ (3 Sub-Views) │   │   Registry   │  │   Catalog    │
  └─────────────┘   └───────────────┘   └──────────────┘  └──────────────┘
```

- **Data Model & State**: No changes to pagination state (`currentPage`, `itemsPerPage`, `pageSize`), sorting state (`sortField`, `sortAsc`), or selection state (`selectedEnquiryIds`, `selectedCompanyId`, `selectedContactIds`).
- **Interactive Component & State Mapping**:
  - **Enquiry Log & Dashboard Overdue Table**: Preserves column sorting, inline status `<select>`, gap detector rows, `Details`/`Inspect`, `Edit`/`Claim Gap`, and `Delete` handlers, plus `Rows per page` (`25`, `50`, `100`, `200`, `500`, `All`) and `Prev`/`Next` pagination.
  - **CRM Directory (Companies, Contacts, Phones)**: Preserves row click selection (`selectedCompanyId`, `selectedContactDetail`), `Inspect`/`View Company`, `Edit`, and `Delete` actions, and updates `<DirectoryPaginationBar />` to sit cleanly as a unified table footer.
  - **Projects & Operations Registry**: Standardizes header typography, `py-3 px-4` cell padding, row hover accent, and the `View` button while preserving the project detail modal trigger.
  - **Product & Inventory Catalog**: Standardizes header typography, `py-3 px-4` cell padding, row hover accent, action buttons (keeping specialized GRN/Adjust/Clone icon buttons alongside standardized Edit and Delete buttons), and the unified pagination footer (`10`, `25`, `50`, `100`, `All`).
