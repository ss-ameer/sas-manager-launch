import React from 'react';
import { Company } from '../types';

export interface ParentIndustry {
  id: string;
  label: string;
  icon: string;
}

export const PARENT_INDUSTRIES: ParentIndustry[] = [
  { id: 'utilities_environment', label: 'Utilities & Environment', icon: '💧' },
  { id: 'construction_engineering', label: 'Construction & Engineering', icon: '🏗️' },
  { id: 'facility_services', label: 'Facility Services', icon: '🏢' },
  { id: 'manufacturing', label: 'Manufacturing', icon: '⚙️' },
  { id: 'trade_distribution', label: 'Trade & Distribution', icon: '📦' },
  { id: 'real_estate', label: 'Real Estate', icon: '🏘️' },
  { id: 'hospitality_leisure', label: 'Hospitality & Leisure', icon: '🏨' },
  { id: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { id: 'food_agriculture', label: 'Food & Agriculture', icon: '🌾' },
  { id: 'public_sector', label: 'Public Sector', icon: '🏛️' },
  { id: 'professional_services', label: 'Professional Services', icon: '💼' },
  { id: 'general_other', label: 'General / Other', icon: '🏷️' }
];

export const PARENT_INDUSTRIES_MAP: Record<string, ParentIndustry> = PARENT_INDUSTRIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<string, ParentIndustry>
);

export function getParentIndustry(id?: string | null): ParentIndustry | undefined {
  if (!id) return undefined;
  if (PARENT_INDUSTRIES_MAP[id]) {
    return PARENT_INDUSTRIES_MAP[id];
  }
  try {
    const raw = localStorage.getItem('omni_industry_taxonomy');
    if (raw) {
      const sectors = JSON.parse(raw);
      if (Array.isArray(sectors)) {
        const found = sectors.find((s: any) => s.id === id);
        if (found) {
          return {
            id: found.id,
            label: found.label || found.name || found.id,
            icon: found.icon || '🏷️'
          };
        }
      }
    }
  } catch (e) {
    // Ignore JSON or localStorage error
  }
  return undefined;
}

export interface IndustryBadgeData {
  icon: string;
  displayText: string;
  parentLabel?: string;
  parentId?: string;
}

/**
 * Safely returns the icon and display text for a company's industry badge.
 * Icon corresponds to company.industry_parent (defaults to '🏷️' if unmapped or legacy).
 * Display text prioritizes business_type_raw, then industry / industry_type, then 'Unspecified'.
 */
export function formatIndustryBadge(company?: Partial<Company> | null): IndustryBadgeData {
  if (!company) {
    return {
      icon: '🏷️',
      displayText: 'Unspecified'
    };
  }

  const parent = company.industry_parent ? getParentIndustry(company.industry_parent) : undefined;
  const icon = parent?.icon || '🏷️';
  const displayText =
    company.business_type_raw?.trim() ||
    company.industry?.trim() ||
    company.industry_type?.trim() ||
    'Unspecified';

  return {
    icon,
    displayText,
    parentLabel: parent?.label,
    parentId: parent?.id
  };
}

/**
 * Common GBP and industry suggestions to seed datalist autocomplete
 */
export const COMMON_GBP_SUBTYPES: string[] = [
  'Swimming pool contractor',
  'Swimming pool repair service',
  'Water treatment supplier',
  'MEP Contractor',
  'HVAC Contractor',
  'Civil Engineering Contractor',
  'General Contractor',
  'Facility Management Company',
  'Cleaning Service',
  'Pest Control Service',
  'Plumbing Contractor',
  'Electrical Contractor',
  'Manufacturing Plant',
  'Steel Fabrication',
  'Building Materials Supplier',
  'General Trading',
  'Wholesale Distributor',
  'Import & Export',
  'Real Estate Developer',
  'Property Management Company',
  'Hotel',
  'Resort',
  'Restaurant',
  'Catering Food and Beverage',
  'Hospital',
  'Medical Clinic',
  'Agricultural Service',
  'Landscaping Contractor',
  'Government Entity',
  'Engineering Consultant',
  'Architecture Firm',
  'Legal & Accounting Services'
];

