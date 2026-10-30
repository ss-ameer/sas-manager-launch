# Quotation Studio Right Inspector Expansion & Word-Style Selection Text Editor

Upgrade the Quotation Studio workspace proportions and piece text editor by widening the overall Studio Modal to `1600px` with a standard `400px` Right Inspector Drawer, replacing the cramped collapsible typography drawer with a clean single-row Word-style formatting ribbon + labeled style controls, and enabling inline formatting (`**bold**`, `*italic*`, `__underline__`, and `==highlight==`) directly on highlighted text selections.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed answers from Phase 1:

- **Confirmed Decision 1 — Inline Selection vs. Whole-Piece Formatting**: Clicking **Bold (`B`)**, **Italic (`I`)**, or **Underline (`U`)** (or pressing `Ctrl/Cmd + B/I/U`) when a text range is highlighted inside a Heading, Rich Text, or List input wraps or unwraps **only the selected text** (`**bold**`, `*italic*`, `__underline__`). When no text is highlighted, clicking `B`, `I`, or `U` toggles the whole-piece style (`fontWeight`, `italic`, `underline`).
- **Confirmed Decision 2 — Word-Style Single-Row Formatting Ribbon**: Replace the wrapping accordion strip with an ergonomic, always-ready **Word-Style Formatting Ribbon** attached directly above the text input (`Size | B I U AA | Align | + @Tag`), paired with a clean 3-column labeled control row (`Text Color`, `Line Spacing`, `Highlight Fill`) underneath that never truncates labels.
- **Confirmed Decision 3 — Standard 400px Right Inspector & 1600px Studio Modal**: Expand the Quotation Studio modal container from `max-w-[1400px]` to `max-w-[1600px]` (`w-[96vw]`) and standardize all Right Contextual Inspector Drawers (`Header`, `Recipient`, `Offer Metadata`, `Subject`, `Footer`, `Line Items Table`, and `Block Inspector`) to a roomy `w-[380px] xl:w-[410px]` (~`400px` standard width) so controls, sliders, and piece editors never clip or wrap awkwardly.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Roomy 400px Right Inspector & 1600px Studio Frame**: Gives all contextual inspectors on the right side of Quotation Studio a true standard width (`380px–410px`) inside a wider `1600px` studio viewport, eliminating cramped multi-line labels and truncated dropdowns (`Color: Dar`, `Spacing: R`).
  2. **Unified Word-Style Editor Frame**: Integrates the formatting ribbon and text input into a single cohesive editor card (toolbar top border + input body + labeled style bar), removing the duplicate `+ Insert @Tag` bar below Rich Text areas.
  3. **Smart Selection-Aware Formatting (`B` / `I` / `U` + Keyboard Shortcuts)**: Tracks text selection inside `AtMentionInput` and `AtMentionTextarea` so users can highlight specific words or `@tags` and click **Bold**, **Italic**, or **Underline** (or press `Ctrl+B`, `Ctrl+I`, `Ctrl+U`) to format just that phrase, or click with no selection to style the entire piece.
