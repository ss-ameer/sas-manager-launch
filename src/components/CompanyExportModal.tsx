import React, { useState, useMemo, useEffect } from 'react';
import { Company, Contact, Workspace } from '../types';
import { SYSTEM_INDUSTRY_TAXONOMY, isCompanyUntagged } from '../utils/defaults';
import { useIndustryTaxonomy } from '../hooks/useIndustryTaxonomy';
import { getParentIndustry, formatIndustryBadge } from '../utils/taxonomy';
import { getReferenceId } from '../utils/refId';
import { exportCompaniesToCSV, getPrimaryContactForCompany } from '../utils/exportUtils';
import {
  Download,
  Printer,
  X,
  Check,
  CheckSquare,
  Square,
  Search,
  Filter,
  Building2,
  MapPin,
  Sparkles,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  RefreshCw,
  Phone,
  UserCheck
} from 'lucide-react';

interface CompanyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Company[];
  contacts?: Contact[];
  activeWorkspace?: Workspace;
}

// Preset definition
interface FilterPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
  parentSectors: string[];
  subtypes?: string[];
  untaggedOnly?: boolean;
}

const PRESETS: FilterPreset[] = [
  {
    id: 'hospitality',
    label: 'Hospitality & Leisure',
    icon: '🏨',
    description: 'Hotels, Resorts, Water parks, Cafes & Sports clubs',
    parentSectors: ['hospitality_leisure'],
    subtypes: [
      'Hotel',
      'Resort',
      'Restaurant',
      'Catering Food and Beverage',
      'Cafe',
      'Fitness center / Gym',
      'Amusement park',
      'Sports club',
      'Water park'
    ]
  },
  {
    id: 'construction',
    label: 'Construction & Contractors',
    icon: '🏗️',
    description: 'Swimming Pool, MEP, Civil, HVAC & Plumbing contractors',
    parentSectors: ['construction_engineering'],
    subtypes: [
      'Swimming pool contractor',
      'General contractor',
      'Civil engineering company',
      'Mechanical contractor',
      'Electrical installation service',
      'Plumbing contractor',
      'HVAC contractor',
      'Roofing contractor'
    ]
  },
  {
    id: 'utilities',
    label: 'Utilities & Water Treatment',
    icon: '💧',
    description: 'Water treatment suppliers, pool services & environmental solutions',
    parentSectors: ['utilities_environment'],
    subtypes: [
      'Water treatment supplier',
      'Swimming pool repair service',
      'Water utility company',
      'Environmental consultant',
      'Waste management service',
      'Recycling center'
    ]
  },
  {
    id: 'all_classified',
    label: 'All Classified Companies',
    icon: '✅',
    description: 'All accounts categorized with a verified sector',
    parentSectors: SYSTEM_INDUSTRY_TAXONOMY.map((s) => s.id)
  },
  {
    id: 'untagged_only',
    label: 'Untagged / Unclassified Only',
    icon: '⚠️',
    description: 'Accounts requiring taxonomy classification',
    parentSectors: [],
    untaggedOnly: true
  }
];

// Common UAE locations
const STANDARD_UAE_CITIES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
  'Al Ain'
];

const STANDARD_RELATIONSHIPS = [
  'Prospect',
  'Lead',
  'Active Client',
  'Customer',
  'Vendor / Supplier',
  'Partner'
];

const STANDARD_TEMPERATURES = [
  { label: 'Hot 🔥', value: 'Hot' },
  { label: 'Warm ☀️', value: 'Warm' },
  { label: 'Cold ❄️', value: 'Cold' },
  { label: 'Frozen 🧊', value: 'Frozen' }
];

