# Quotation Studio 2.0 — Phase 3: Smart `@` Tag Autocomplete, Snapshot Resolution & Field Include/Omit System

## 1. Architectural Vision & Core Principles

This phase upgrades Quotation Studio 2.0 with a smart `@` variable autocomplete and token resolution engine that bridges live deal data with frozen revision snapshots and per-quote field omission controls:

- **Snapshot-First Immutability**: Sent, approved, or locked quotations resolve `@` tokens exclusively from their frozen party and commercial snapshots so subsequent edits to an enquiry or company profile never alter historical quotes. New Draft revisions (`R0 -> R1`) refresh their snapshot from the live deal and company profile while preserving prior revisions untouched.
- **Email-Safe Token Parsing**: `@tag` matching activates only at the start of text or after whitespace or opening punctuation (`(`, `[`, `{`, `"`, `'`), ensuring email addresses (`sales@aventura.ae`, `info@client_name.com`) remain completely untouched. Double-curly `{{tag_name}}` syntax is also supported as a clean alias.
- **Choice A2 Empty/Omitted Fallback**: When a whitelisted `@` tag resolves to an empty value or is marked as omitted in the quote's checklist, it resolves to an em-dash (`—`) so labeled rows remain visible as `Label: —` unless `hideIfEmpty` is explicitly enabled on that row.
- **Unknown `@` Tag Detection & Pre-Print Guard**: Unrecognized `@tags` (such as typos like `@clinet_name`) are highlighted with a red warning pill on the live Studio preview canvas and trigger a confirmation prompt before PDF print/export, while stripping the warning border cleanly if printed.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        QUOTATION STUDIO 2.0 (PHASE 3)                        │
├──────────────────────────────────────┬───────────────────────────────────────┤
│  STUDIO CONTROLS & INPUTS            │  CENTRAL @ TOKEN RESOLVER             │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ Floating @ Autocomplete Input  │  │  │ Snapshot vs. Live Deal Selector │  │
│  │ • Grouped by 4 Categories      ├──┼─►│ • Locked/Sent -> Frozen Snapshot│  │
│  │ • Shows Live Resolved Value    │  │  │ • Draft -> Snapshot + Fallback  │  │
│  │ • 1-Click "+ @ Insert Tag" Btn │  │  └───────────────┬─────────────────┘  │
│  └────────────────────────────────┘  │                  ▼                    │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ Include / Omit Field Checklist │  │  │ Safe Parser & Choice A2 Engine  │  │
│  │ • 1-Click Eye Toggle (Omit)    ├──┼─►│ • Protects user@domain.com      │  │
│  │ • Syncs Card Visibility + @Tag │  │  │ • Omitted/Empty -> "—" (A2)     │  │
│  │ • 1-Click Copy @tag Button     │  │  │ • Flags Unknown @typos          │  │
│  └────────────────────────────────┘  │  └─────────────────────────────────┘  │
└──────────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. User Review & Critical Decisions

- **Unrecognized `@tag` Handling**: Unrecognized `@tags` (e.g., `@clinet_name`) are highlighted with a high-contrast crimson warning badge (`Unknown @tag: @clinet_name`) in the live Studio preview canvas and trigger a pre-print confirmation dialog before PDF export/print if any unresolved typos remain.
- **Synchronized Field Include / Omit Toggles**: Toggling a field between **Included** and **Omitted** in the **Document Data & `@` Fields** checklist updates `omitted_fields[key]` (causing `@tag` references to resolve to `—`) **and** synchronizes the corresponding structural visibility toggle on the Header, Recipient, or Terms cards without deleting any underlying Enquiry or Company data.
- **Snapshot Lifecycle Across Revisions**: Sent, accepted, rejected, or locked quotations strictly resolve from their frozen `client_snapshot` and `sender_snapshot`. Creating a new Draft revision (`R0 -> R1`) refreshes the snapshot from the live Enquiry and Company Profile while deep-cloning `omitted_fields` and preserving the historical revision untouched.

---

## 3. Canonical `@` Tag Catalog & Resolution Matrix

All 38 canonical tags are organized into four functional groups for both the floating `@` autocomplete menu and the central resolver:

