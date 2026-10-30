# Quotation Studio 2.0 — Phase 4 of 4: Universal Custom Block Engine, Standard Text Editor & 'My Blocks' Library

## 1. Architectural Overview & Resolved Design Decisions

This final phase of **Quotation Studio 2.0** upgrades the single `QuotationBlockConfig` / `layoutBlocks` pipeline (**Option A — no parallel block pipeline**) so users can insert **Custom Blocks (`type: 'custom'`)** anywhere between the Header/Client Info and the end of the document (`zone: 'pre_table' | 'post_table'`), compose blocks from **11 modular Lego pieces** powered by a **Standard Text Editor Toolbar** with live `@` data tags, convert any legacy built-in block into a full custom clone, and save reusable templates into a **"My Blocks" Library** (`🔒 Private (Only Me)` or `🌐 Shared with Workspace`).

### Confirmed User Decisions
1. **Convert to Full Custom Block Behavior**: Clicking **`Convert to Full Custom Block`** inside any legacy built-in block inspector (`terms`, `remittance`, `totals`, `acceptance`, `signatory`) **hides the legacy block (`enabled: false, is_visible: false`) and inserts an editable custom clone in its exact position**, preserving document flow while allowing instant reversal if needed.
2. **Inserting from 'My Saved Blocks' Library**: Clicking **`+ Insert`** on a saved template in the **My Saved Blocks** library inserts an **independent deep copy** (regenerating fresh unique IDs for the block and all nested pieces/rows/columns) into the active quotation so edits inside a quote never unintentionally mutate the saved library template.
3. **Offline Scannable SVG QR Code Piece**: The `qr_code` piece renders a **deterministic, scannable offline SVG QR matrix** directly in the browser with `@tag` resolution (e.g., `@quote_ref`, `@grand_total`, `@company_website`) and zero external network calls, ensuring 100% reliability in A4 print/PDF export.

---

## 2. Planned Changes by File

### Step 1: Extend `QuotationBlockConfig` & Library Schema in `/src/types.ts`
- **Extend `QuotationBlockType`**: Add `'custom'` to the union type.
- **Define Custom Piece & Text Formatting Interfaces**:
  - `QuotationBlockPieceType`: `'heading' | 'rich_text' | 'list' | 'field_rows' | 'table' | 'money_summary' | 'image' | 'signature_box' | 'qr_code' | 'divider' | 'columns'`.
  - `QuotationTextFormatStyle`: `fontSize` (`'xs' | 'sm' | 'base' | 'lg' | 'xl'`), `fontWeight` (`'normal' | 'medium' | 'semibold' | 'bold'`), `italic`, `underline`, `textAlign` (`'left' | 'center' | 'right' | 'justify'`), `textColor` (`'default' | 'muted' | 'accent' | 'custom'`), `customColorHex`, `highlightBg` (`'none' | 'SoftYellow' | 'SoftBlue' | 'SoftEmerald' | 'SoftRose' | 'ThemeTint'`), `lineHeight` (`'tight' | 'normal' | 'relaxed'`), `letterSpacing` (`'normal' | 'wide' | 'uppercase_tracked'`).
  - `QuotationBlockFieldRowItem`: `{ id, enabled, label, value, hideIfEmpty?: boolean, valueBold?: boolean }`.
  - `QuotationBlockPiece`: Full configuration covering all 11 Lego piece types (including recursive `columns` with `columnCount?: 2 | 3 | 4` and `columnItems?: QuotationBlockPiece[][]`).
  - `SavedCustomBlockTemplate`: `{ id, name, description?, category, visibility: 'private' | 'workspace', created_by_user_id?, created_by_name?, created_at, block_config }`.
- **Extend `QuotationBlockConfig`**:
  - `zone?: 'pre_table' | 'post_table'` (default `'post_table'`).
  - `allowPageSplit?: boolean` (default `false`; `true` for long text/cover letters so they split naturally across A4 pages).
  - `borderStyleOverride?: 'inherit' | 'framed' | 'tinted' | 'left_accent' | 'minimal'`.
  - `pieces?: QuotationBlockPiece[]`.
- **Extend `WorkspaceDocumentProfile`**:
  - Add `saved_custom_blocks?: SavedCustomBlockTemplate[]` so saved custom blocks persist in IndexedDB (`WORKSPACE_DOCUMENT_PROFILES`) alongside a `localStorage` fallback (`crm_saved_custom_blocks_v1`).

---

