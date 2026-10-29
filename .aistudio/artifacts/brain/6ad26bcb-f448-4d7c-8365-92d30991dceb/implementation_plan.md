# UI/UX Uniformization Phase 5 — Drawers & Modals Surface Unification

## Overview
Phase 5 unifies all slide-over drawers and centered modal dialogs into the enterprise light-mode B2B SaaS surface system (`bg-white`, `border-slate-200`, `text-slate-900`, `rounded-2xl`) while preserving 100% of existing form state, validation logic, and interactive handlers.

```
+-----------------------------------------------------------------------------------+
|                        UNIFIED DRAWER & MODAL SURFACE SYSTEM                      |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  1. SLIDE-OVER DRAWERS (Quick Activity, Enquiry Detail, Enquiry Form)             |
|  +-----------------------------------------------------------------------------+  |
|  | Backdrop: fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end|
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | Drawer Surface: bg-white border-l border-slate-200 text-slate-900     |  |  |
|  |  | Header: bg-white border-b border-slate-200 px-6 py-4                  |  |  |
|  |  |   [Icon Badge: p-2.5 rounded-xl bg-blue-50/indigo-50]                 |  |  |
|  |  |   Title: text-base font-bold text-slate-900 | Sub: text-xs slate-500  |  |  |
|  |  | Body:                                                                 |  |  |
|  |  |   - Segmented Tracks: bg-slate-100 p-1 rounded-xl border-slate-200/80 |  |  |
|  |  |   - Section Cards: bg-slate-50/70 border border-slate-200/80 rounded-2xl|  |
|  |  |   - Controls: bg-white border-slate-300 text-slate-900 rounded-xl     |  |  |
|  |  |   - Date Inputs: Crisp light mode (no dark color-scheme overrides)    |  |  |
|  |  | Sticky Footer: bg-slate-50/90 border-t border-slate-200 px-6 py-4     |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  2. CENTERED MODALS (Project, Live Execution, Company, Contact, Product)          |
|  +-----------------------------------------------------------------------------+  |
|  | Backdrop: fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex center p-4| |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | Container: bg-white border border-slate-200 rounded-2xl shadow-2xl    |  |  |
|  |  |            overflow-hidden flex flex-col max-h-[90vh]                 |  |  |
|  |  | Header: px-6 py-4 border-b border-slate-200 bg-white                  |  |  |
|  |  |         flex items-center justify-between shrink-0                    |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

## Planned Changes

### 1. Quick Activity Drawer Light-Mode Unification
- **Slide-Over Container & Backdrop**: Convert the slide-over drawer container from pitch-black dark mode (`bg-slate-900 border-slate-800 text-slate-100`) to `bg-white border-l border-slate-200 text-slate-900 shadow-2xl` over the standardized backdrop (`fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end`).
- **Drawer Header**: Convert the top header bar to `bg-white border-b border-slate-200 px-6 py-4`, featuring the standardized icon badge (`p-2.5 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600`, or `bg-indigo-50 border border-indigo-200/80 text-indigo-600` when in internal operations mode), title (`text-base font-bold text-slate-900`), and subtitle (`text-xs text-slate-500`).
- **Segmented Tracks & Section Cards**:
  - Convert segmented tab/mode tracks from `bg-slate-950 border-slate-800` to `bg-slate-100 p-1 rounded-xl border border-slate-200/80` with crisp light-mode active/inactive states.
  - Convert section cards and panels from `bg-slate-950/60 border-slate-800/80` (and `bg-slate-950/40` / `bg-slate-900/80`) to `bg-slate-50/70 border border-slate-200/80 rounded-2xl` (with inner interactive cards using `bg-white border border-slate-200`).
- **Form Controls & Popovers**:
  - Standardize all inputs, selects, and textareas from `bg-slate-950 border-slate-800 text-slate-100` to `bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl`.
  - Update dropdown autocomplete menus, call disposition pills, quick-create sub-panels, and taxonomy selectors within the drawer to crisp light surfaces (`bg-white border-slate-200 text-slate-900 shadow-xl`) and remove dark color-scheme overrides on date/time inputs.
- **Sticky Footer Action Bar**: Convert the bottom action bar to `bg-slate-50/90 border-t border-slate-200 px-6 py-4`.

### 2. Enquiry Detail & Enquiry Form Slide-Over Drawers
- **Unified Slide-Over Backdrops**: Standardize both the Enquiry Detail drawer backdrop and Enquiry Form drawer backdrop to `fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end`.
- **Native Light Date Pickers**: Remove `style={{ colorScheme: 'dark' }}` and `[color-scheme:dark]` from the `Received Date` and `Logged Date` inputs in the Enquiry Form so native calendar pickers render in crisp light mode matching the form surface.

### 3. Centered Modals Surface, Radius & Header Standardization
- **Unified Modal Backdrops**: Standardize centered modal backdrops across Project Detail, Live Execution, Company Form, Contact Form, and Product Form modals to `fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4` (preserving stacked z-index elevation where required for nested modals).
- **Unified Modal Containers**: Standardize all centered modal shells to `bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]` (updating Project Registry's `rounded-3xl` container to `rounded-2xl`).
- **Unified Modal Headers**: Standardize all modal headers to `px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0`.

## Verification Criteria
- All slide-over drawers and centered modals render in a cohesive, high-contrast light mode (`bg-white`, `border-slate-200`, `rounded-2xl`) with zero dark-on-dark or light-on-light text clashes.
- Native date and datetime inputs inside drawers and forms render with light-mode calendar popovers.
- Full TypeScript & Vite build verification passes with zero errors.
