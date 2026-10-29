# UI/UX Uniformization Phase 1 — Core Layout & Theme Lock

## Objective
Standardize the core CSS theme lock, top sticky page headers, page body containers, surface cards, KPI stat cards, and sidebar workspace switcher into a cohesive enterprise light-mode B2B SaaS design system without altering any business logic, state, or event handlers.

---

## 1. Global Theme Lock (`src/index.css`)
- **Explicit Dark Variant Lock**: Add `@custom-variant dark (&:where(.dark, .dark *));` immediately below `@import "tailwindcss";` so Tailwind v4 only activates `dark:*` utilities when `.dark` is explicitly applied in the DOM rather than via OS media queries.
- **Native Control Light Color Scheme**: Change `color-scheme: dark light;` on `input, select, textarea` to `color-scheme: light;` so native `<select>`, `<input type="date">`, and scrollbars render consistently in crisp light mode.

---

## 2. Sticky Page Header Standardization (`src/components/layout/PageHeader.tsx`)
- **Configurable Max-Width**:
  - Add optional `maxWidth?: string` prop to `PageHeaderProps` (defaulting to `'max-w-[1600px]'`).
  - Replace hardcoded `max-w-7xl mx-auto w-full` on the inner flex container with `${maxWidth} mx-auto w-full`.
- **Light-Mode Surface & Typography Lock**:
  - Remove all `dark:*` classes from `PageHeader.tsx` (including `badgeClasses`, sticky wrapper, mobile menu button, icon badge, title, subtitle, secondary actions, and primary action button).
  - Standardize the sticky header bar to:
    `sticky top-0 z-20 w-full px-6 py-4 lg:px-8 border-b border-slate-200/80 bg-white/95 backdrop-blur-xs shadow-2xs`
  - Standardize the icon badge to:
    `p-2.5 bg-blue-50 border border-blue-200/80 rounded-xl text-blue-600 shrink-0 shadow-2xs` (preserving the secret 5-click God Mode trigger on the icon container).
  - Standardize the title to:
    `text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-sans`
  - Standardize the subtitle to:
    `text-xs text-slate-500 font-medium mt-0.5`

---

## 3. Layout Primitives & `<KpiStatCard />` (`src/components/layout/UiContainer.tsx`)
- **`PageBody` Width Alignment**:
  - Change default `maxWidth` prop on `PageBody` from `'max-w-7xl'` to `'max-w-[1600px]'` so page content aligns with `PageHeader` and wider dashboards (`LeadsPipelinePage`, `ProjectExecutionPage`).
- **`CardPanel` Surface Refinement**:
  - Update `CardPanel` base classes to:
    `bg-white border border-slate-200/80 rounded-2xl shadow-xs transition-all duration-200`
- **New `<KpiStatCard />` Component**:
  - Export `KpiStatCard` from `src/components/layout/UiContainer.tsx` with props:
    - `label: string`
    - `value: React.ReactNode`
    - `subtext?: React.ReactNode`
    - `icon?: React.ReactNode`
    - `tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'indigo'`
    - `onClick?: () => void`
    - `active?: boolean`
    - `className?: string`
  - Render using the standardized token classes:
    - Wrapper: `bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all text-left flex flex-col justify-between` (plus interactive cursor/ring styling when `onClick` or `active` is provided).
    - Label: `text-[11px] font-bold uppercase tracking-wider text-slate-500`
    - Value: `text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-slate-900 mt-1`
    - Icon Badge: `w-9 h-9 rounded-xl flex items-center justify-center shrink-0` (colored by `tone`: `bg-{tone}-50 text-{tone}-600 border border-{tone}-200/60`).

---

## 4. Sidebar Workspace Switcher Polish (`src/components/Sidebar.tsx`)
- **Light Surface Header Block (lines 140–181)**:
  - Replace the dark `p-3 border-b border-slate-200 bg-slate-900 text-white` Workspace Switcher container with:
    `p-3.5 border-b border-slate-200 bg-slate-50/80`
  - Update the header label (`Active Workspace`) and role badge for clean legibility on the light slate surface.
  - Replace the dark `<select>` (`bg-slate-800 text-white ...`) with a crisp white select control:
    `w-full bg-white text-slate-900 font-bold text-xs px-3 py-2 rounded-xl border border-slate-200/90 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer appearance-none truncate pr-8`
  - Update the dropdown chevron and status indicator text (`text-[10px] text-slate-500`) to harmonize with the light header block while keeping all workspace switching and creation logic untouched.

---

## Verification Plan
- Run `lint_applet` and `compile_applet` to verify zero TypeScript or build regressions.
