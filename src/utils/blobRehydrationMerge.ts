/**
 * Pure helpers for:
 * 1. Studio Hydration Identity Guard (P1-1): Prevents background `enquiry.updatedAt`
 *    changes from re-running full studio hydration and wiping unsaved edits.
 * 2. Non-Destructive Async Blob Rehydration Merge (P1-2): Merges late-resolving
 *    IndexedDB blob URLs onto the latest functional React state strictly where
 *    storage keys still match and fields were not manually cleared or replaced.
 */

export function resolveStudioHydrationTargetKey(
  editingQuotationId?: string | null,
  enquiryId?: string | null
): string {
  const cleanQuoteId = String(editingQuotationId || '').trim();
  if (cleanQuoteId) return `quote:${cleanQuoteId}`;
  const cleanEnquiryId = String(enquiryId || '').trim();
  if (cleanEnquiryId) return `enquiry:${cleanEnquiryId}`;
  return '__new__';
}

export function shouldRunStudioHydration(
  previouslyHydratedTargetKey: string | null | undefined,
  nextTargetKey: string
): boolean {
  return previouslyHydratedTargetKey !== nextTargetKey;
}

function nonEmptyStr(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function keysMatch(prevKey: unknown, rehKey: unknown): boolean {
  const a = nonEmptyStr(prevKey);
  const b = nonEmptyStr(rehKey);
  return a.length > 0 && a === b;
}

function isImageExplicitlyHidden(item: any): boolean {
  const override = String(item?.image_display_override || '').trim().toLowerCase();
  return override === 'hidden' || override === 'none';
}

function sameStringArray(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => nonEmptyStr(v) !== '' && nonEmptyStr(v) === nonEmptyStr(b[i]));
}

/**
 * Non-destructively merges resolved blob URLs & rasterized pages from a single
 * rehydrated attachment onto the latest attachment state.
 */
export function mergeRehydratedAttachmentBlob<T extends Record<string, any>>(
  prevAtt: T | null | undefined,
  rehAtt: Record<string, any> | null | undefined
): T | null | undefined {
  if (!prevAtt || !rehAtt) return prevAtt;

  let changed = false;
  let next: Record<string, any> = prevAtt;

  const prevUrl = nonEmptyStr(prevAtt.url);
  const rehUrl = nonEmptyStr(rehAtt.url);
  if (!prevUrl && rehUrl && keysMatch(prevAtt.storageKey, rehAtt.storageKey)) {
    next = { ...next, url: rehAtt.url };
    changed = true;
  }

  const prevPages = Array.isArray(prevAtt.renderedPages)
    ? prevAtt.renderedPages
    : Array.isArray(prevAtt.rendered_pages)
    ? prevAtt.rendered_pages
    : [];
  const rehPages = Array.isArray(rehAtt.renderedPages)
    ? rehAtt.renderedPages
    : Array.isArray(rehAtt.rendered_pages)
    ? rehAtt.rendered_pages
    : [];

  const pageKeysAligned =
    sameStringArray(prevAtt.rendered_page_keys, rehAtt.rendered_page_keys) ||
    keysMatch(prevAtt.storageKey, rehAtt.storageKey);

  if (prevPages.length === 0 && rehPages.length > 0 && pageKeysAligned) {
    next = {
      ...(changed ? next : { ...prevAtt }),
      renderedPages: rehPages,
      rendered_pages: rehPages
    };
    changed = true;
  }

  return (changed ? next : prevAtt) as T;
}

/**
 * Non-destructively merges resolved blob URLs onto the latest attachments / flyer_attachments
 * array without resurrecting deleted attachments or overwriting newer metadata edits.
 */
export function mergeRehydratedAttachmentsBlobs<T extends Record<string, any>>(
  prevAtts: T[] | null | undefined,
  rehydratedAtts: Array<Record<string, any>> | null | undefined
): T[] {
  if (!Array.isArray(prevAtts) || prevAtts.length === 0) {
    return Array.isArray(prevAtts) ? prevAtts : [];
  }
  if (!Array.isArray(rehydratedAtts) || rehydratedAtts.length === 0) {
    return prevAtts;
  }

  let anyChanged = false;
  const nextAtts = prevAtts.map((prevAtt, idx) => {
    const prevId = nonEmptyStr(prevAtt?.id);
    const prevKey = nonEmptyStr(prevAtt?.storageKey);

    const matchedReh =
      (prevId && rehydratedAtts.find((r) => nonEmptyStr(r?.id) === prevId)) ||
      (prevKey && rehydratedAtts.find((r) => nonEmptyStr(r?.storageKey) === prevKey)) ||
      (rehydratedAtts[idx] &&
      (!prevId || !nonEmptyStr(rehydratedAtts[idx]?.id) || nonEmptyStr(rehydratedAtts[idx]?.id) === prevId)
        ? rehydratedAtts[idx]
        : undefined);

    if (!matchedReh) return prevAtt;
    const merged = mergeRehydratedAttachmentBlob(prevAtt, matchedReh);
    if (merged && merged !== prevAtt) {
      anyChanged = true;
      return merged;
    }
    return prevAtt;
  });

  return anyChanged ? nextAtts : prevAtts;
}

/**
 * Non-destructively merges ONLY resolved blob/image/datasheet URLs from an async
 * `rehydrateDocumentBlobsFromLocal` result onto the latest `line_items` array.
 *
 * Guarantees:
 * - Never overwrites newer user edits to prices, quantities, names, descriptions,
 *   options, or attributes.
 * - Never resurrects an image that the user manually cleared (cleared `image_storage_key`
 *   or `image_display_override === 'hidden'`) or replaced with a different upload.
 */
