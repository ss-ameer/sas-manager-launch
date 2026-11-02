# Stage 2: Executive Command Center & 360° Operational Integration

Unifies Commercial Sales, Procurement & Payables, Inventory Health, Project Execution, and Call Operations into a cohesive executive command center where every metric, bottleneck alert, and account statement links directly to its underlying workflow.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed preferences from our planning session:

- **Confirmed Decision 1 — Unified 4-Domain KPI Grid with Domain Filter Tabs**: Dashboard 2.0 presents all four operational domains (Commercial Sales, Procurement & Payables, Inventory Health, and Operations & Execution) in a unified overview grid paired with top-level segmented domain filter tabs (`All Domains`, `Commercial Sales`, `Procurement & Payables`, `Inventory Health`, `Operations & Execution`).
- **Confirmed Decision 2 — Deep-Linked Modal Launch Workflow**: Clicking `+ Supplier PO`, `+ Receive GRN`, `+ Record Bill`, or `+ Record Payment` from Dashboard 2.0, Company 360°, or the Company Detail Drawer navigates directly to the Procurement & Payables Hub and automatically opens the target creation modal pre-populated with the selected vendor or purchase order context.

---

### 1. Overview & Core Concept

- **What It Does**:
  - **Dashboard 2.0 (Executive Command Center)**: Transforms the main workspace home into a permission-aware, cross-module B2B ERP command center with a top quick-action toolbar, a 4-domain KPI deck, dual live operational feed panels, a bottleneck triage queue, and a cash-flow commitments snapshot.
  - **Company 360° (Client & Vendor Dual-Mode Dossier)**: Upgrades the 360° company dossier to support both Commercial CRM history and a full **Vendor & Payables Ledger** with real-time PO, GRN, Bill, Debit Note/Return, and Payment Voucher chronological account statements and running balances.
  - **Call Center & Quick Activity Procurement Context**: Enriches call execution and logging with live vendor procurement context (open POs, awaiting GRNs, overdue/unpaid payable balances, procurement call purposes, and 1-click PO/Bill reference tagging).
- **Target Audience / Persona**: Executive leadership, commercial sales reps, procurement officers, and operations coordinators managing end-to-end B2B trading, project supplies, and supplier payables.
- **Key Value**: Eliminates module silos so teams can spot supply chain or payable bottlenecks on the dashboard, inspect a supplier's full financial ledger in Company 360°, or follow up on an overdue PO from the Call Queue with a single click.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Executive Command Center Triage**: The user lands on Dashboard 2.0, switches between `All Domains` or a specific domain tab, reviews the 4-domain KPI deck and Cash Flow Commitments Snapshot, and clicks `Receive GRN` on an open Supplier PO alert—immediately opening the Procurement Hub with the GRN receipt modal pre-loaded for that PO.
  2. **Vendor 360° Account Reconciliation**: Clicking any vendor name in Procurement Hub, Call Log Manager, or Companies Directory opens the Company 360° Dossier. Switching to the **Vendor & Payables Ledger** tab displays the Vendor KPI Ribbon (Total Ordered, Total Billed, Credits Applied, Total Paid, Net Payable Balance) and a chronological running ledger where every row is clickable to view the underlying document, paired with `+ Issue Supplier PO`, `+ Record Vendor Bill`, and `+ Record Payment` actions.
  3. **Vendor Call Execution**: Opening the Quick Activity Drawer for a supplier or hybrid client/vendor surfaces a compact **Vendor Procurement Snapshot** card showing open POs, pending GRNs, and unpaid bills. The operator selects a procurement call purpose (`PO Delivery Follow-up`, `GRN / Discrepancy Resolution`, `Payment / SOA Reconciliation`) and clicks a `PO-xxxx` or `BILL-xxxx` chip to insert the reference directly into the activity log.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density enterprise SaaS command center with single-elevation surfaces (`border border-slate-200 dark:border-slate-800`), crisp hairline dividers, and zero nested card clutter.
  - *Color Palette & Mood*: 60% neutral slate canvas (`bg-slate-50 dark:bg-slate-950`), 30% structural white/dark-slate surfaces (`bg-white dark:bg-slate-900`), and 10% semantic intent accents—Blue/Indigo for Commercial Sales, Emerald/Teal for Procurement & Payables, Amber for Inventory/GRN warnings, and Crimson (`#DC2626`) for overdue payables or call bottlenecks.
  - *Typography & Hierarchy*: Clean sans-serif structural hierarchy paired with strict `tabular-nums` (`font-mono tabular-nums`) on all currency figures, percentages, document numbers, and running ledger balances to guarantee vertical decimal alignment.
  - *Component Styling & Layout*: Standardized `<PageHeader />` and `<PageBody />` containers for 100% zoom fit with zero horizontal overflow, clean segmented filter buttons (`whitespace-nowrap shrink-0`), universal clickable table rows (`cursor-pointer` with `e.stopPropagation()` on row actions), and strict adherence to the `<FieldHelpHint />` simplification rule (no native browser `title` attributes and no duplicate text/icon symbols).