```
┌─────────────────────────┬──────────────────────────────┬──────────────────────────────────────────────────────┐
│ Category                │ Supported @ Tags             │ Resolution Priority (Snapshot -> Draft Fallback)     │
├─────────────────────────┼──────────────────────────────┼──────────────────────────────────────────────────────┤
│ 1. Dates                │ @quote_date                  │ Quote issue date (created_at)                        │
│                         │ @valid_until                 │ Calculated/explicit expiry date (valid_until)        │
│                         │ @enquiry_date                │ enquiry_date -> logged_date                          │
│                         │ @projected_order_date        │ projected_order_date                                 │
│                         │ @followup_date               │ next_followup_date                                   │
├─────────────────────────┼──────────────────────────────┼──────────────────────────────────────────────────────┤
│ 2. Client & Project     │ @client_name                 │ client_snapshot.entity_name -> company_name          │
│                         │ @contact_person              │ client_snapshot.contact_person -> contact_person_name│
│                         │ @client_trn                  │ client_snapshot.trn -> client_trn                    │
│                         │ @client_phone                │ client_snapshot.phone -> client_phone                │
│                         │ @client_email                │ client_snapshot.email -> client_email                │
│                         │ @client_address              │ client_snapshot.address -> client_address            │
│                         │ @project_location            │ project_location -> client_snapshot.city             │
│                         │ @project_number              │ project_number                                       │
│                         │ @customer_ref                │ customer_reference_code                              │
│                         │ @enquiry_ref                 │ quote_ref_no                                         │
├─────────────────────────┼──────────────────────────────┼──────────────────────────────────────────────────────┤
│ 3. Our Company & Quote  │ @quote_ref                   │ formatted_quote_ref -> quote_number                  │
│                         │ @revision_no                 │ R + revision_number (e.g., R0, R1)                   │
│                         │ @our_company                 │ companyNameOverride -> sender_snapshot.entity_name   │
│                         │ @our_trn                     │ sender_snapshot.trn -> profile.trn                   │
│                         │ @our_phone                   │ sender_snapshot.phone -> profile.phone               │
│                         │ @our_email                   │ sender_snapshot.email -> profile.email               │
│                         │ @our_address                 │ sender_snapshot.address -> profile.address_line_1    │
│                         │ @sales_person                │ prepared_by -> sales_person -> assigned_to           │
│                         │ @signatory_name              │ primary_signatory_name -> profile.signatory_name     │
│                         │ @signatory_role              │ primary_signatory_title -> profile.signatory_title   │
├─────────────────────────┼──────────────────────────────┼──────────────────────────────────────────────────────┤
│ 4. Commercial, Bank     │ @price_basis                 │ price_basis -> termsConfig.priceBasis                │
│    & Totals             │ @payment_terms               │ payment_terms -> termsConfig.paymentTerms            │
│                         │ @delivery_lead_time          │ termsConfig.deliveryLeadTime                         │
│                         │ @quote_validity              │ validity_days (formatted as "X Days")                │
│                         │ @warranty_period             │ termsConfig.warrantyPeriod                           │
│                         │ @currency                    │ currency (e.g., AED, USD)                            │
│                         │ @subtotal                    │ Formatted currency + subtotal                        │
│                         │ @freight_amount              │ Formatted currency + freight_amount                  │
│                         │ @vat_amount                  │ Formatted currency + tax_amount                      │
│                         │ @grand_total                 │ Formatted currency + grand_total                     │
│                         │ @amount_in_words             │ Full amount in words for grand_total                 │
│                         │ @bank_name, @account_name    │ Active bank override -> selected bank account        │
│                         │ @account_no, @iban, @swift   │ Active bank override -> selected bank account        │
│                         │ @item_count, @scope_summary  │ Line item count & comma-joined item titles           │
└─────────────────────────┴──────────────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 4. Implementation Workstreams

### Workstream 1: Data Model & Revision Snapshot Persistence
- Extend the quotation and preset schemas with `omitted_fields?: Record<string, boolean>` to store per-quote and per-preset field inclusion/omission states.
- Update quotation serialization, hydration, and preset application so `omitted_fields` is preserved across save/load cycles and deep-cloned when creating a new revision.
- Update revision cloning (`R0 -> R1`) so that when a new Draft revision is spun up from an existing quote, fresh `client_snapshot` and `sender_snapshot` objects are captured when live Enquiry / Company Profile context is available, while locked/sent revisions retain their original frozen snapshots.

### Workstream 2: Central `@` Token Resolver & Document Rendering Engine
- Build the central token resolution module implementing:
  - **Snapshot-Aware Value Lookup**: Inspects `quotation.status` (`Draft` vs. locked states) to determine whether missing snapshot fields can fall back to live `enquiry` / `profile` values, and checks `omitted_fields[tagKey]` first.
  - **Email-Safe Regex Parser**: Matches `(^|[\s(\[{"'])@([a-zA-Z_][a-zA-Z0-9_]*)` and `\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}` so emails like `sales@aventura.ae` or `info@client_name.com` are never mistaken for tokens.
  - **Choice A2 Empty/Omit Resolution**: Resolves empty or omitted whitelisted tokens to `'—'`, and provides a helper for custom key-value rows (`resolveCustomRowValue`) that hides the row only when `row.hideIfEmpty === true` and the resolved value is empty or `'—'`.
  - **Unknown Token Inspector (`findUnknownAtTokens` & React Renderer)**: Identifies unrecognized `@tags` across all active text fields in the quotation and renders them in the live preview canvas with a subtle red warning badge (`print:bg-transparent print:border-none print:text-inherit print:p-0`).
- Integrate token resolution across all text regions of the A4 quotation document:
  - Project Subject Banner (`subject`)
  - Commercial Terms (`priceBasis`, `paymentTerms`, `deliveryLeadTime`, `warrantyPeriod`, `customNotes`, `applied_terms`, and `termsConfig.customRows`)
  - Remittance Instructions (`remittanceConfig.customNote` and `remittanceConfig.customRows`)
  - Client Acceptance Block (`acceptanceConfig.acceptanceStatementOverride` and `acceptanceConfig.customRows`)
  - Authorized Signatory Block (`footerConfig.forAndOnBehalfText` and `footerConfig.signatoryCustomLines`)
  - Footer Legal Disclaimer & Pills (`footerConfig.customDisclaimer` and `footerConfig.customFooterPills`)
  - Line Items Table (`item.description` and `item.option_scope_notes`)
- Enforce `omitted_fields` on structural document cards (Recipient Card, Header Meta Card, Commercial Terms, and Remittance rows) so omitting a field in the checklist hides or masks its structural row in lockstep with `@tag` resolution.

### Workstream 3: Floating `@` Autocomplete Input & Include/Omit Checklist UI
- Create reusable `<AtMentionInput />` and `<AtMentionTextarea />` components inside Quotation Studio:
  - Detect when the user types `@` at the start of the field or after whitespace/opening punctuation, opening a floating popover filterable by typing (`@cli` filters to `@client_name`, `@client_trn`, etc.) with keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`/`Tab`, `Escape`) and click-to-insert.
  - Provide a compact `+ @ Insert Tag` button in the field label/header bar for 1-click browsing and insertion at the current cursor position.
  - Render each menu item with its monospace `@tag`, human label, and live resolved value badge (`@client_name — Al Futtaim Engineering` or `Omitted (—)` if omitted).
- Upgrade Studio text inputs across Left Panel Tab 2, Right Inspector Cards, and Line Item Row Notes to use `<AtMentionInput />` / `<AtMentionTextarea />`.
- Add the collapsible **"Document Data & `@` Fields (Include / Omit)"** card at the top of Left Panel Tab 2 (`Deal Data & Content`):
  - Displays active fields grouped by category with their live resolved value, a 1-click **Copy `@tag`** pill, and a 1-click **Included / Omitted** Eye button.
  - Toggling a field updates `omittedFields[key]` and synchronizes the matching structural toggle on `recipientConfig`, `headerConfig`, or `termsConfig`.
- Add a pre-print validation check on the **Print / Save PDF** action that scans the quotation for unknown `@tags` and prompts the user with the specific typo(s) found before opening the print dialog.
