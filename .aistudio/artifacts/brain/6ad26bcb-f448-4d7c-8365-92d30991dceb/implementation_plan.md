# Commercial Document Suite Engine (QT · DO · PO · REC)

Expand the existing A4 Quotation Studio into a unified, 100% tenant-agnostic and industry-agnostic **Commercial Document Suite Engine** that powers the complete B2B deal lifecycle—**Quotations (`QT`)**, **Delivery Notes (`DO`)**, **Purchase Orders (`PO`)**, and **Payment Receipts (`REC`)**—from a single shared A4 layout engine and snapshot persistence layer.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> The following architectural and workflow decisions were confirmed during interactive clarification and govern this implementation:

- **Confirmed Decision 1 — Linked Reference Numbering (`QT` → `DO` / `PO` / `REC`)**: Derived documents automatically link to the parent quotation's base reference number with a sequential suffix (e.g., `DO-0042-01`, `PO-0042-01`, `REC-0042-01`), keeping all documents for a deal traceable at a glance while allowing manual override in the Studio header.
- **Confirmed Decision 2 — Outbound Supplier PO Cost Initialization**: When generating an Outbound Supplier PO, each line item's unit rate initializes from its recorded `cost_price`, automatically falling back to the linked Product Catalog's `cost_price` or `0.00` (with a visual indicator) and **never** exposing the client selling price (`unit_price`).
- **Confirmed Decision 3 — Optional 1-Click Stock Deduction on Delivery Note Issue**: Issuing a Delivery Note (`DO`) offers an optional 1-click warehouse stock deduction action for the delivered quantities (`qty_delivered`) rather than forcing silent stock mutations, giving operations teams full control.
- **Strict Tenant & Industry Agnosticism**: Every company name, logo, seal, tax ID (`TRN / VAT`), warehouse address, and bank account resolves dynamically from the active Workspace Profile (`sender_snapshot` / `@our_company`), and all industry-specific or company-specific placeholder strings across the codebase are replaced with universal B2B microcopy.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Quotation Studio into a multi-mode commercial document engine where sales, procurement, logistics, and finance teams can generate, customize, print, and track formal **Quotations (`QT`)**, **Unpriced Delivery Notes (`DO`)**, **Supplier Purchase Orders & Order Acknowledgments (`PO`)**, and **Official Payment Receipts (`REC`)** directly from any Enquiry or Quotation.
- **Target Audience / Persona**: B2B commercial teams across any industry (general trading, electronics, construction, engineering, medical supplies, manufacturing) managing end-to-end deal execution from initial proposal to procurement, partial/full dispatch, and milestone payment collection.
- **Key Value**: Eliminates external spreadsheets and disconnected Word templates by reusing the same pixel-accurate A4 layout engine, custom Lego blocks, brand presets, and `@data` token system across all four commercial document types.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Unified Documents & Quotes Hub (Enquiry Detail)**:
   - The `Quotes & Revisions` tab becomes the **Documents & Quotes Hub** with segmented filter controls (`All`, `Quotations (QT)`, `Delivery Notes (DO)`, `Purchase Orders (PO)`, `Receipts (REC)`).
   - From any Quotation card or the hub header (respecting the Winning Option when multiple options exist), users can trigger 1-click conversions:
     - **Issue Delivery Note**: Pre-fills remaining undelivered quantities (`qty_ordered - prior_qty_delivered`) and opens Studio in `DO` mode.
     - **Issue Supplier PO**: Opens a clean Line Item & Supplier Selection modal (allowing filtering of items/BOM sub-components for a specific vendor from the Companies directory), maps `cost_price` to the PO unit rate, and launches Studio in `PO` mode.
     - **Issue Payment Receipt**: Automatically calculates `Previously Received` from prior receipts on the Enquiry, sets `Total Order Value`, and launches Studio in `REC` mode.
2. **Studio Document Type Switcher & Contextual Inspector**:
   - The Studio header includes a **Document Type Switcher** (`Quotation (QT)` · `Delivery Note (DO)` · `Purchase Order (PO)` · `Payment Receipt (REC)`).
   - Switching modes dynamically adapts the A4 canvas and displays a dedicated, progressively disclosed **Document Metadata Card** in the Studio drawer (`Logistics & Dispatch` for `DO`, `Supplier & Shipping Terms` for `PO`, `Payment & Settlement Calculator` for `REC`) formatted in clean 2-column grids (`grid-cols-2`, `min-w-0`, `whitespace-nowrap`).

