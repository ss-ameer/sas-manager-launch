import React from 'react';
import { Company, CompanyTemperature } from '../types';
import { safeUpdateDoc, safeSetDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';

export type StandardTemperature = 'Hot' | 'Warm' | 'Cold';

/**
 * Universal cycle order: 'hot' -> 'warm' -> 'cold' -> 'hot'
 */
export function getNextTemperature(current?: string, isDnc?: boolean): StandardTemperature {
  if (isDnc || (current || '').toUpperCase() === 'DNC') {
    return 'Hot';
  }
  const norm = (current || '').toLowerCase().trim();
  if (norm === 'hot') return 'Warm';
  if (norm === 'warm') return 'Cold';
  return 'Hot';
}

export function getTemperatureDisplay(temp?: string, isDnc?: boolean): {
  normalized: 'Hot' | 'Warm' | 'Cold' | 'DNC';
  label: string;
  next: StandardTemperature;
  tooltip: string;
  colorClass: string;
  badgeClass: string;
  iconBgClass: string;
} {
  const isDncActive = Boolean(isDnc || (temp || '').toUpperCase() === 'DNC');
  if (isDncActive) {
    return {
      normalized: 'DNC',
      label: 'DNC 🚫',
      next: 'Hot',
      tooltip: 'Click to cycle temperature (Current: DNC -> Next: Hot)',
      colorClass: 'text-rose-600 dark:text-rose-400',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
      iconBgClass: 'text-rose-500 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400'
    };
  }

  const norm = (temp || 'Cold').toLowerCase().trim();
  if (norm === 'hot') {
    return {
      normalized: 'Hot',
      label: 'Hot 🔥',
      next: 'Warm',
      tooltip: 'Click to cycle temperature (Current: Hot -> Next: Warm)',
      colorClass: 'text-orange-600 dark:text-orange-400',
      badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
      iconBgClass: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400'
    };
  }
  if (norm === 'warm') {
    return {
      normalized: 'Warm',
      label: 'Warm 🌤️',
      next: 'Cold',
      tooltip: 'Click to cycle temperature (Current: Warm -> Next: Cold)',
      colorClass: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      iconBgClass: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400'
    };
  }

  // Default is 'Cold'
  return {
    normalized: 'Cold',
    label: 'Cold ❄️',
    next: 'Hot',
    tooltip: 'Click to cycle temperature (Current: Cold -> Next: Hot)',
    colorClass: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    iconBgClass: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400'
  };
}

export interface CycleTemperatureOptions {
  companies?: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  onOptimisticUpdate?: (nextTemp: StandardTemperature) => void;
}

export async function cycleCompanyTemperature(
  companyId: string,
  currentTemp?: string,
  isDnc?: boolean,
  options?: CycleTemperatureOptions
): Promise<StandardTemperature> {
  const nextTemp = getNextTemperature(currentTemp, isDnc);
  const nowIso = new Date().toISOString();

  // 1. Optimistic callback if provided
  if (options?.onOptimisticUpdate) {
    options.onOptimisticUpdate(nextTemp);
  }

  // 2. Optimistic update to React setCompanies
  if (options?.setCompanies) {
    options.setCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId
          ? {
              ...c,
              temperature: nextTemp,
              is_dnc: false,
              dnc: false,
              updatedAt: nowIso
            }
          : c
      )
    );
  }

  // 3. Update Firestore
  try {
    await safeUpdateDoc('companies', companyId, {
      temperature: nextTemp,
      is_dnc: false,
      dnc: false,
      updatedAt: nowIso
    });
  } catch (e) {
    console.warn('[temperatureCycle] safeUpdateDoc failed, fallback to safeSetDoc:', e);
    const existingComp = options?.companies?.find((c) => c.id === companyId);
    if (existingComp) {
      await safeSetDoc('companies', companyId, {
        ...existingComp,
        temperature: nextTemp,
        is_dnc: false,
        dnc: false,
        updatedAt: nowIso
      });
    }
  }

  // 4. Update local repository
  try {
    await CompanyRepository.updateCompany(companyId, {
      temperature: nextTemp,
      is_dnc: false,
      dnc: false,
      updatedAt: nowIso
    });
  } catch (e) {
    console.warn('[temperatureCycle] CompanyRepository update failed:', e);
  }

  return nextTemp;
}
