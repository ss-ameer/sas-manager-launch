/**
 * Canonical Overlay Z-Index Scale
 *
 * Every floating layer, drawer, studio, nested modal, blocking dialog, and toast
 * MUST reference one of these explicit Tailwind class constants so Tailwind JIT
 * statically includes each utility and stacking layers never overlap or collide.
 */

/** Sticky table headers, section toolbars, and inline dropdown backdrops */
export const Z_STICKY = 'z-30';

/** Primary detail drawers & top-level modals (EnquiryDetail, Company360Modal, TrashBinModal) */
export const Z_DRAWER = 'z-[60]';

/** Fullscreen studios & cross-cutting drawers (QuotationStudioModal, QuickActivityDrawer, LiveExecutionModal) */
export const Z_STUDIO = 'z-[80]';

/** Child modals launched from inside drawers or studios (CompanyEditModal, ContactModal, CallLogDetailModal, SaveToCatalogModal, CreateCompanyModal, ShareModal, PO builder, quote preview) */
export const Z_NESTED_MODAL = 'z-[100]';

/** Blocking confirmation dialogs, delete prompts, decline modals, file previews, and image lightboxes */
export const Z_BLOCKING_DIALOG = 'z-[120]';

/** Global toast / notification viewport — strictly above every modal, studio, and lightbox */
export const Z_TOAST = 'z-[200]';