### Visual Identity & A4 Document Presentation
- **Aesthetic Direction**: Executive precision and high-density B2B clarity. Each document type shares the active workspace's brand identity (logo, typography, theme accent, official seal) while presenting a distinct, unmistakable structural layout suited to its legal and operational role.
- **Color Palette & Semantic Posture**:
  - Uses the workspace's configured theme token (`navy`, `slate`, `blue`, `emerald`, `teal`, `amber`, `crimson`) for structural headers and banners.
  - Semantic status indicators: Emerald (`#16A34A`) for settled balances and full deliveries, Amber (`#D97706`) for partial deliveries or pending cost entries, and Slate (`#0F172A`) for formal financial tables.
- **Typography & Tabular Discipline**:
  - All quantities (`Qty Ordered`, `Qty Delivered`, `Qty Balance`), unit rates, serial/batch numbers, and settlement figures strictly enforce `tabular-nums` (`font-mono`) so decimal points and quantity columns align vertically without wrapping.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single Shared Entity Store (`quotations`) with `document_type` Discriminator**
  - *Chosen Approach*: Extend the existing `Quotation` entity with `document_type?: CommercialDocumentType` (defaulting to `'quotation'`) and strongly typed metadata sub-objects (`delivery_metadata`, `purchase_order_metadata`, `receipt_metadata`).
  - *Why*: Preserves 100% backward compatibility with existing IndexedDB and Firestore queries, revision history, snapshot freezing (`client_snapshot`, `sender_snapshot`), brand presets, and PDF/print pagination without duplicating repository plumbing.
  - *Alternatives Considered*: Creating separate Firestore collections per document type was rejected because it would fragment revision cloning, preset application, and unified Enquiry Hub queries.

- **Decision 2: Mandatory Unpriced Enforcement in Delivery Note (`DO`) Mode with State Memory**
  - *Chosen Approach*: Activating `delivery_note` mode automatically enforces unpriced table rendering (hiding `Unit Price`, `Total`, `Tax`, and `Financial Summary` blocks) while preserving the user's underlying column visibility preferences if they switch back to `Quotation` mode.
  - *Why*: Warehouse dispatch notes and site receiving copies must never leak commercial pricing to site receivers or third-party transport drivers.

- **Decision 3: Single-Sheet Receipt Voucher Layout with Optional Itemized Schedule**
  - *Chosen Approach*: In `receipt` (`REC`) mode, the A4 canvas renders a dedicated Official Receipt Voucher layout (Top Metadata Grid, Highlighted Amount Received & `@amount_in_words` Banner, Payment Instrument Card, and Account Settlement Summary Table) and hides the product line-items table by default (`show_line_items_table: false`), with a 1-click toggle to append the itemized schedule below when required.
  - *Why*: B2B advance and milestone receipts are typically single-page accounting vouchers where the settlement math (`Total Order Value` − `Previously Received` − `Current Payment` = `Balance Outstanding`) is the primary legal record.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Flow Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        Enquiry Detail: Documents & Quotes Hub                 │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  Filter Tabs:       │  │ 1-Click Conversions: │  │ Supplier PO Item &   │  │