- **Target Audience / Persona**: Commercial engineers and sales executives customizing headings, executive summaries, scope notes, and bullet lists in Quotation Studio.
- **Key Value**: Familiar word-processor ergonomics with zero text clipping, instant selection-level or piece-level formatting, and generous breathing room across the 3-pane studio layout.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Expanding & Inspecting Any Section**: Clicking any block on the A4 preview opens the standardized `400px` Right Inspector Drawer. Even with both Left and Right drawers open on a desktop monitor, the `1600px` modal frame preserves a clear central A4 canvas.
  2. **Formatting Selected Words vs. Whole Piece**:
     - Highlighting `"commercial and technical proposal"` inside a Rich Text piece and clicking **B** (or pressing `Ctrl+B`) immediately wraps the selection in `**commercial and technical proposal**` (or unwraps it if already bolded) and keeps the selection active.
     - Clicking **B**, **I**, or **U** without highlighting text toggles the entire piece's bold, italic, or underline style, with a subtle indicator showing whether whole-piece formatting is active.
  3. **Single-Row Ribbon + Labeled Dropdowns**:
     - **Top Ribbon Row**: `XS SM MD LG XL` segmented size pills $\cdot$ `B` `I` `U` `AA` formatting buttons $\cdot$ `Left` `Center` `Right` `Justify` alignment icons $\cdot$ `+ @Tag` quick-insert selector.
     - **Secondary Labeled Style Row**: Three clean stacked mini-columns with explicit micro-labels above each select (`COLOR`, `SPACING`, `HIGHLIGHT`) so values like `Dark Ink`, `Normal`, and `Brand Tint` display in full without `Color: Dar...` truncation.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision commercial document studio with crisp `1px` structural borders (`border-slate-200`), unified input-toolbar framing, and tabular monospace badges (`tabular-nums`).
  - *Color Palette & Mood*: Clean white editor surface (`#FFFFFF`), cool slate toolbar header (`bg-slate-50/90`), and focused indigo active states (`bg-indigo-600 text-white`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Selection Preservation via `onMouseDown={(e) => e.preventDefault()}` on Toolbar Buttons**:
  - *Chosen Approach*: Prevent focus loss when clicking `B`, `I`, or `U` in the ribbon so the active `<input>` or `<textarea>` retains its `selectionStart` and `selectionEnd` range.
  - *Why*: Standard `<button>` clicks steal focus from text inputs before `onClick` runs, which would otherwise clear the user's text highlight or require stale state tracking. Preventing default on `onMouseDown` keeps the native browser selection intact.
- **Decision 2 — Eliminating Redundant `@Tag` Bars in Piece Editors**:
  - *Chosen Approach*: Since the Word-style ribbon header includes the `+ @Tag` selector (and `@` autocomplete works inline while typing), hide the redundant bottom `+ Insert @Tag` footer bar inside custom piece editors (`showInsertBar={false}`).
  - *Why*: Saves ~32px of vertical height per Rich Text piece and removes duplicate controls in the inspector.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ QuotationStudioModal (w-[96vw] max-w-[1600px] h-[95vh])                      │
├──────────────────────┬───────────────────────────────┬───────────────────────┤
│ Left Controls Drawer │ Center Live A4 Canvas         │ Right Inspector Drawer│
│ (460px, Collapsible) │ (flex-1, Scaled 210mm×297mm)  │ (w-[380px] xl:w-[410])│
└──────────────────────┴───────────────────────────────┴───────────┬───────────┘
                                                                   │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Unified Piece Text Editor Card (Heading / Rich Text / List)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Row 1 (Word Ribbon): [XS SM MD LG XL] │ [B I U AA] │ [L C R J] │ [+ @Tag ▾] │
│ Row 2 (Labeled Grid): [COLOR: Dark Ink ▾] [SPACING: Normal ▾] [FILL: None ▾] │
├──────────────────────────────────────────────────────────────────────────────┤
│ Connected Input / Textarea (Selection-Aware **bold**, *italic*, __uline__)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Selection-Aware Inline Formatting Helper**:
   - Track the active DOM `<input>` or `<textarea>` element for each piece via a ref map (`pieceInputRefs.current[piece.id]`).
   - When the user clicks `B` (`**`), `I` (`*`), or `U` (`__`) in the ribbon (or presses `Ctrl/Cmd + B/I/U` inside the field):
     - Check `el.selectionStart !== el.selectionEnd`.
     - If a range is selected, toggle the markdown wrapper (`**...**`, `*...*`, `__...__`) around the selected substring, update the piece's text, and restore the selection range via `requestAnimationFrame`.
     - If no range is selected (`selectionStart === selectionEnd`), toggle the piece-level `QuotationTextFormatStyle` property (`fontWeight: 'bold' | 'normal'`, `italic: boolean`, `underline: boolean`).
2. **Standardized 400px Right Inspector Width**:
   - Update all 7 contextual `<aside>` inspector drawers in `QuotationStudioModal` from `w-80 md:w-84` (where `w-84` was a non-existent Tailwind class falling back to `320px`) to `w-full sm:w-[380px] xl:w-[410px]`, and widen the studio modal shell to `w-[96vw] max-w-[1600px]`.
