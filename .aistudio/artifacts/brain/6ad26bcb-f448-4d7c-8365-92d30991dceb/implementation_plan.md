# Global Runtime Stability Sweep — Implementation Plan

## 1. Fix Missing Icon Imports in `EnquiryList.tsx`
- **File**: `/src/components/EnquiryList.tsx`
- **Root Cause**: `FileSpreadsheet` (rendered in the CSV/Excel import action bar) and `AlertTriangle` (rendered in the bulk-delete error banner) are used in JSX without being included in the top-level `lucide-react` import statement.
- **Changes**:
  - Add `FileSpreadsheet` and `AlertTriangle` to the `import { ... } from 'lucide-react';` statement at the top of `/src/components/EnquiryList.tsx`.
  - Verify all other `lucide-react` icons referenced in `EnquiryList.tsx` (`FileText`, `Search`, `Plus`, `Download`, `Upload`, `Filter`, `ArrowUpDown`, `ChevronRight`, `ChevronLeft`, `ChevronsLeft`, `ChevronsRight`, `X`, `Check`, `Trash`, `ChevronDown`, `Clock`, `RotateCcw`, `CheckSquare`, `Hash`, `TrendingUp`, `CheckCircle2`, `Activity`) are explicitly imported.

---

## 2. Harden Sample Quotation & Defensive Guards in `Settings -> Documents`
- **Files**:
  - `/src/components/settings/WorkspaceDocumentProfileSettings.tsx`
  - `/src/components/quotations/QuotationDocument.tsx`
  - `/src/services/repositories/QuotationRepository.ts`
  - `/src/utils/quotationTokenResolver.ts`
- **Changes**:
  1. **`WorkspaceDocumentProfileSettings.tsx`**:
     - Populate `sandboxQuotation` with complete required fields:
       - `document_type: 'quotation'`
       - `status: 'Draft'`
       - `line_items: Array.isArray(processedItems) ? processedItems : []`
       - `layout_blocks: Array.isArray(activeSandboxPreset?.layout_blocks) && activeSandboxPreset.layout_blocks.length > 0 ? activeSandboxPreset.layout_blocks : DEFAULT_QUOTATION_BLOCKS`
       - `financial_totals: { subtotal: financials.subtotal ?? 0, total_discount: 0, taxable_amount: (financials.subtotal ?? 0) + (financials.freight_amount ?? 0), tax_amount: financials.tax_amount ?? 0, grand_total: financials.grand_total ?? 0, total_units: processedItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0) }`
       - `grand_total: financials.grand_total ?? 0`
       - `client_snapshot: { entity_name: 'Apex Infrastructure Corp.', ... }`
     - Guard numeric formatting on `sandboxQuotation.grand_total`, `sandboxQuotation.subtotal`, and `sandboxQuotation.tax_amount` using nullish coalescing (`(sandboxQuotation.grand_total ?? 0).toLocaleString()`).
  2. **`QuotationDocument.tsx`**:
     - In `resolveModularLayoutBlocks(rawBlocks)`, ensure `Array.isArray(rawBlocks)` is checked and filter out any null/undefined entries before `.map(...)`, falling back to `DEFAULT_QUOTATION_BLOCKS`.
     - Guard all accesses to `quotation?.layout_blocks`, `quotation?.line_items`, `quotation?.custom_totals_rows`, and `quotation?.financial_totals?.grand_total ?? quotation?.grand_total ?? 0`.
     - Wrap `<QuotationDocument>` with an internal `QuotationDocumentErrorBoundary` class component so that if any template preview encounters malformed or partial mock state, it renders a clean `"Preview unavailable with current mock settings"` fallback card instead of crashing the host screen.
  3. **`QuotationRepository.ts`**:
     - Harden `QuotationRepository.computeCustomRowsAdjustment(customRows, baseSubtotal, baseTaxTotal)` so non-array `customRows` or null entries safely return `0`.
  4. **`quotationTokenResolver.ts`**:
     - Harden `buildQuotationTokenMap`, `resolveSingleTagValue`, and `resolveQuotationTokens` so `ctx` defaults to `{}` and reading/caching `_cachedTokenMap` is wrapped in a safe check (`try { ctx._cachedTokenMap = builtMap; } catch {}`) in case `ctx` or `ctx.quotation` is partial or frozen.

---

## 3. Codebase-Wide Component Icon & Import Audit (`src/components/**/*.tsx`)
- Scan every `.tsx` file under `/src/components/` (including `quotations/`, `settings/`, and `layout/`) to ensure every PascalCase JSX element (especially `lucide-react` icons) is either defined in-file or explicitly imported at the top of the file.
- Run `compile_applet` (`tsc --noEmit` and `npm run build`) to confirm zero TypeScript or bundle errors.
