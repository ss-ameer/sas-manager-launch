# UI/UX Uniformization Phase 2 — Standardized KPI Strips & Card Surfaces

## 1. Architectural Vision & Visual System

Phase 2 extends the enterprise light-mode B2B SaaS design system established in Phase 1 across all primary operational modules. Every top-level workspace tab will open with an identical, scannable 4-card executive metric strip (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`) powered by the shared `KpiStatCard` primitive, paired with crisp light-mode card surfaces (`bg-white border border-slate-200/80 rounded-2xl shadow-xs text-slate-900`) and tabular monospace numerals (`font-mono tabular-nums`).

```
+-----------------------------------------------------------------------------------+
| Sticky PageHeader (max-w-[1600px], bg-white/95, border-b border-slate-200/80)     |
+-----------------------------------------------------------------------------------+
| PageBody (max-w-[1600px], flush below PageHeader, py-6 px-4 sm:px-6 lg:px-8)      |
|                                                                                   |
|  +-----------------+  +-----------------+  +-----------------+  +-----------------+
|  | KpiStatCard 01  |  | KpiStatCard 02  |  | KpiStatCard 03  |  | KpiStatCard 04  |
|  | Label     [Icon]|  | Label     [Icon]|  | Label     [Icon]|  | Label     [Icon]|
|  | 2xl Tabular Val |  | 2xl Tabular Val |  | 2xl Tabular Val |  | 2xl Tabular Val |
|  | Subtext         |  | Subtext         |  | Subtext         |  | Subtext         |
|  +-----------------+  +-----------------+  +-----------------+  +-----------------+
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Primary Content Surfaces (bg-white border-slate-200/80 rounded-2xl)         |  |
|  | - Zero dark-mode surface collisions                                         |  |
|  | - Valid Tailwind v4 utility tokens throughout                               |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Design & Product Decisions

### A. Shared KPI Metric Strip Specification
- **Grid Geometry**: All six primary modules (Dashboard, Enquiries, Call Center, Projects, Products & Inventory, and Companies & Contacts) will render a 4-column responsive metric grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`) as the top visual anchor inside `PageBody`.
- **Card Anatomy (`KpiStatCard`)**:
  - **Surface**: `bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs transition-all` with interactive hover and active ring states (`ring-2 ring-blue-500 border-blue-300 bg-blue-50/20`) when used as a filter toggle.
  - **Typography**: `text-[11px] font-bold text-slate-500 uppercase tracking-wider` for the top label, `text-2xl font-bold text-slate-900 tracking-tight font-mono tabular-nums` for the primary value, and `text-xs text-slate-500 font-medium` for contextual subtext.
  - **Iconography**: Top-right `p-2.5 rounded-xl border shrink-0` semantic badge (`blue`, `emerald`, `amber`, `rose`, `purple`, `indigo`, or `slate`).

---

## 3. Module-by-Module Implementation Scope

### 1. Executive Dashboard Surface & KPI Harmonization
- **4 Core Summary KPI Cards**:
  - Convert the 4 primary summary cards (`Active Pipeline`, `Won Proposals`, `Win Ratio`, and `Overdue Follow-ups`) to `gap-4` using `KpiStatCard` with `TrendingUp` (`blue`), `Award` (`emerald`), `Target` (`purple`), and `AlertCircle` (`rose` when overdue > 0, `slate` otherwise), preserving the click-through handler on Overdue Follow-ups.
- **Crisp Light-Mode Card Surfaces**:
  - Eliminate legacy `dark:bg-slate-900`, `dark:bg-slate-800/40`, `dark:border-slate-800/80`, and `dark:text-*` surface classes across the Dashboard panels (AI Executive Summary card, Sales Velocity & Pipeline Health panel, Action Center & Follow-ups panel, Pipeline Breakdown, Recent Activity, and Top Customers/Products widgets) that clashed with `text-slate-900` headings and `bg-slate-50` inner containers.
  - Standardize Dashboard section containers to `bg-white border border-slate-200/80 rounded-2xl shadow-xs text-slate-900`.
- **Tailwind Token Fixes**:
  - Replace the invalid gradient stop `via-slate-850` on the Command Center banner with `via-slate-800`.
  - Replace any remaining `text-slate-850` tokens with `text-slate-900`.

### 2. Enquiries Pipeline KPI Strip Upgrade
- **Interactive 4-Card KPI Strip**:
  - Upgrade the 4 compact `text-lg` icon-less filter cards (`Active Pipeline`, `Actionable Proposals`, `Won Orders`, and `Conversion & Health`) to full `KpiStatCard` components inside a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` container.
  - Assign top-right semantic icon badges using `TrendingUp` (`blue`), `FileText` (`indigo`), `CheckCircle2` (`emerald`), and `Activity` (`rose` when overdue > 0, `amber` otherwise).
  - Preserve existing interactive filter behavior (`quoteLifecycleFilter` toggling `'all'`, `'pending'`, `'won'`, and `urgencyFilter` toggling `'Overdue'`) and active selection styling.

### 3. Call Center & Activity Log KPI Strip
- **4-Card Telemetry Strip**:
  - Upgrade the 4 Call Center summary cards (`Scheduled Queue (Today)`, `Overdue Calls`, `Calls Today`, and `Completed This Week`) to `KpiStatCard` components with `font-mono tabular-nums` values and semantic icon badges (`Calendar` in `blue`, `Clock` in `rose`/`slate`, `CheckCircle2` in `emerald`, and `Zap` in `indigo`).
  - Maintain the interactive click handler on the Overdue Calls card to toggle the `'overdue'` queue tab.

### 4. Project Registry Layout & KPI Strip Alignment
- **Flush Header-to-Body Layout**:
  - Remove `className="space-y-6"` from the outer `<div>` wrapping `PageHeader` and `PageBody` so `PageBody` sits flush below the sticky `PageHeader`, matching every other module in the application.
- **4-Card Project KPI Strip**:
  - Convert the 4 Project Registry metric cards (`Active Projects`, `Pending Dispatch`, `Dispatched & Completed`, and `Operational Value`) to `KpiStatCard` components with `Briefcase` (`blue`), `Boxes` (`amber`), `Truck` (`emerald`), and `DollarSign` (`indigo`), enforcing `font-mono tabular-nums` across all 4 metrics.

### 5. Product & Inventory Catalog KPI Strip & Token Cleanup
- **Invalid Tailwind Class Cleanup**:
  - Replace invalid `text-slate-850` classes with `text-slate-900` and `text-emerald-650` with `text-emerald-600`.
- **4-Card Catalog & Stock KPI Strip**:
  - Standardize the 4 Product Manager cards (`Catalog Items`, `Tracked Inventory`, `Total Stock on Hand`, and `Low Stock Alerts`) to use `KpiStatCard` with `Package` (`blue`), `Boxes` (`emerald`), `ArrowDownToLine` (`indigo`), and `AlertTriangle` (`amber` when alerts exist, `slate` otherwise), preserving the click handler on `Low Stock Alerts` that toggles the low-stock filter.

### 6. Companies & Contacts Directory KPI Strip Addition
- **New 4-Card Directory Summary Strip**:
  - Add a 4-card `KpiStatCard` metric strip at the top of `PageBody` in the Companies & Contacts Directory (directly above the view switcher toolbar) so the Companies tab shares the exact visual hierarchy of Enquiries, Call Center, Projects, and Products:
    1. **Total Companies**: Count of registered companies (`companies.length`), `Building2` icon (`blue`), clicking switches view mode to `'companies'`.
    2. **Active Client Accounts**: Count of companies with linked enquiries or active projects (`emerald`, `CheckCircle2` icon), showing client engagement coverage.
    3. **Registered Contacts**: Total individual contacts (`contacts.length`), `Users` icon (`indigo`), clicking switches view mode to `'contacts'`.
    4. **Direct Phone Lines**: Total indexed phone numbers (`allPhoneEntries.length`), `Phone` icon (`purple`), clicking switches view mode to `'phones'`.

---

## 4. Verification Criteria
- All 6 primary workspace tabs render a uniform `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` strip using `KpiStatCard` with `text-2xl font-bold font-mono tabular-nums` values.
- Zero `dark:bg-slate-900` card surface collisions remain in `Dashboard.tsx`.
- Zero invalid Tailwind classes (`via-slate-850`, `text-slate-850`, `text-emerald-650`) remain in the updated modules.
- TypeScript compilation (`compile_applet`) and ESLint verification (`lint_applet`) pass with zero errors.