export default function CompanyExportModal({
  isOpen,
  onClose,
  companies,
  contacts = [],
  activeWorkspace
}: CompanyExportModalProps) {
  // Only consider active, non-deleted companies
  const activeCompanies = useMemo(() => {
    return (companies || []).filter((c) => !c.is_deleted && !(c as any).deleted);
  }, [companies]);

  // Extract all distinct cities from active companies
  const availableCities = useMemo(() => {
    const set = new Set<string>(STANDARD_UAE_CITIES);
    activeCompanies.forEach((c) => {
      if (c.city && c.city.trim()) {
        set.add(c.city.trim());
      }
    });
    return Array.from(set).sort();
  }, [activeCompanies]);

  const { sectors: taxonomySectors } = useIndustryTaxonomy();

  // Filter States
  const [selectedParentSectors, setSelectedParentSectors] = useState<string[]>(() =>
    taxonomySectors.map((s) => s.id)
  );
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<string[]>([]);
  const [selectedTemperatures, setSelectedTemperatures] = useState<string[]>([]);
  const [untaggedOnly, setUntaggedOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePreset, setActivePreset] = useState<string | null>('all_classified');
  const [excludedCompanyIds, setExcludedCompanyIds] = useState<Set<string>>(new Set());

  // Reset row exclusions when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setExcludedCompanyIds(new Set());
    }
  }, [isOpen]);

  // Fast memoized lookup of contacts by company ID
  const contactsByCompanyId = useMemo(() => {
    const map = new Map<string, Contact[]>();
    (contacts || []).forEach((ct) => {
      if (ct.is_deleted || (ct as any).deleted) return;
      if (ct.company_id) {
        const arr = map.get(ct.company_id) || [];
        arr.push(ct);
        map.set(ct.company_id, arr);
      }
      const extraCompanyIds = (ct as any).company_ids;
      if (Array.isArray(extraCompanyIds)) {
        extraCompanyIds.forEach((cid: string) => {
          const arr = map.get(cid) || [];
          if (!arr.includes(ct)) arr.push(ct);
          map.set(cid, arr);
        });
      }
    });
    return map;
  }, [contacts]);

  // Keep all_classified preset synced with live taxonomy sectors
  useEffect(() => {
    if (activePreset === 'all_classified') {
      setSelectedParentSectors(taxonomySectors.map((s) => s.id));
    }
  }, [taxonomySectors, activePreset]);

  // Keyboard navigation: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // All available child sub-types for the currently selected parent sectors
  const availableSubtypesForSectors = useMemo(() => {
    const list: { sectorId: string; sectorIcon: string; sectorLabel: string; subtype: string }[] = [];
    const seen = new Set<string>();

    taxonomySectors.forEach((sector) => {
      if (selectedParentSectors.includes(sector.id)) {
        sector.subtypes.forEach((st) => {
          const key = `${sector.id}:::${st.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              sectorId: sector.id,
              sectorIcon: sector.icon,
              sectorLabel: sector.label,
              subtype: st
            });
          }
        });
      }
    });

    // Also include any custom business_type_raw present in companies matching these sectors
    activeCompanies.forEach((c) => {
      if (c.industry_parent && selectedParentSectors.includes(c.industry_parent)) {
        const raw = c.business_type_raw?.trim();
        if (raw) {
          const key = `${c.industry_parent}:::${raw.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            const p = getParentIndustry(c.industry_parent);
            list.push({
              sectorId: c.industry_parent,
              sectorIcon: p?.icon || '🏷️',
              sectorLabel: p?.label || 'General',
              subtype: raw
            });
          }
        }
      }
    });

    return list;
  }, [selectedParentSectors, activeCompanies]);

  // Preset Applicator
  const applyPreset = (preset: FilterPreset) => {
    setActivePreset(preset.id);
    setSearchQuery('');

    if (preset.untaggedOnly) {
      setUntaggedOnly(true);
      setSelectedParentSectors([]);
      setSelectedSubtypes([]);
      setSelectedCities([]);
      setSelectedRelationships([]);
      setSelectedTemperatures([]);
      return;
    }

    setUntaggedOnly(false);
    setSelectedParentSectors(preset.parentSectors);
    if (preset.subtypes && preset.subtypes.length > 0) {
      setSelectedSubtypes(preset.subtypes);
    } else {
      setSelectedSubtypes([]);
    }
  };

  // Toggle Parent Sector
  const toggleParentSector = (sectorId: string) => {
    setActivePreset(null);
    setUntaggedOnly(false);
    setSelectedParentSectors((prev) => {
      if (prev.includes(sectorId)) {
        const next = prev.filter((id) => id !== sectorId);
        // Also remove subtypes belonging to this sector
        const sector = taxonomySectors.find((s) => s.id === sectorId);
        if (sector) {
          setSelectedSubtypes((stPrev) =>
            stPrev.filter((st) => !sector.subtypes.includes(st))
          );
        }
        return next;
      } else {
        return [...prev, sectorId];
      }
    });
  };

  // Toggle Subtype
  const toggleSubtype = (subtype: string) => {
    setActivePreset(null);
    setSelectedSubtypes((prev) =>
      prev.includes(subtype) ? prev.filter((s) => s !== subtype) : [...prev, subtype]
    );
  };

  // Toggle City
  const toggleCity = (city: string) => {
    setActivePreset(null);
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  // Toggle Relationship
  const toggleRelationship = (rel: string) => {
    setActivePreset(null);
    setSelectedRelationships((prev) =>
      prev.includes(rel) ? prev.filter((r) => r !== rel) : [...prev, rel]
    );
  };

  // Toggle Temperature
  const toggleTemperature = (temp: string) => {
    setActivePreset(null);
    setSelectedTemperatures((prev) =>
      prev.includes(temp) ? prev.filter((t) => t !== temp) : [...prev, temp]
    );
  };

  // Select All Parent Sectors
  const handleSelectAllSectors = () => {
    setActivePreset(null);
    setUntaggedOnly(false);
    setSelectedParentSectors(taxonomySectors.map((s) => s.id));
  };

  // Clear All Filters
  const handleClearAll = () => {
    setActivePreset(null);
    setUntaggedOnly(false);
    setSelectedParentSectors([]);
    setSelectedSubtypes([]);
    setSelectedCities([]);
    setSelectedRelationships([]);
    setSelectedTemperatures([]);
    setSearchQuery('');
    setExcludedCompanyIds(new Set());
  };

  // Filtered Companies In-Memory Evaluation with Deep Search
  const filteredCompanies = useMemo(() => {
    return activeCompanies.filter((company) => {
      // 1. Untagged-only mode
      if (untaggedOnly) {
        if (!isCompanyUntagged(company)) return false;
      } else {
        // Parent sector filtering (if any parent sector selected)
        if (selectedParentSectors.length > 0) {
          const parent = company.industry_parent || '';
          if (!selectedParentSectors.includes(parent)) {
            return false;
          }
        } else {
          // If 0 parent sectors selected and not untagged-only, return 0
          return false;
        }

        // Child subtype filtering (if any specific child subtype selected)
        if (selectedSubtypes.length > 0) {
          const rawType = (company.business_type_raw || company.industry || company.industry_type || '').toLowerCase().trim();
          const matchesSubtype = selectedSubtypes.some(
            (st) => st.toLowerCase().trim() === rawType
          );
          if (!matchesSubtype) return false;
        }
      }

      // 2. City Filter
      if (selectedCities.length > 0) {
        const companyCity = (company.city || '').trim().toLowerCase();
        const matchesCity = selectedCities.some(
          (c) => c.trim().toLowerCase() === companyCity
        );
        if (!matchesCity) return false;
      }

      // 3. Relationship / Status Filter
      if (selectedRelationships.length > 0) {
        const rel = company.relationship || 'Prospect';
        if (!selectedRelationships.includes(rel)) return false;
      }

      // 4. Temperature Filter
      if (selectedTemperatures.length > 0) {
        const temp = company.temperature || 'Warm';
        if (!selectedTemperatures.includes(temp)) return false;
      }

      // 5. Multi-Field Deep Keyword Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cleanQ = q.replace(/[\s\-\(\)\+]/g, '');

        // a) Company Name & Canonical Name
        const nameMatch = (company.display_name || '').toLowerCase().includes(q) ||
          (company.legal_name || '').toLowerCase().includes(q) ||
          (company.name || '').toLowerCase().includes(q);
        const canonMatch = (company.canonical_name || '').toLowerCase().includes(q);

        // b) Aliases
        const aliasMatch = (company.aliases || []).some((a) => (a || '').toLowerCase().includes(q));

        // c) Parent Sector & Child Sub-Type
        const parentObj = getParentIndustry(company.industry_parent);
        const parentMatch = (company.industry_parent || '').toLowerCase().includes(q) ||
          (parentObj?.label || '').toLowerCase().includes(q);
        const subTypeVal = (company.business_type_raw || company.industry || company.industry_type || '').toLowerCase();
        const subTypeMatch = subTypeVal.includes(q);

        // d) City & Country
        const cityMatch = (company.city || '').toLowerCase().includes(q);
        const countryMatch = (company.country || '').toLowerCase().includes(q);

        // e) General Phone & Alternate Phones
        const rawGenPhone = company.general_phone || '';
        const genPhoneDigits = rawGenPhone.replace(/[\s\-\(\)\+]/g, '');
        const compPhonesMatch = rawGenPhone.toLowerCase().includes(q) ||
          (cleanQ.length >= 3 && genPhoneDigits.includes(cleanQ)) ||
          (Array.isArray(company.phones) && company.phones.some((p: any) => {
            const pNum = (p.number || p.phone || '');
            const pDigits = pNum.replace(/[\s\-\(\)\+]/g, '');
            return pNum.toLowerCase().includes(q) || (cleanQ.length >= 3 && pDigits.includes(cleanQ));
          }));

        // f) Contact Person Names, Designations, Emails, and Phones
        const companyCts = contactsByCompanyId.get(company.id) || [];
        const contactMatch = companyCts.some((ct) => {
          const ctName = (ct.full_name || '').toLowerCase();
          const ctDesig = (ct.designation || '').toLowerCase();
          const ctEmail = (ct.email || '').toLowerCase();
          const ctMobile = ct.mobile || '';
          const ctLandline = ct.landline || '';
          const ctMobileDigits = ctMobile.replace(/[\s\-\(\)\+]/g, '');
          const ctLandlineDigits = ctLandline.replace(/[\s\-\(\)\+]/g, '');

          return ctName.includes(q) ||
            ctDesig.includes(q) ||
            ctEmail.includes(q) ||
            ctMobile.toLowerCase().includes(q) ||
            ctLandline.toLowerCase().includes(q) ||
            (cleanQ.length >= 3 && (ctMobileDigits.includes(cleanQ) || ctLandlineDigits.includes(cleanQ)));
        });

        if (!nameMatch && !canonMatch && !aliasMatch && !parentMatch && !subTypeMatch && !cityMatch && !countryMatch && !compPhonesMatch && !contactMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeCompanies,
    untaggedOnly,
    selectedParentSectors,
    selectedSubtypes,
    selectedCities,
    selectedRelationships,
    selectedTemperatures,
    searchQuery,
    contactsByCompanyId
  ]);

  // Selected Companies strictly respecting row-level manual exclusions
  const selectedCompanies = useMemo(() => {
    return filteredCompanies.filter((c) => !excludedCompanyIds.has(c.id));
  }, [filteredCompanies, excludedCompanyIds]);

  // Selection states & helpers
  const allFilteredSelected = filteredCompanies.length > 0 &&
    filteredCompanies.every((c) => !excludedCompanyIds.has(c.id));
  const someFilteredSelected = filteredCompanies.some((c) => !excludedCompanyIds.has(c.id));

  const toggleCompanyExclusion = (companyId: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setExcludedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExcludedCompanyIds((prev) => {
      const next = new Set(prev);
      filteredCompanies.forEach((c) => next.delete(c.id));
      return next;
    });
  };

  const handleDeselectAllFiltered = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExcludedCompanyIds((prev) => {
      const next = new Set(prev);
      filteredCompanies.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleToggleAllFiltered = (e?: React.ChangeEvent<HTMLInputElement>) => {
    if (e) e.stopPropagation();
    if (allFilteredSelected) {
      handleDeselectAllFiltered();
    } else {
      handleSelectAllFiltered();
    }
  };

  // Active Filter Summary for Reports
  const filterCriteriaSummary = useMemo(() => {
    const parts: string[] = [];
    if (untaggedOnly) {
      parts.push('Untagged / Unclassified Only');
    } else {
      if (selectedParentSectors.length === taxonomySectors.length) {
        parts.push('All Industry Sectors');
      } else if (selectedParentSectors.length > 0) {
        const labels = selectedParentSectors
          .map((id) => getParentIndustry(id)?.label || id)
          .join(', ');
        parts.push(`Sectors: ${labels}`);
      }
      if (selectedSubtypes.length > 0) {
        parts.push(`Sub-Types: ${selectedSubtypes.join(', ')}`);
      }
    }

    if (selectedCities.length > 0) {
      parts.push(`Cities: ${selectedCities.join(', ')}`);
    }
    if (selectedRelationships.length > 0) {
      parts.push(`Status: ${selectedRelationships.join(', ')}`);
    }
    if (selectedTemperatures.length > 0) {
      parts.push(`Temperatures: ${selectedTemperatures.join(', ')}`);
    }
    if (searchQuery.trim()) {
      parts.push(`Search: "${searchQuery.trim()}"`);
    }
    if (selectedCompanies.length < filteredCompanies.length) {
      parts.push(`${filteredCompanies.length - selectedCompanies.length} Excluded`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'All Active Companies';
  }, [
    untaggedOnly,
    selectedParentSectors,
    selectedSubtypes,
    selectedCities,
    selectedRelationships,
    selectedTemperatures,
    searchQuery,
    selectedCompanies.length,
    filteredCompanies.length,
    taxonomySectors.length
  ]);

  // CSV Export Trigger
  const handleExportCSV = () => {
    if (selectedCompanies.length === 0) {
      alert('No companies are currently selected for export. Please ensure at least one company row is checked.');
      return;
    }

    let filterLabel = 'Directory';
    if (untaggedOnly) {
      filterLabel = 'Untagged_Only';
    } else if (selectedParentSectors.length === 1) {
      const p = getParentIndustry(selectedParentSectors[0]);
      filterLabel = p?.label || selectedParentSectors[0];
    } else if (activePreset) {
      const preset = PRESETS.find((p) => p.id === activePreset);
      if (preset) filterLabel = preset.label;
    }

    exportCompaniesToCSV({
      companies: selectedCompanies,
      contacts,
      filterLabel
    });
  };

  // PDF / Print Trigger
  const handlePrintPDF = () => {
    if (selectedCompanies.length === 0) {
      alert('No companies are currently selected for export. Please ensure at least one company row is checked.');
      return;
    }
    window.print();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. SCREEN MODAL OVERLAY (Hidden during @media print via print:hidden)      */}
      {/* ========================================================================= */}
      <div
        id="company-export-modal"
        className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs print:hidden animate-in fade-in duration-150 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90 shrink-0">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans tracking-tight">
                    Company Directory Export Hub
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px] font-mono font-bold">
                    A4 PDF & UTF-8 CSV
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  Segment by two-tier industry taxonomy, UAE locations, and client relationship
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body: Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Quick Filter Presets */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>One-Click Industry Presets</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSelectAllSectors}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                  >
                    Select All Sectors
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PRESETS.map((preset) => {
                  const isSelected = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`text-left p-3 rounded-2xl border transition flex items-start space-x-3 cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xl shrink-0 mt-0.5">{preset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-bold truncate ${
                              isSelected
                                ? 'text-blue-950 dark:text-blue-100'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {preset.label}
                          </span>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Granular Filter Section */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 bg-slate-50/50 dark:bg-slate-900/40 space-y-4.5">
              {/* Parent Sector Multi-Select Pills */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-sans flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Tier 1: Parent Industry Sectors ({selectedParentSectors.length} active)</span>
                  </label>
                  {untaggedOnly && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800/60">
                      Untagged Mode Active
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {taxonomySectors.map((sector) => {
                    const isSelected = selectedParentSectors.includes(sector.id);
                    return (
                      <button
                        key={sector.id}
                        type="button"
                        onClick={() => toggleParentSector(sector.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span>{sector.icon}</span>
                        <span>{sector.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Child Sub-Type Filter Tags (if parent sectors selected) */}
              {availableSubtypesForSectors.length > 0 && !untaggedOnly && (
                <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-sans flex items-center space-x-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>
                        Tier 2: Child Sub-Types Filter{' '}
                        <span className="text-slate-400 font-normal">
                          ({selectedSubtypes.length === 0 ? 'All included by default' : `${selectedSubtypes.length} selected`})
                        </span>
                      </span>
                    </label>
                    {selectedSubtypes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSubtypes([])}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Reset to All Sub-Types
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-white dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700">
                    {availableSubtypesForSectors.map((item) => {
                      const isChecked = selectedSubtypes.includes(item.subtype);
                      return (
                        <button
                          key={`${item.sectorId}-${item.subtype}`}
                          type="button"
                          onClick={() => toggleSubtype(item.subtype)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center space-x-1.5 border cursor-pointer ${
                            isChecked
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-600 font-bold'
                              : 'bg-transparent text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                        >
                          <span className="text-xs">{item.sectorIcon}</span>
                          <span>{item.subtype}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Location & Status Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                {/* Location / City Multi-Select */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>UAE Location / City</span>
                    </label>
                    {selectedCities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCities([])}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        All Cities
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCities.map((city) => {
                      const isSelected = selectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          type="button"
                          onClick={() => toggleCity(city)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {city}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status & Temperature */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Client Relationship & Temperature</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STANDARD_RELATIONSHIPS.map((rel) => {
                      const isSelected = selectedRelationships.includes(rel);
                      return (
                        <button
                          key={rel}
                          type="button"
                          onClick={() => toggleRelationship(rel)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {rel}
                        </button>
                      );
                    })}
                    {STANDARD_TEMPERATURES.map((t) => {
                      const isSelected = selectedTemperatures.includes(t.value);
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => toggleTemperature(t.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-500 font-bold'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Text Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Deep Search: Company name, canonical, alias, sector, sub-type, city, contact person, phone..."
                  className="w-full pl-9.5 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Match Counter & Row Selection Controls */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center flex-wrap gap-2">
                  <span className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold border flex items-center space-x-1.5 shadow-xs transition ${
                    selectedCompanies.length > 0
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  }`}>
                    {selectedCompanies.length > 0 ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>Ready to Export: {selectedCompanies.length} Selected of {filteredCompanies.length} Matched Companies</span>
                  </span>
                  <span className="text-xs text-slate-400 font-sans">
                    (out of {activeCompanies.length} active records)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    disabled={allFilteredSelected || filteredCompanies.length === 0}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                    title="Check all currently filtered companies"
                  >
                    Select All Filtered
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    disabled={!someFilteredSelected || filteredCompanies.length === 0}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                    title="Uncheck all currently filtered companies"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Data Preview Table with Interactive Row Checkboxes */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                        <th className="py-2.5 px-3 w-12 text-center">
                          <input
                            type="checkbox"
                            id="export-header-select-all"
                            checked={allFilteredSelected}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate = !allFilteredSelected && someFilteredSelected;
                              }
                            }}
                            onChange={handleToggleAllFiltered}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                            title={allFilteredSelected ? 'Deselect All Filtered' : 'Select All Filtered'}
                          />
                        </th>
                        <th className="py-2.5 px-3">Ref ID</th>
                        <th className="py-2.5 px-3">Company Name</th>
                        <th className="py-2.5 px-3">Industry Classification</th>
                        <th className="py-2.5 px-3">City</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Primary Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredCompanies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-8 text-center text-slate-400 dark:text-slate-500 font-sans"
                          >
                            No company accounts match the selected filter combination or deep search query.
                          </td>
                        </tr>
                      ) : (
                        filteredCompanies.slice(0, 100).map((company, idx) => {
                          const refId = getReferenceId('CMP', company, companies);
                          const badge = formatIndustryBadge(company);
                          const primaryCt = getPrimaryContactForCompany(company.id, contacts);
                          const isSelected = !excludedCompanyIds.has(company.id);

                          return (
                            <tr
                              key={company.id || idx}
                              onClick={() => toggleCompanyExclusion(company.id)}
                              className={`transition cursor-pointer select-none ${
                                isSelected
                                  ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 bg-white dark:bg-slate-900'
                                  : 'bg-slate-100/60 dark:bg-slate-950/60 opacity-50 hover:opacity-75'
                              }`}
                            >
                              <td
                                className="py-2 px-3 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  id={`export-chk-${company.id}`}
                                  checked={isSelected}
                                  onChange={(e) => toggleCompanyExclusion(company.id, e)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                  title={isSelected ? 'Exclude from export' : 'Include in export'}
                                />
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-500 dark:text-slate-400">
                                {refId}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{company.display_name || company.canonical_name}</span>
                                  {!isSelected && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 font-mono font-bold uppercase tracking-wider">
                                      Excluded
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                  <span>{badge.icon}</span>
                                  <span className="truncate max-w-[150px]">{badge.displayText}</span>
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                {company.city || '-'}
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {company.relationship || 'Prospect'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                {primaryCt ? (
                                  <div>
                                    <span className="truncate block max-w-[150px] font-medium text-slate-800 dark:text-slate-200">
                                      {primaryCt.full_name}
                                    </span>
                                    {primaryCt.designation && (
                                      <span className="text-[10px] text-slate-400 truncate block max-w-[150px]">
                                        {primaryCt.designation}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">No contact</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredCompanies.length > 100 && (
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 text-center text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Showing first 100 of {filteredCompanies.length} matched companies in preview table • All {selectedCompanies.length} selected companies will be exported.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modal Footer: Action Buttons */}
          <div className="px-6 py-4.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/90 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center space-x-3">
              {/* Export CSV (Excel) */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={selectedCompanies.length === 0}
                className="px-4.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition flex items-center space-x-2 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download UTF-8 BOM CSV for Excel with selected companies"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Export as CSV ({selectedCompanies.length})</span>
              </button>

              {/* Export PDF / Print */}
              <button
                type="button"
                onClick={handlePrintPDF}
                disabled={selectedCompanies.length === 0}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition flex items-center space-x-2 shadow-md shadow-blue-500/20 cursor-pointer disabled:cursor-not-allowed"
                title="Print or Save as Presentation-Ready A4 PDF"
              >
                <Printer className="w-4 h-4" />
                <span>Export as PDF / Print ({selectedCompanies.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEDICATED PRINT VIEW (Isolated for @media print, hidden on screen)     */}
      {/* ========================================================================= */}
      <div
        id="company-directory-print-area"
        className="hidden print:block print:w-full print:m-0 print:p-0 bg-white text-black font-sans text-xs"
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #company-directory-print-area, #company-directory-print-area * {
              visibility: visible !important;
            }
            #company-directory-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 12mm 10mm !important;
              background: white !important;
              color: black !important;
            }
            @page {
              size: A4 portrait;
              margin: 12mm 10mm;
            }
            .print-table-row {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        ` }} />

        {/* Executive Report Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase font-sans">
              SAS-Manager — Company Directory Report
            </h1>
            <p className="text-[11px] text-slate-600 font-sans mt-0.5">
              Criteria: <span className="font-semibold text-slate-900">{filterCriteriaSummary}</span>
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-500 font-mono">
            <div>Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div className="font-bold text-slate-800">Total Accounts: {selectedCompanies.length}</div>
          </div>
        </div>

        {/* Structured A4 Table */}
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-800 border-y border-slate-300 font-mono uppercase tracking-wider text-[10px]">
              <th className="py-2 px-2.5 font-bold w-16">Ref ID</th>
              <th className="py-2 px-2.5 font-bold">Company Name</th>
              <th className="py-2 px-2.5 font-bold">Industry Sector & Sub-Type</th>
              <th className="py-2 px-2.5 font-bold w-20">City</th>
              <th className="py-2 px-2.5 font-bold">Primary Contact</th>
              <th className="py-2 px-2.5 font-bold">Phone / Tel</th>
              <th className="py-2 px-2.5 font-bold w-20">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {selectedCompanies.map((company, idx) => {
              const refId = getReferenceId('CMP', company, companies);
              const badge = formatIndustryBadge(company);
              const primaryCt = getPrimaryContactForCompany(company.id, contacts);
              const phone = company.general_phone || (company.phones && company.phones[0]?.number) || '-';

              return (
                <tr
                  key={company.id || idx}
                  className={`print-table-row ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                >
                  <td className="py-2 px-2.5 font-mono font-bold text-slate-600">
                    {refId}
                  </td>
                  <td className="py-2 px-2.5 font-bold text-slate-900">
                    {company.display_name || company.canonical_name}
                  </td>
                  <td className="py-2 px-2.5 text-slate-800">
                    <span className="font-semibold">{badge.icon} {badge.displayText}</span>
                    {badge.parentLabel && badge.parentLabel !== badge.displayText && (
                      <span className="block text-[9px] text-slate-500 font-normal">
                        ({badge.parentLabel})
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 text-slate-700">
                    {company.city || '-'}
                  </td>
                  <td className="py-2 px-2.5 text-slate-800">
                    {primaryCt ? (
                      <div>
                        <span className="font-semibold">{primaryCt.full_name}</span>
                        {primaryCt.designation && (
                          <span className="block text-[9px] text-slate-500">
                            {primaryCt.designation}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 font-mono text-slate-700 text-[10px]">
                    {phone}
                  </td>
                  <td className="py-2 px-2.5">
                    <span className="font-semibold text-slate-800">
                      {company.relationship || 'Prospect'}
                    </span>
                    {company.temperature && (
                      <span className="block text-[9px] text-slate-500">
                        {company.temperature}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Print Footer */}
        <div className="mt-6 pt-3 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-400 font-mono">
          <span>SAS-Manager Executive Directory • Confidential</span>
          <span>Page 1 of Directory Report</span>
        </div>
      </div>
    </>
  );
}