/**
 * Known industry acronyms and uppercase terms that must be preserved in uppercase.
 */
export const KNOWN_INDUSTRY_ACRONYMS: Record<string, string> = {
  'mep': 'MEP',
  'hvac': 'HVAC',
  'f&b': 'F&B',
  'ro': 'RO',
  'fm': 'FM',
  'cctv': 'CCTV',
  'it': 'IT',
  'uae': 'UAE',
  'llc': 'LLC',
  'gbp': 'GBP',
  'ai': 'AI',
  'b2b': 'B2B',
  'b2c': 'B2C',
  'oem': 'OEM',
  'r&d': 'R&D',
  'saas': 'SaaS',
  'paas': 'PaaS'
};

/**
 * Normalizes a GBP child sub-type name:
 * 1. Trims whitespace and collapses multiple consecutive spaces.
 * 2. Formats words into Title Case (e.g., "water park" -> "Water Park").
 * 3. Protects known industry acronyms (e.g., "mep contractor" -> "MEP Contractor", "f&b service" -> "F&B Service").
 */
export function normalizeSubTypeName(input: string): string {
  if (!input) return '';
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const formatSegment = (seg: string): string => {
    const lower = seg.toLowerCase();
    if (KNOWN_INDUSTRY_ACRONYMS[lower]) {
      return KNOWN_INDUSTRY_ACRONYMS[lower];
    }
    if (!seg) return '';
    return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
  };

  const words = trimmed.split(' ');
  const normalizedWords = words.map((word) => {
    const lower = word.toLowerCase();
    if (KNOWN_INDUSTRY_ACRONYMS[lower]) {
      return KNOWN_INDUSTRY_ACRONYMS[lower];
    }
    // Handle hyphenated words (e.g., "full-service", "water-treatment")
    if (word.includes('-')) {
      return word.split('-').map(formatSegment).join('-');
    }
    // Handle slashed words (e.g., "import/export")
    if (word.includes('/')) {
      return word.split('/').map(formatSegment).join('/');
    }
    return formatSegment(word);
  });

  return normalizedWords.join(' ');
}

/**
 * Derives distinct business_type_raw values from existing companies
 */
export function getDistinctRawBusinessTypes(companies: Company[]): string[] {
  const set = new Set<string>();
  COMMON_GBP_SUBTYPES.forEach((st) => set.add(st));

  companies.forEach((c) => {
    if (c.business_type_raw?.trim()) {
      set.add(c.business_type_raw.trim());
    }
    if (c.industry?.trim()) {
      set.add(c.industry.trim());
    }
    if (c.industry_type?.trim()) {
      set.add(c.industry_type.trim());
    }
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export interface IndustryBadgeProps {
  company?: Partial<Company> | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  showEmpty?: boolean;
}

/**
 * Unified pill badge displaying `[Parent Icon] [business_type_raw]`
 */
export const IndustryBadge: React.FC<IndustryBadgeProps> = ({
  company,
  className = '',
  size = 'xs',
  showEmpty = false
}) => {
  const { icon, displayText, parentLabel } = formatIndustryBadge(company);

  if (displayText === 'Unspecified' && !showEmpty) {
    return null;
  }

  const sizeClasses = {
    xs: 'text-[11px] px-2 py-0.5 gap-1.5',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const tooltip = parentLabel
    ? `${parentLabel} • ${displayText}`
    : displayText;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 shadow-xs max-w-full truncate transition-colors ${sizeClasses} ${className}`}
      title={tooltip}
    >
      <span className="shrink-0 text-sm leading-none select-none">{icon}</span>
      <span className="truncate font-sans">{displayText}</span>
    </span>
  );
};