│  │  All | QT | DO |    │  │ • Issue Delivery Note│─▶│ Vendor Picker Modal  │  │
│  │  PO  | REC          │  │ • Issue Supplier PO  │  │ (Maps cost_price +   │  │
│  │                     │  │ • Issue Receipt      │  │  filters items/subs) │  │
│  └──────────┬──────────┘  └──────────┬───────────┘  └──────────┬───────────┘  │
└─────────────┼────────────────────────┼─────────────────────────┼──────────────┘
              │                        ▼                         │
              │         ┌──────────────────────────────┐         │
              └────────▶│   QuotationRepository & DB   │◀────────┘
                        │  • Shared `quotations` store │
                        │  • Linked Ref Generator      │
                        │    (DO-XXXX-01, PO-XXXX-01)  │
                        └──────────────┬───────────────┘
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                  Commercial Document Suite Studio (Modal)                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ Header Switcher: [ Quotation (QT) | Delivery (DO) | PO | Receipt (REC)] │  │
│  └───────────────────┬─────────────────────────────────────┬───────────────┘  │
│                      ▼                                     ▼                  │
│  ┌───────────────────────────────────────┐ ┌───────────────────────────────┐  │
│  │ Contextual Inspector Drawer (2-Col):  │ │ Shared Token Resolver Engine  │  │
│  │ • DO: Logistics, Vehicle, Partial Qty │ │ • @delivery_ref, @vehicle_no  │  │
│  │ • PO: Vendor, Incoterms, Ship-To      │ │ • @po_ref, @supplier_name     │  │
│  │ • REC: Payment Mode, Settlement Math  │ │ • @receipt_ref, @balance_due  │  │
│  └───────────────────┬───────────────────┘ └───────────────┬───────────────┘  │
│                      └──────────────────┬──────────────────┘                  │
│                                         ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                 A4 Document Renderer (QuotationDocument)                │  │
│  │  • QT Mode: Standard Commercial Proposal & Multi-Option Pricing         │  │
│  │  • DO Mode: Unpriced Table (Ordered/Delivered/Balance + Serial/Batch #) │  │
│  │             + Dual Dispatch (@our_company) & Consignee Sign-Off Block   │  │
│  │  • PO Mode: Vendor & Ship-To Grid + Supplier Cost Table + Auth Block    │  │
│  │  • REC Mode: Official Receipt Voucher + Amount in Words + Balance Table │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Token Extensions
1. **Core Document Types & Metadata**:
   - `CommercialDocumentType = 'quotation' | 'delivery_note' | 'purchase_order' | 'receipt' | 'proforma_invoice' | 'tax_invoice'`
   - `DeliveryNoteMetadata`: `delivery_ref`, `delivery_date`, `related_quote_ref`, `customer_po_no`, `site_contact_name`, `site_contact_phone`, `delivery_address`, `vehicle_plate_no`, `driver_name`, `driver_phone`, `dispatch_mode` (`'Company Transport' | 'Courier / Freight' | 'Customer Collection (Ex-Works)'`), `dispatched_by_name`, `received_by_name`, `received_by_title`, `goods_received_clause`, `stock_deducted?: boolean`.
   - `PurchaseOrderMetadata`: `po_variant` (`'supplier_po' | 'order_acknowledgment'`), `po_ref`, `po_date`, `supplier_id`, `supplier_name`, `supplier_contact`, `supplier_email`, `supplier_phone`, `supplier_tax_id`, `shipping_destination` (`'Company Warehouse' | 'Direct Client Site'`), `shipping_address`, `incoterms` (`'Ex-Works' | 'FOB' | 'CIF' | 'DDP' | 'Standard Delivery'`), `payment_terms`, `target_delivery_date`.
   - `ReceiptVoucherMetadata`: `receipt_ref`, `receipt_date`, `received_from`, `settlement_for_ref`, `project_title`, `amount_received`, `currency`, `payment_method` (`'Bank Wire Transfer' | 'Cheque' | 'Cash' | 'Online / Card'`), `bank_txn_ref`, `cheque_no`, `cheque_bank`, `cheque_date`, `deposit_account`, `total_order_value`, `previously_received`, `balance_outstanding`, `show_line_items_table?: boolean`.
   - `QuotationLineItem` & `LineItemComponent` extensions: `qty_ordered?: number`, `qty_delivered?: number`, `qty_balance?: number`, `serial_batch_no?: string`.
2. **Dynamic `@Data` Tags (`QUOTATION_AT_TAGS` & `buildQuotationTokenMap`)**:
   - **Delivery Note Tags**: `@delivery_ref`, `@delivery_date`, `@vehicle_no`, `@driver_name`, `@site_address`, `@customer_po`.
   - **Purchase Order Tags**: `@po_ref`, `@po_date`, `@supplier_name`, `@supplier_tax_id`, `@incoterms`.
   - **Payment Receipt Tags**: `@receipt_ref`, `@payment_mode`, `@bank_ref`, `@amount_paid`, `@previously_paid`, `@balance_due`, plus automatic currency-aware `@amount_in_words` (resolving `receipt_metadata.amount_received` when in `receipt` mode, or `grand_total` in priced modes).

### Interactive Component & State Mapping
- **Delivery Note Partial Shipment & Stock Action**:
  - Editing `qty_delivered` or `serial_batch_no` in Studio's Line Items editor immediately recalculates `qty_balance = Math.max(0, (qty_ordered ?? quantity) - qty_delivered)`.
  - When a `DO` is saved/issued, an optional **"Deduct Delivered Qty from Stock"** action button is offered if any line item links to a catalog `product_id` and has not yet been deducted (`delivery_metadata.stock_deducted !== true`).
- **Outbound Supplier PO Conversion Modal**:
  - Clicking **Issue Supplier PO** opens a focused selection modal where the user can pick a Supplier from the `Companies` directory (or enter vendor details), check/uncheck which line items to include on this PO, and inspect the resolved unit cost (`item.cost_price ?? catalogProduct.cost_price ?? 0`) before launching the Studio.
- **Payment Receipt Cumulative Settlement**:
  - Clicking **Issue Payment Receipt** queries existing `receipt` documents for the Enquiry, sums their `amount_received` into `previously_received`, sets `total_order_value` from the active/winning quotation's `grand_total`, and dynamically updates `balance_outstanding = Math.max(0, total_order_value - previously_received - amount_received)` as the user types `amount_received`.
- **Industry-Agnostic Microcopy Sweep**:
  - Sanitizes all remaining domain-specific or company-specific placeholder strings across Enquiry, Catalog, Composite BOM, and Quotation Studio components into neutral, multi-industry B2B terminology.