- **Interactive Feedback & Motion**: Instantaneous tab switching, clear empty states with direct creation CTAs, and smooth modal transitions when deep-linking across modules.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Unified 4-Domain KPI Deck with Segmented Filter Tabs**
  - *Chosen Approach*: Display a cohesive 4-domain KPI overview grid on Dashboard 2.0 with top segmented filter tabs that focus both the KPI deck and the live operational panels on a chosen domain when selected.
  - *Why*: Gives executives an immediate 360° pulse of the business while letting department leads (Sales, Procurement, Warehouse, Operations) isolate their domain without clutter.
  - *Alternatives Considered*: Separate dashboard pages per department (rejected because it hides cross-departmental bottlenecks like low stock blocking a won enquiry).
- **Decision 2 — Cross-Module Deep-Link Context State**
  - *Chosen Approach*: Maintain a structured `procurementLaunchContext` state at the root workspace coordinator that passes target action, vendor identity, and document IDs into the Procurement & Payables Hub and clears itself once consumed.
  - *Why*: Ensures that clicking `+ Issue Supplier PO`, `+ Receive GRN`, `+ Record Bill`, or `+ Record Payment` from any module transitions cleanly into the exact pre-filled modal workflow without duplicating complex procurement forms across components.
  - *Alternatives Considered*: Embedding duplicate PO/Bill creation forms inside Dashboard and Company 360° (rejected to maintain a single source of truth for landed-cost math, 3-way matching, and inventory updates).

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Root Workspace Coordinator                          │
│  • Real-time Firestore Subscriptions (Enquiries, Companies, Products,      │
│    Projects, CallLogs, Quotations/POs/GRNs/Vouchers, ProcurementBills)     │
│  • Cross-Module Navigation & Deep-Link State (procurementLaunchContext,    │
│    selected360CompanyId, activeQuickActivityDrawer)                        │
└──────┬──────────────────────┬───────────────────────┬──────────────────────┘
       │                      │                       │
       ▼                      ▼                       ▼
┌─────────────────────┐ ┌───────────────────────────┐ ┌──────────────────────┐
│   Dashboard 2.0     │ │   Company 360° Dossier    │ │  Call Center &       │
│  (Command Center)   │ │  (Client & Vendor 360°)   │ │  Quick Activity      │
├─────────────────────┤ ├───────────────────────────┤ ├──────────────────────┤
│ • Quick Action Bar  │ │ • Mode Switcher:          │ │ • Vendor Relationship│
│ • Domain Filter Tabs│ │   Commercial vs. Vendor   │ │   Identification     │
│ • 4-Domain KPI Deck │ │ • Vendor KPI Ribbon       │ │ • Live Procurement   │
│   (Permission-Aware)│ │ • Chronological Account   │ │   Snapshot Banner    │
│ • Commercial Feed & │ │   Statement (Running      │ │ • 1-Click PO / Bill  │
│   Bottlenecks Queue │ │   Balance Ledger)         │ │   Reference Tagging  │
│ • Cash Flow & PO    │ │ • Deep-Link Actions:      │ │ • Procurement Call   │
│   Commitments Bar   │ │   +PO, +Bill, +Payment    │ │   Purpose Templates  │
└──────┬──────────────┘ └─────────────┬─────────────┘ └──────────┬───────────┘
       │                              │                          │
       └──────────────────────────────┼──────────────────────────┘
                                      ▼
                    ┌───────────────────────────────────┐
                    │     Procurement & Payables Hub    │
                    ├───────────────────────────────────┤
                    │ • Consumes procurementLaunchCtx   │
                    │ • Auto-switches tab & opens modal │
                    │   pre-filled with Vendor / PO     │
                    │ • Clickable Vendor names open     │
                    │   Company 360° Dossier            │
                    └───────────────────────────────────┘
```

- **Data Model & State**:
  - **Procurement Documents (`quotations` collection)**: Filtered by `document_type` (`purchase_order` with `po_variant === 'supplier_po'`, `goods_receipt_note`, `material_return_note`, `debit_note`, `payment_voucher`) and matched to companies via `vendor_company_id` or case-insensitive company name fallback.
  - **Vendor Bills (`procurement_bills` collection)**: Matched via `vendor_company_id` or `vendor_name`, tracking `grand_total`, `amount_paid`, `balance_due`, `due_date`, and `status` (`unpaid`, `partially_paid`, `paid`, `overdue`).
  - **Permission-Aware Commercial Metrics**: Admin users view workspace-wide commercial pipeline and won revenue; non-admin members view metrics scoped to their assigned/shared enquiries while respecting confidentiality rules.
- **Interactive Component & State Mapping**:
  - **Dashboard Quick Actions & Bottleneck Alerts**: Clicking `+ New Enquiry` opens the enquiry creation flow; clicking `+ Supplier PO`, `+ Receive GRN`, or `+ Record Bill` dispatches `procurementLaunchContext` and transitions to Procurement Hub; clicking `+ Log Call / Task` opens the Quick Activity Drawer; clicking any bottleneck row opens the corresponding entity detail modal or filtered module view.
  - **Vendor Account Statement Ledger**: Combines POs (informational commitment), GRNs (physical receipt status), Vendor Bills (`+Debit` to payable balance), Approved Returns/Debit Notes (`-Credit` to payable balance), and Payment Vouchers (`-Settlement` to payable balance) sorted chronologically with a computed running balance per row.
  - **Procurement Hub Deep-Link Handler**: A dedicated effect inspects incoming `launchContext`, selects the matching sub-tab (`pos`, `grns`, `bills`, `payments`), populates vendor/PO fields in the target modal state, opens the modal, and invokes `onClearLaunchContext()` so manual tab navigation remains unaffected afterward.
