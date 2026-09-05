import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, safeSetDoc } from '../firebase';
import { IndustryTaxonomySector } from '../types';
import { SYSTEM_INDUSTRY_TAXONOMY } from '../utils/defaults';

const STORAGE_KEY = 'omni_industry_taxonomy';

// In-memory cache & subscriber registry for singleton live synchronization
let cachedSectors: IndustryTaxonomySector[] = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[useIndustryTaxonomy] Failed reading initial localStorage cache:', err);
  }
  return SYSTEM_INDUSTRY_TAXONOMY;
})();

type SubscriberCallback = (sectors: IndustryTaxonomySector[]) => void;
const subscribers = new Set<SubscriberCallback>();
let unsubscribeFirestore: (() => void) | null = null;
let activeListenerCount = 0;

function notifySubscribers(newSectors: IndustryTaxonomySector[]) {
  cachedSectors = newSectors;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSectors));
  } catch (e) {
    // Ignore quota or private mode issues
  }
  subscribers.forEach((cb) => {
    try {
      cb(newSectors);
    } catch (e) {
      console.error('[useIndustryTaxonomy] Error in subscriber callback:', e);
    }
  });
}

function startFirestoreListener() {
  if (unsubscribeFirestore) return;

  try {
    unsubscribeFirestore = onSnapshot(
      doc(db, 'settings', 'industry_taxonomy'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && Array.isArray(data.sectors) && data.sectors.length > 0) {
            notifySubscribers(data.sectors);
          }
        }
      },
      (err) => {
        console.warn('[useIndustryTaxonomy] Firestore listener error, keeping cached sectors:', err);
      }
    );
  } catch (err) {
    console.warn('[useIndustryTaxonomy] Could not start snapshot listener:', err);
  }
}

function stopFirestoreListener() {
  if (activeListenerCount <= 0 && unsubscribeFirestore) {
    try {
      unsubscribeFirestore();
    } catch (e) {
      // ignore
    }
    unsubscribeFirestore = null;
  }
}

/**
 * Persists a new GBP sub-type directly to Firestore settings/industry_taxonomy
 * and instantly broadcasts to all local components.
 */
export async function persistCustomSubtype(
  parentId: string,
  newSubtypeName: string,
  userIdentifier: string = 'Operator'
): Promise<boolean> {
  const trimmed = newSubtypeName.trim();
  if (!trimmed) return false;

  const current = [...cachedSectors];
  let targetIdx = current.findIndex((s) => s.id === parentId);

  // If parent not found, fallback to 'general_other' or the first sector
  if (targetIdx === -1) {
    targetIdx = current.findIndex((s) => s.id === 'general_other');
    if (targetIdx === -1 && current.length > 0) {
      targetIdx = 0;
    }
  }

  if (targetIdx === -1) return false;

  const sector = current[targetIdx];
  const existingSubtypes = sector.subtypes || [];

  // Check case-insensitively if it already exists in this sector
  const exists = existingSubtypes.some(
    (st) => st.trim().toLowerCase() === trimmed.toLowerCase()
  );

  if (exists) {
    return true; // Already exists, consider it successful
  }

  const updatedSubtypes = [...existingSubtypes, trimmed];
  const updatedSectors = current.map((s, idx) =>
    idx === targetIdx ? { ...s, subtypes: updatedSubtypes } : s
  );

  // Instantly broadcast locally
  notifySubscribers(updatedSectors);

  // Persist to Firestore
  try {
    await safeSetDoc('settings', 'industry_taxonomy', {
      sectors: updatedSectors,
      updatedAt: new Date().toISOString(),
      updatedBy: userIdentifier
    });
    return true;
  } catch (err) {
    console.error('[useIndustryTaxonomy] Failed to persist custom sub-type to Firestore:', err);
    return false;
  }
}

/**
 * Utility to find which parent sector contains a given child sub-type
 */
export function findParentSectorForSubtype(
  sectors: IndustryTaxonomySector[],
  subtypeName?: string | null
): IndustryTaxonomySector | undefined {
  if (!subtypeName || !subtypeName.trim()) return undefined;
  const clean = subtypeName.trim().toLowerCase();

  return sectors.find((sector) =>
    (sector.subtypes || []).some((st) => st.trim().toLowerCase() === clean)
  );
}

/**
 * Reactive Hook: useIndustryTaxonomy
 * Provides live, synchronized Two-Tier Industry Taxonomy data and mutation methods.
 */
export function useIndustryTaxonomy() {
  const [sectors, setSectors] = useState<IndustryTaxonomySector[]>(() => cachedSectors);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    activeListenerCount++;
    if (activeListenerCount === 1) {
      startFirestoreListener();
    }

    const subscriber: SubscriberCallback = (newSectors) => {
      setSectors(newSectors);
      setLoading(false);
    };

    subscribers.add(subscriber);

    // Initial check in case cache updated
    if (cachedSectors !== sectors) {
      setSectors(cachedSectors);
    }

    return () => {
      subscribers.delete(subscriber);
      activeListenerCount--;
      if (activeListenerCount <= 0) {
        stopFirestoreListener();
      }
    };
  }, []);

  const getParentSector = useCallback(
    (id?: string | null): IndustryTaxonomySector | undefined => {
      if (!id) return undefined;
      return sectors.find((s) => s.id === id);
    },
    [sectors]
  );

  const findParentForSubtype = useCallback(
    (subtypeName?: string | null): IndustryTaxonomySector | undefined => {
      return findParentSectorForSubtype(sectors, subtypeName);
    },
    [sectors]
  );

  const getSubtypesForParent = useCallback(
    (parentId?: string | null): string[] => {
      if (!parentId) return [];
      const sec = sectors.find((s) => s.id === parentId);
      return sec ? sec.subtypes || [] : [];
    },
    [sectors]
  );

  const allSubtypesWithParent = useMemo(() => {
    const list: {
      subtype: string;
      parentId: string;
      parentLabel: string;
      parentIcon: string;
    }[] = [];

    sectors.forEach((sec) => {
      (sec.subtypes || []).forEach((st) => {
        list.push({
          subtype: st,
          parentId: sec.id,
          parentLabel: sec.label || sec.name || sec.id,
          parentIcon: sec.icon || '🏷️'
        });
      });
    });

    return list;
  }, [sectors]);

  const addCustomSubtype = useCallback(
    async (parentId: string, newSubtypeName: string, userIdentifier?: string) => {
      return persistCustomSubtype(parentId, newSubtypeName, userIdentifier);
    },
    []
  );

  return {
    sectors,
    loading,
    getParentSector,
    findParentForSubtype,
    getSubtypesForParent,
    allSubtypesWithParent,
    addCustomSubtype
  };
}

export default useIndustryTaxonomy;