### Step 2: Pre-Table Zone Routing & 11-Piece Custom Block Renderer in `/src/components/quotations/QuotationDocument.tsx`
- **Pre-Table vs Post-Table Block Routing**:
  - Split `resolvedBlocks` into:
    - `preTableBlocks = resolvedBlocks.filter(b => b.zone === 'pre_table' && b.enabled !== false && b.is_visible !== false)`
    - `postTableBlocks = resolvedBlocks.filter(b => b.zone !== 'pre_table')`
  - Pass `postTableBlocks` into `partitionBlocksIntoSheets(postTableBlocks, lineItems)`.
  - On Sheet 1 (`isFirst`), immediately after `{renderTopSection()}` and before `{sheet.tableChunk && renderItemsTable(...)}`, render `{preTableBlocks.length > 0 && <div className="mb-3">{renderBlocksGrid(preTableBlocks)}</div>}`.
- **Page-Break & Box Style Overrides in `renderBlocksGrid`**:
  - Respect `b.allowPageSplit === true`: omit `break-inside-avoid page-break-inside-avoid` classes and `breakInside: 'avoid'` inline styles on both the slot wrapper and inner card so long custom blocks flow across A4 pages.
  - Respect `b.borderStyleOverride`: support `'inherit'`, `'framed'`, `'tinted'`, `'left_accent'` (`border-l-4` in `accentColor`), and `'minimal'` (borderless).
  - Dispatch `(bType === 'custom' || (Array.isArray(b.pieces) && b.pieces.length > 0))` to `renderCustomBlock(b, isMinimalBlock)` while keeping all legacy built-in blocks (`terms`, `totals`, `remittance`, `acceptance`, `signatory`) rendering unchanged when `bType !== 'custom'`.
- **Implement `renderCustomBlock(block, isMinimalBlock)`**:
  - Render block header (if `block.title` is non-empty) using the active theme's section header style (`solid`, `tinted`, `underline`, `minimal`).
  - Render each enabled piece in `block.pieces`:
    1. `heading`: Styled heading with `renderResolvedQuotationText(piece.text, tokenContext)` + `applyTextFormatStyle(piece.textStyle)`.
    2. `rich_text`: Multi-paragraph text supporting inline `**bold**`, `*italic*`, `__underline__`, `@tag` tokens via `renderResolvedQuotationText`, and `piece.textStyle`.
    3. `list`: Bulleted (`•`), Numbered (`1.`), or Checkbox (`☐`) list items with `@tag` resolution and `piece.textStyle`.
    4. `field_rows`: Label/Value pairs rendered in `'split'`, `'inline'`, `'grid_2col'`, or `'table_4col'` layouts. Resolves `@tags` in both label and value; if value is empty/omitted and `row.hideIfEmpty !== true`, displays `'—'` (**Choice A2**).
    5. `table`: Custom mini-table with themed headers, `@tag` resolution in every cell, right-aligned numeric columns (`tabular-nums`), and optional highlighted summary footer row.
    6. `money_summary`: Read-only live financial summary rows (`Subtotal`, `Discount`, `Freight`, `Tax`, `Grand Total`, `Amount in Words`) bound directly to calculated quotation totals so numbers can never desync.
    7. `image`: Renders `company_logo`, `company_seal`, `signature`, or `custom_upload` (`piece.imageUrl`) with configurable height (`imageHeightPx`), alignment, and caption.
    8. `signature_box`: Single or Dual side-by-side signatory & stamp box with `@tag` resolution, signature lines, and optional company seal/signature overlays.
    9. `qr_code`: Offline deterministic SVG QR matrix generator encoding `resolveQuotationTokens(piece.qrValue || '@quote_ref', tokenContext)` with configurable size and caption.
    10. `divider`: Solid, dashed, double, or blank space divider (`spacerMm`).
    11. `columns`: Recursive 2-, 3-, or 4-column grid rendering nested `QuotationBlockPiece[]` inside each column.

---