export function mergeRehydratedLineItemBlobs<T extends Record<string, any>>(
  prevItems: T[] | null | undefined,
  rehydratedItems: Array<Record<string, any>> | null | undefined
): T[] {
  if (!Array.isArray(prevItems) || prevItems.length === 0) {
    return Array.isArray(prevItems) ? prevItems : [];
  }
  if (!Array.isArray(rehydratedItems) || rehydratedItems.length === 0) {
    return prevItems;
  }

  let anyItemChanged = false;

  const nextItems = prevItems.map((prevItem, idx) => {
    if (!prevItem || typeof prevItem !== 'object') return prevItem;
    const prevId = nonEmptyStr(prevItem.id);

    const rehItem =
      (prevId && rehydratedItems.find((r) => nonEmptyStr(r?.id) === prevId)) ||
      (rehydratedItems[idx] &&
      (!prevId || !nonEmptyStr(rehydratedItems[idx]?.id) || nonEmptyStr(rehydratedItems[idx]?.id) === prevId)
        ? rehydratedItems[idx]
        : undefined);

    if (!rehItem || typeof rehItem !== 'object') return prevItem;

    let itemChanged = false;
    let nextItem: Record<string, any> = prevItem;
    const ensureClone = () => {
      if (!itemChanged) {
        nextItem = { ...prevItem };
        itemChanged = true;
      }
    };

    // Primary image_url
    if (
      !nonEmptyStr(prevItem.image_url) &&
      nonEmptyStr(rehItem.image_url) &&
      !isImageExplicitlyHidden(prevItem) &&
      keysMatch(prevItem.image_storage_key, rehItem.image_storage_key)
    ) {
      ensureClone();
      nextItem.image_url = rehItem.image_url;
    }

    // Secondary image_url
    if (
      !nonEmptyStr(prevItem.secondary_image_url) &&
      nonEmptyStr(rehItem.secondary_image_url) &&
      keysMatch(prevItem.secondary_image_storage_key, rehItem.secondary_image_storage_key)
    ) {
      ensureClone();
      nextItem.secondary_image_url = rehItem.secondary_image_url;
    }

    // Datasheet URL
    if (
      !nonEmptyStr(prevItem.datasheet_url) &&
      nonEmptyStr(rehItem.datasheet_url) &&
      keysMatch(prevItem.datasheet_storage_key, rehItem.datasheet_storage_key)
    ) {
      ensureClone();
      nextItem.datasheet_url = rehItem.datasheet_url;
    }

    // Datasheet attachment blob
    if (prevItem.datasheet_attachment && rehItem.datasheet_attachment) {
      const mergedDs = mergeRehydratedAttachmentBlob(
        prevItem.datasheet_attachment,
        rehItem.datasheet_attachment
      );
      if (mergedDs && mergedDs !== prevItem.datasheet_attachment) {
        ensureClone();
        nextItem.datasheet_attachment = mergedDs;
      }
    }

    // Sub-component image URLs
    if (
      Array.isArray(prevItem.sub_components) &&
      prevItem.sub_components.length > 0 &&
      Array.isArray(rehItem.sub_components) &&
      rehItem.sub_components.length > 0
    ) {
      let anySubChanged = false;
      const nextSubs = prevItem.sub_components.map((prevSub: any, sIdx: number) => {
        if (!prevSub || typeof prevSub !== 'object') return prevSub;
        const prevSubId = nonEmptyStr(prevSub.id);
        const rehSub =
          (prevSubId &&
            rehItem.sub_components.find((rs: any) => nonEmptyStr(rs?.id) === prevSubId)) ||
          (rehItem.sub_components[sIdx] &&
          (!prevSubId ||
            !nonEmptyStr(rehItem.sub_components[sIdx]?.id) ||
            nonEmptyStr(rehItem.sub_components[sIdx]?.id) === prevSubId)
            ? rehItem.sub_components[sIdx]
            : undefined);

        if (
          rehSub &&
          !nonEmptyStr(prevSub.image_url) &&
          nonEmptyStr(rehSub.image_url) &&
          keysMatch(prevSub.image_storage_key, rehSub.image_storage_key)
        ) {
          anySubChanged = true;
          return { ...prevSub, image_url: rehSub.image_url };
        }
        return prevSub;
      });

      if (anySubChanged) {
        ensureClone();
        nextItem.sub_components = nextSubs;
      }
    }

    if (itemChanged) {
      anyItemChanged = true;
      return nextItem as T;
    }
    return prevItem;
  });

  return anyItemChanged ? nextItems : prevItems;
}

/**
 * Non-destructively merges resolved blob URLs (line_items + attachments) onto the latest
 * Enquiry object in state without clobbering any newer user edits.
 */
export function mergeRehydratedEnquiryBlobs<T extends Record<string, any>>(
  prevEnquiry: T,
  rehydratedEnquiry: Record<string, any> | null | undefined
): T {
  if (!prevEnquiry || !rehydratedEnquiry) return prevEnquiry;

  const nextLineItems = Array.isArray(prevEnquiry.line_items)
    ? mergeRehydratedLineItemBlobs(prevEnquiry.line_items, rehydratedEnquiry.line_items)
    : prevEnquiry.line_items;
  const nextAttachments = Array.isArray(prevEnquiry.attachments)
    ? mergeRehydratedAttachmentsBlobs(prevEnquiry.attachments, rehydratedEnquiry.attachments)
    : prevEnquiry.attachments;

  if (nextLineItems === prevEnquiry.line_items && nextAttachments === prevEnquiry.attachments) {
    return prevEnquiry;
  }

  return {
    ...prevEnquiry,
    ...(nextLineItems !== prevEnquiry.line_items ? { line_items: nextLineItems } : {}),
    ...(nextAttachments !== prevEnquiry.attachments ? { attachments: nextAttachments } : {})
  };
}