### Step 3: Preset Factory, Standard Text Editor Toolbar & 'My Blocks' Library in `/src/components/quotations/QuotationStudioModal.tsx`
- **`createCustomBlockFromPreset(presetKey)` Factory**:
  - **6 Blank & Standard Layouts**:
    - `blank`: Empty custom block ready for pieces.
    - `cover_letter`: Pre-table (`zone: 'pre_table'`, `allowPageSplit: true`, `borderStyleOverride: 'minimal'`) salutation (`Dear @contact_person,`), intro rich text, and closing.
    - `scope_of_supply`: `100% Full` framed block with `list` piece (`•`) for scope & BOM notes.
    - `exclusions_warranty`: `50% Left/Right` framed block with `list` + `field_rows` for technical exclusions and warranty terms.
    - `delivery_schedule`: `100% Full` framed block with `table` piece (`Milestone / Item`, `Target Delivery`, `Payment / Remarks`).
    - `handover_checklist`: `100% Full` framed block with `list` (`checkbox` `☐`) + `signature_box` (`dual`) for delivery note / site handover sign-off.
  - **5 Recreated Built-In Blocks (Editable Custom Clones)**:
    - `clone_terms`: Commercial Terms (`field_rows` with `@validity_days`, `@payment_terms`, `@delivery_terms`, `@delivery_timeline`, `@incoterms`, `@warranty` + `list` of notes).
    - `clone_remittance`: Bank Remittance (`field_rows` in `split` layout with `@bank_name`, `@bank_account_name`, `@bank_account_no`, `@bank_iban`, `@bank_swift`, `@bank_branch`, `@bank_currency`).
    - `clone_totals`: Financial Summary (`money_summary` piece with live calculated rows + amount in words).
    - `clone_acceptance`: Customer Acceptance (`rich_text` declaration + `field_rows` for Name, Designation, PO #, Date + `signature_box`).
    - `clone_signatory`: Authorized Signatory & Stamp (`signature_box` + `image` for company seal & signature).
- **Left Panel — Document Sections & Page Order Enhancements**:
  - Group and badge blocks clearly so `zone === 'pre_table'` custom blocks display a **`⬆️ Above Table`** badge and `post_table` blocks display **`⬇️ Below Table`**, and allow deleting any `type === 'custom'` block alongside `page_break` and `spacer`.
  - Add a prominent **`+ Add Block`** button opening a 3-category popover/modal:
    1. **Blank & Standard Layouts** (6 presets)
    2. **Recreate Built-In Blocks (Editable Clones)** (5 presets)
    3. **My Saved Blocks (Private & Workspace)** — lists saved templates from `activeProfile.saved_custom_blocks` + `localStorage` filtered to `visibility === 'workspace' || created_by_user_id === currentUser.id`, showing `🔒 Private` or `🌐 Workspace` badges, **1-click deep-copy `+ Insert`**, and **Delete (`Trash2`)**.
- **Built-In Block Inspector — 1-Click Conversion**:
  - Inside the Right Inspector for `terms`, `remittance`, `totals`, `acceptance`, and `signatory`, add a **`✨ Convert to Full Custom Block`** button that sets `enabled: false, is_visible: false` on the legacy block, inserts its editable custom clone at the exact same index/order, and selects the new custom block in the Right Inspector.
- **Right Inspector — Two-Level Custom Block & Piece Editor**:
  - **Level 1: Block Bar (Top Card)**:
    - Block Title input, Position Zone pills (`⬆️ Above Items Table` vs `⬇️ Below Items Table`), Width (`100% Full` | `50% Left` | `50% Right`), Box Style (`Inherit Theme` | `Framed Card` | `Soft Tinted` | `Left Accent` | `Borderless`), `Allow Page Split` toggle, and **`💾 Save to My Blocks`** button + inline popover (`Block Name`, `🔒 Private (Only Me)` vs `🌐 Share with Workspace`).
  - **Level 2: Pieces Stack & Standard Text Editor Toolbar**:
    - Compact sortable list of pieces inside the block (`Move Up/Down`, `Enable/Disable`, `Duplicate`, `Delete`, plus **`+ Add Piece`** selector for all 11 Lego pieces).
    - Clicking a piece expands its dedicated editor and the **Standard Text Editor Toolbar**:
      - **Row 1 (Typography)**: Size (`XS | SM | Normal | LG | XL`), Style (`B`, `I`, `U`, `UPPERCASE`), Alignment (`Left | Center | Right | Justify`).
      - **Row 2 (Color, Spacing & Smart `@` Tags)**: Text & Highlight (`Default | Muted | Brand Accent` + Highlight pill `None | Yellow | Blue | Green | Rose | Theme`), Line Spacing (`Tight | Normal | Relaxed`), and **`@ Insert Data Tag`** dropdown/autocomplete.

---

## 3. Verification Plan
1. Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript errors across `/src/types.ts`, `/src/components/quotations/QuotationDocument.tsx`, and `/src/components/quotations/QuotationStudioModal.tsx`.
2. Run `compile_applet` (`npm run build`) to confirm clean production bundling.
3. Verify backward compatibility so existing saved quotations and presets with built-in blocks (`terms`, `totals`, `remittance`, `acceptance`, `signatory`) render identically without migration.
