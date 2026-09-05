import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, safeUpdateDoc, safeSetDoc } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Company,
  UserProfile,
  IndustryTaxonomySector,
  Contact,
  Salesperson,
  Enquiry,
  CallLogEntry
} from '../types';
import { SYSTEM_INDUSTRY_TAXONOMY, isCompanyUntagged } from '../utils/defaults';
import { normalizeSubTypeName } from '../utils/taxonomy';
import GoogleSearchButton from './common/GoogleSearchButton';
import Company360Modal from './Company360Modal';
import {
  Layers,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  Check,
  Plus,
  Trash2,
  Edit3,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Building2,
  MapPin,
  Sparkles,
  X,
  Tag,
  SlidersHorizontal,
  HelpCircle,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export interface IndustryTaxonomyManagerProps {
  companies?: Company[];
  contacts?: Contact[];
  salespersons?: Salesperson[];
  enquiries?: Enquiry[];
  callLogs?: CallLogEntry[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  user: UserProfile;
  activeWorkspaceId?: string;
  activeWorkspace?: any;
  isAdmin?: boolean;
}

// -----------------------------------------------------------------------------
// Searchable Combobox for Tier 1 (Parent Sector)
// -----------------------------------------------------------------------------
interface Tier1ComboboxProps {
  id: string;
  companyId: string;
  value: string;
  sectors: IndustryTaxonomySector[];
  onSelect: (sectorId: string) => void;
  onAdvance: () => void;
  onSkip?: () => void;
}

const Tier1Combobox: React.FC<Tier1ComboboxProps> = ({
  id,
  value,
  sectors,
  onSelect,
  onAdvance,
  onSkip
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedSector = useMemo(() => {
    return sectors.find((s) => s.id === value);
  }, [sectors, value]);

  const filteredSectors = useMemo(() => {
    if (!search.trim()) return sectors;
    const q = search.toLowerCase().trim();
    return sectors.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q))
    );
  }, [sectors, search]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${highlightedIdx}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIdx, isOpen]);

  const handleSelect = (sectorId: string) => {
    onSelect(sectorId);
    setIsOpen(false);
    setSearch('');
    onAdvance();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault();
      e.stopPropagation();
      onSkip?.();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (filteredSectors.length > 0) {
        setHighlightedIdx((prev) => (prev + 1) % filteredSectors.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (filteredSectors.length > 0) {
        setHighlightedIdx((prev) => (prev - 1 + filteredSectors.length) % filteredSectors.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredSectors.length > 0) {
        const target = filteredSectors[highlightedIdx] || filteredSectors[0];
        handleSelect(target.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      if (isOpen && filteredSectors.length > 0) {
        const target = filteredSectors[highlightedIdx] || filteredSectors[0];
        onSelect(target.id);
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        {selectedSector && !isOpen && (
          <span className="absolute left-2.5 pointer-events-none text-xs">
            {selectedSector.icon}
          </span>
        )}
        <input
          id={id}
          type="text"
          value={isOpen ? search : (selectedSector ? selectedSector.label : '')}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIdx(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
            const curIdx = sectors.findIndex((s) => s.id === value);
            setHighlightedIdx(curIdx >= 0 ? curIdx : 0);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={selectedSector ? selectedSector.label : "Search parent sector..."}
          className={`w-full ${selectedSector && !isOpen ? 'pl-7' : 'pl-2.5'} pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''
          }`}
        />
        <div className="absolute right-2 pointer-events-none text-slate-400">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 text-xs divide-y divide-slate-100 dark:divide-slate-750 animate-in fade-in zoom-in-95 duration-100"
        >
          {filteredSectors.length === 0 ? (
            <div className="px-3 py-2 text-slate-400 italic text-[11px]">
              No matching parent sectors
            </div>
          ) : (
            filteredSectors.map((sec, idx) => {
              const isSelected = sec.id === value;
              const isHighlighted = idx === highlightedIdx;
              return (
                <div
                  key={sec.id}
                  data-index={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(sec.id);
                  }}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-blue-600 text-white font-bold'
                      : isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-sm shrink-0">{sec.icon}</span>
                    <span className="truncate">{sec.label}</span>
                  </div>
                  {isSelected && (
                    <Check className={`w-3.5 h-3.5 shrink-0 ${isHighlighted ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Searchable Combobox for Tier 2 (Child Sub-Type) with Fast Inline Creation
// -----------------------------------------------------------------------------
interface Tier2ComboboxProps {
  id: string;
  companyId: string;
  parentId: string;
  value: string;
  availableSubtypes: string[];
  disabled: boolean;
  onCommit: (subtype: string, isNew: boolean) => void;
  onSkip?: () => void;
}

const Tier2Combobox: React.FC<Tier2ComboboxProps> = ({
  id,
  value,
  availableSubtypes,
  disabled,
  onCommit,
  onSkip
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const trimmedSearch = search.trim();
  const normalizedSearch = useMemo(() => {
    return normalizeSubTypeName(trimmedSearch);
  }, [trimmedSearch]);

  const filteredSubtypes = useMemo(() => {
    if (!trimmedSearch) return availableSubtypes;
    const q = trimmedSearch.toLowerCase();
    return availableSubtypes.filter((st) => st.toLowerCase().includes(q));
  }, [availableSubtypes, trimmedSearch]);

  const exactMatch = useMemo(() => {
    if (!trimmedSearch) return false;
    const lowerTrim = trimmedSearch.toLowerCase();
    const lowerNorm = normalizedSearch.toLowerCase();
    return availableSubtypes.some(
      (st) => st.toLowerCase() === lowerTrim || st.toLowerCase() === lowerNorm
    );
  }, [availableSubtypes, trimmedSearch, normalizedSearch]);

  const canCreateNew = Boolean(trimmedSearch && !exactMatch);

  interface ComboOption {
    type: 'create' | 'existing';
    value: string;
    label: string;
  }

  const allOptions: ComboOption[] = useMemo(() => {
    const list: ComboOption[] = [];
    if (canCreateNew) {
      list.push({
        type: 'create',
        value: normalizedSearch,
        label: `+ Create "${normalizedSearch}" (New GBP Sub-Type)`
      });
    }
    filteredSubtypes.forEach((st) => {
      list.push({
        type: 'existing',
        value: st,
        label: st
      });
    });
    return list;
  }, [canCreateNew, normalizedSearch, filteredSubtypes]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${highlightedIdx}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIdx, isOpen]);

  const handleCommitOption = (optValue: string, isNew: boolean) => {
    setIsOpen(false);
    setSearch('');
    const finalVal = isNew ? normalizeSubTypeName(optValue) : optValue;
    onCommit(finalVal, isNew);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault();
      e.stopPropagation();
      onSkip?.();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (allOptions.length > 0) {
        setHighlightedIdx((prev) => (prev + 1) % allOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (allOptions.length > 0) {
        setHighlightedIdx((prev) => (prev - 1 + allOptions.length) % allOptions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (allOptions.length > 0) {
        const target = allOptions[highlightedIdx] || allOptions[0];
        handleCommitOption(target.value, target.type === 'create');
      } else if (trimmedSearch) {
        handleCommitOption(normalizedSearch, true);
      } else if (value) {
        handleCommitOption(value, false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      if (isOpen && allOptions.length > 0) {
        const target = allOptions[highlightedIdx] || allOptions[0];
        handleCommitOption(target.value, target.type === 'create');
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          disabled={disabled}
          value={isOpen ? search : value}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIdx(0);
          }}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearch('');
            const curIdx = allOptions.findIndex((o) => o.value === value);
            setHighlightedIdx(curIdx >= 0 ? curIdx : 0);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? 'Select Sector First...'
              : value || 'Search or type sub-type...'
          }
          className={`w-full px-2.5 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${
            isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''
          }`}
        />
        <div className="absolute right-2 pointer-events-none text-slate-400">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 text-xs divide-y divide-slate-100 dark:divide-slate-750 animate-in fade-in zoom-in-95 duration-100"
        >
          {allOptions.length === 0 ? (
            <div className="px-3 py-2 text-slate-400 italic text-[11px]">
              No matching sub-types. Type to create new.
            </div>
          ) : (
            allOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIdx;
              const isCreate = opt.type === 'create';

              return (
                <div
                  key={`${opt.type}-${opt.value}`}
                  data-index={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleCommitOption(opt.value, isCreate);
                  }}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                    isHighlighted
                      ? isCreate
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-blue-600 text-white font-bold'
                      : isCreate
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                      : isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {isCreate ? (
                      <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isHighlighted ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                    ) : (
                      <Tag className={`w-3 h-3 shrink-0 ${isHighlighted ? 'text-white' : 'text-slate-400'}`} />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isCreate ? (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      isHighlighted ? 'bg-emerald-700 text-white' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                    }`}>
                      Enter to Create
                    </span>
                  ) : isSelected ? (
                    <Check className={`w-3.5 h-3.5 shrink-0 ${isHighlighted ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default function IndustryTaxonomyManager({
  companies = [],
  contacts = [],
  salespersons = [],
  enquiries = [],
  callLogs = [],
  setCompanies,
  user,
  activeWorkspaceId,
  activeWorkspace,
  isAdmin = true
}: IndustryTaxonomyManagerProps) {
  // ---------------------------------------------------------------------------
  // State: View Navigation (Taxonomy Structure vs Untagged Triage Station)
  // ---------------------------------------------------------------------------
  const [activeView, setActiveView] = useState<'taxonomy' | 'triage'>('taxonomy');

  // ---------------------------------------------------------------------------
  // State: Company 360° Modal Integration
  // ---------------------------------------------------------------------------
  const [selected360CompanyId, setSelected360CompanyId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // State: Taxonomy Sectors
  // ---------------------------------------------------------------------------
  const [sectors, setSectors] = useState<IndustryTaxonomySector[]>(() => {
    try {
      const cached = localStorage.getItem('omni_industry_taxonomy');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[IndustryTaxonomyManager] Failed reading cached taxonomy:', e);
    }
    return SYSTEM_INDUSTRY_TAXONOMY;
  });

  const [expandedSectorIds, setExpandedSectorIds] = useState<Set<string>>(
    () => new Set([SYSTEM_INDUSTRY_TAXONOMY[0]?.id || 'utilities_environment'])
  );

  const [taxonomySearch, setTaxonomySearch] = useState('');
  const [isSavingTaxonomy, setIsSavingTaxonomy] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Sector Editing / Adding Modal State
  const [isAddingSector, setIsAddingSector] = useState(false);
  const [newSectorLabel, setNewSectorLabel] = useState('');
  const [newSectorIcon, setNewSectorIcon] = useState('🏷️');

  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorLabel, setEditingSectorLabel] = useState('');
  const [editingSectorIcon, setEditingSectorIcon] = useState('');

  // Subtype Adding / Editing State
  const [addingSubtypeToSectorId, setAddingSubtypeToSectorId] = useState<string | null>(null);
  const [newSubtypeName, setNewSubtypeName] = useState('');

  const [editingSubtypeInfo, setEditingSubtypeInfo] = useState<{
    sectorId: string;
    oldName: string;
    newName: string;
  } | null>(null);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // ---------------------------------------------------------------------------
  // Firestore Synchronization for Taxonomy
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'industry_taxonomy'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && Array.isArray(data.sectors) && data.sectors.length > 0) {
            setSectors(data.sectors);
            try {
              localStorage.setItem('omni_industry_taxonomy', JSON.stringify(data.sectors));
            } catch (e) {
              // ignore
            }
          }
        }
      },
      (error) => {
        console.warn('[IndustryTaxonomyManager] Firestore listener error, using fallback:', error);
      }
    );

    return () => unsub();
  }, []);

  const persistTaxonomy = async (updatedSectors: IndustryTaxonomySector[], noticeMsg?: string) => {
    setSectors(updatedSectors);
    try {
      localStorage.setItem('omni_industry_taxonomy', JSON.stringify(updatedSectors));
    } catch (e) {
      // ignore
    }

    setIsSavingTaxonomy(true);
    try {
      await safeSetDoc('settings', 'industry_taxonomy', {
        sectors: updatedSectors,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.full_name || user.username || 'System Admin'
      });
      if (noticeMsg) {
        setSaveSuccessNotice(noticeMsg);
        setTimeout(() => setSaveSuccessNotice(null), 3500);
      }
    } catch (err: any) {
      console.error('[IndustryTaxonomyManager] Save failed:', err);
      alert('Failed to save taxonomy changes: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingTaxonomy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Calculations: Company Usage per Sector & Subtype
  // ---------------------------------------------------------------------------
  const activeCompanies = useMemo(() => {
    return companies.filter((c) => !c.is_deleted && !(c as any).deleted);
  }, [companies]);

  const sectorUsageStats = useMemo(() => {
    const stats: Record<string, { total: number; subtypes: Record<string, number> }> = {};

    sectors.forEach((s) => {
      stats[s.id] = { total: 0, subtypes: {} };
      s.subtypes.forEach((st) => {
        stats[s.id].subtypes[st.toLowerCase()] = 0;
      });
    });

    activeCompanies.forEach((c) => {
      const parentId = c.industry_parent?.trim();
      const rawSub = (c.business_type_raw || c.industry_type || c.industry || '').trim().toLowerCase();

      if (parentId && stats[parentId]) {
        stats[parentId].total += 1;
        if (rawSub && stats[parentId].subtypes[rawSub] !== undefined) {
          stats[parentId].subtypes[rawSub] += 1;
        }
      }
    });

    return stats;
  }, [sectors, activeCompanies]);

  // ---------------------------------------------------------------------------
  // State & Detection: Untagged Accounts Triage Station
  // ---------------------------------------------------------------------------
  const [triageSearch, setTriageSearch] = useState('');
  const [triageFilter, setTriageFilter] = useState<'all' | 'missing' | 'placeholder'>('all');
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(true);
  const [dismissedCompanyIds, setDismissedCompanyIds] = useState<Set<string>>(new Set());
  const [fadingRowIds, setFadingRowIds] = useState<Set<string>>(new Set());
  const [sessionClassifiedCount, setSessionClassifiedCount] = useState(0);

  // In-memory queue reordering for "Skip for Session": pushed to bottom of active queue
  const [skippedCompanyIds, setSkippedCompanyIds] = useState<string[]>([]);
  const [triageToast, setTriageToast] = useState<string | null>(null);

  const showTriageToast = (msg: string) => {
    setTriageToast(msg);
    setTimeout(() => {
      setTriageToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  // Row selections map: companyId -> { parentId, subtype }
  const [rowSelections, setRowSelections] = useState<
    Record<string, { parentId: string; subtype: string }>
  >({});

  // Inline "Create New Sub-Type" state per company row: companyId -> draft input text
  const [inlineNewSubtype, setInlineNewSubtype] = useState<Record<string, string>>({});

  // Untagged companies list with in-memory session reordering (skipped accounts at end)
  const untaggedCompanies = useMemo(() => {
    const rawList = activeCompanies.filter((c) => {
      if (dismissedCompanyIds.has(c.id || '')) return false;
      return isCompanyUntagged(c);
    });

    if (skippedCompanyIds.length === 0) return rawList;

    const skippedSet = new Set(skippedCompanyIds);
    const unskipped = rawList.filter((c) => !skippedSet.has(c.id || ''));

    const skippedMap = new Map(rawList.map((c) => [c.id || '', c]));
    const skipped = skippedCompanyIds
      .map((id) => skippedMap.get(id))
      .filter((c): c is Company => Boolean(c && !dismissedCompanyIds.has(c.id || '') && isCompanyUntagged(c)));

    return [...unskipped, ...skipped];
  }, [activeCompanies, dismissedCompanyIds, skippedCompanyIds]);

  // Filtered untagged companies for high-speed table
  const filteredUntaggedCompanies = useMemo(() => {
    return untaggedCompanies.filter((c) => {
      // Filter by sub-category
      if (triageFilter === 'missing') {
        const hasParent = Boolean(c.industry_parent?.trim());
        if (hasParent) return false;
      } else if (triageFilter === 'placeholder') {
        const p = (c.industry_parent || '').toLowerCase();
        const b = (c.business_type_raw || '').toLowerCase();
        const isPlaceholder =
          p.includes('other') ||
          p.includes('unspecified') ||
          p.includes('none') ||
          b.includes('other') ||
          b.includes('unspecified');
        if (!isPlaceholder) return false;
      }

      // Search term
      if (triageSearch.trim()) {
        const q = triageSearch.toLowerCase().trim();
        const name = (c.display_name || c.canonical_name || '').toLowerCase();
        const city = (c.city || '').toLowerCase();
        const currSub = (c.business_type_raw || c.industry || '').toLowerCase();
        return name.includes(q) || city.includes(q) || currSub.includes(q);
      }

      return true;
    });
  }, [untaggedCompanies, triageFilter, triageSearch]);

  // ---------------------------------------------------------------------------
  // Action Handlers: Taxonomy Structure
  // ---------------------------------------------------------------------------
  const toggleSectorExpand = (sectorId: string) => {
    setExpandedSectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) next.delete(sectorId);
      else next.add(sectorId);
      return next;
    });
  };

  const expandAllSectors = () => {
    setExpandedSectorIds(new Set(sectors.map((s) => s.id)));
  };

  const collapseAllSectors = () => {
    setExpandedSectorIds(new Set());
  };

  // Reorder parent sectors
  const moveSector = (index: number, direction: 'up' | 'down') => {
    if (!isAdmin) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectors.length) return;

    const updated = [...sectors];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // re-assign order property
    const reordered = updated.map((s, idx) => ({ ...s, order: idx + 1 }));
    persistTaxonomy(reordered, 'Sector order updated.');
  };

  // Add new parent sector
  const handleCreateSector = () => {
    if (!isAdmin) return;
    const trimmed = newSectorLabel.trim();
    if (!trimmed) return;

    const sectorId =
      'sector_' +
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 30) +
      '_' +
      Date.now().toString().slice(-4);

    const newSector: IndustryTaxonomySector = {
      id: sectorId,
      label: trimmed,
      name: trimmed,
      icon: newSectorIcon.trim() || '🏷️',
      order: sectors.length + 1,
      subtypes: []
    };

    const updated = [...sectors, newSector];
    persistTaxonomy(updated, `Parent sector "${trimmed}" added.`);
    setExpandedSectorIds((prev) => new Set([...prev, sectorId]));
    setIsAddingSector(false);
    setNewSectorLabel('');
    setNewSectorIcon('🏷️');
  };

  // Save edited parent sector
  const handleSaveSectorEdit = (sectorId: string) => {
    if (!isAdmin) return;
    const trimmed = editingSectorLabel.trim();
    if (!trimmed) return;

    const updated = sectors.map((s) => {
      if (s.id === sectorId) {
        return {
          ...s,
          label: trimmed,
          name: trimmed,
          icon: editingSectorIcon.trim() || s.icon || '🏷️'
        };
      }
      return s;
    });

    persistTaxonomy(updated, `Sector "${trimmed}" updated.`);
    setEditingSectorId(null);
  };

  // Delete parent sector
  const handleDeleteSector = (sector: IndustryTaxonomySector) => {
    if (!isAdmin) return;
    const usage = sectorUsageStats[sector.id]?.total || 0;

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Sector Deletion',
      message:
        usage > 0
          ? `Sector "${sector.label}" currently has ${usage} company record(s) linked to it. Are you sure you want to delete it? Deleting it will remove this category from future taxonomy selection.`
          : `Are you sure you want to delete the parent sector "${sector.label}"? This action cannot be undone.`,
      confirmText: 'Delete Sector',
      isDestructive: true,
      onConfirm: () => {
        const updated = sectors.filter((s) => s.id !== sector.id);
        persistTaxonomy(updated, `Sector "${sector.label}" removed.`);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Add child subtype
  const handleAddSubtype = (sectorId: string) => {
    if (!isAdmin) return;
    const normalized = normalizeSubTypeName(newSubtypeName);
    if (!normalized) return;

    const sector = sectors.find((s) => s.id === sectorId);
    if (!sector) return;

    if (sector.subtypes.some((st) => st.toLowerCase() === normalized.toLowerCase())) {
      alert(`Sub-type "${normalized}" already exists in this sector.`);
      return;
    }

    const updated = sectors.map((s) => {
      if (s.id === sectorId) {
        return {
          ...s,
          subtypes: [...s.subtypes, normalized]
        };
      }
      return s;
    });

    persistTaxonomy(updated, `Added "${normalized}" to ${sector.label}.`);
    setNewSubtypeName('');
    setAddingSubtypeToSectorId(null);
  };

  // Save renamed subtype
  const handleSaveSubtypeEdit = async () => {
    if (!isAdmin || !editingSubtypeInfo) return;
    const { sectorId, oldName, newName } = editingSubtypeInfo;
    const normalizedNew = normalizeSubTypeName(newName);
    if (!normalizedNew || normalizedNew.toLowerCase() === oldName.toLowerCase()) {
      setEditingSubtypeInfo(null);
      return;
    }

    const updated = sectors.map((s) => {
      if (s.id === sectorId) {
        return {
          ...s,
          subtypes: s.subtypes.map((st) => (st === oldName ? normalizedNew : st))
        };
      }
      return s;
    });

    await persistTaxonomy(updated, `Sub-type renamed to "${normalizedNew}".`);

    // Optionally cascade rename to in-memory and Firestore companies
    const affectedCompanies = activeCompanies.filter(
      (c) => c.industry_parent === sectorId && c.business_type_raw === oldName
    );

    if (affectedCompanies.length > 0 && setCompanies) {
      setCompanies((prev) =>
        prev.map((c) =>
          c.industry_parent === sectorId && c.business_type_raw === oldName
            ? { ...c, business_type_raw: normalizedNew, industry_type: normalizedNew, industry: normalizedNew }
            : c
        )
      );

      // Async batch update in Firestore
      affectedCompanies.forEach((c) => {
        if (c.id) {
          safeUpdateDoc('companies', c.id, {
            business_type_raw: normalizedNew,
            industry_type: normalizedNew,
            industry: normalizedNew,
            updatedAt: new Date().toISOString()
          }).catch((err) => console.warn('[Taxonomy] Cascade rename company err:', err));
        }
      });
    }

    setEditingSubtypeInfo(null);
  };

  // Delete child subtype
  const handleDeleteSubtype = (sectorId: string, subtypeName: string) => {
    if (!isAdmin) return;
    const sector = sectors.find((s) => s.id === sectorId);
    if (!sector) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Sub-Type Deletion',
      message: `Are you sure you want to remove the raw sub-type "${subtypeName}" from ${sector.label}?`,
      confirmText: 'Delete Sub-Type',
      isDestructive: true,
      onConfirm: () => {
        const updated = sectors.map((s) => {
          if (s.id === sectorId) {
            return {
              ...s,
              subtypes: s.subtypes.filter((st) => st !== subtypeName)
            };
          }
          return s;
        });
        persistTaxonomy(updated, `Removed "${subtypeName}" from ${sector.label}.`);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Reset to default system taxonomy
  const handleResetToSystemDefaults = () => {
    if (!isAdmin) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Reset to System Default Taxonomy',
      message:
        'Are you sure you want to restore the standard 12 Parent Sectors and curated GBP sub-types? Custom additions will be replaced.',
      confirmText: 'Restore Defaults',
      isDestructive: true,
      onConfirm: () => {
        persistTaxonomy(SYSTEM_INDUSTRY_TAXONOMY, 'Restored standard system taxonomy.');
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: High-Speed Untagged Accounts Triage Station
  // ---------------------------------------------------------------------------
  const handleSelectParentSector = (companyId: string, parentId: string) => {
    setRowSelections((prev) => {
      const current = prev[companyId] || { parentId: '', subtype: '' };
      const targetSector = sectors.find((s) => s.id === parentId);
      const isSubtypeValid = targetSector?.subtypes.includes(current.subtype);

      return {
        ...prev,
        [companyId]: {
          parentId,
          subtype: isSubtypeValid ? current.subtype : ''
        }
      };
    });
  };

  const handleActivateGoogleSearch = (companyId: string) => {
    // Simultaneously set DOM focus to that row's Tier 1 combobox input
    setTimeout(() => {
      const t1 = document.getElementById(`tier1-input-${companyId}`);
      if (t1) {
        t1.focus();
      }
    }, 20);
  };

  const handleAdvanceToTier2 = (companyId: string) => {
    setTimeout(() => {
      const t2 = document.getElementById(`tier2-input-${companyId}`);
      if (t2) {
        t2.focus();
      }
    }, 20);
  };

  const handleSkipForSession = (company: Company) => {
    const companyId = company.id || '';
    if (!companyId) return;

    const compName = company.display_name || company.canonical_name || 'Account';

    // Find the next company in line that will appear at or near the top
    const nextCompany = filteredUntaggedCompanies.find(
      (c) => c.id && c.id !== companyId && !dismissedCompanyIds.has(c.id) && !fadingRowIds.has(c.id)
    );

    // Reorder queue in-memory for this session
    setSkippedCompanyIds((prev) => [...prev.filter((id) => id !== companyId), companyId]);
    showTriageToast(`Moved ${compName} to end of session queue`);

    // Advance focus to [G] button of the new company at the top
    if (nextCompany?.id) {
      setTimeout(() => {
        const nextG = document.getElementById(`speedrunner-g-${nextCompany.id}`);
        if (nextG) {
          nextG.focus();
        }
      }, 50);
    }
  };

  const handleCommitTier2 = async (
    companyId: string,
    parentId: string,
    subtype: string,
    isNew: boolean,
    rowIndex: number,
    forceSave: boolean = false
  ) => {
    if (!companyId || !parentId || !subtype) return;

    const targetSector = sectors.find((s) => s.id === parentId);
    if (!targetSector) return;

    const normalizedSub = normalizeSubTypeName(subtype);
    const existingSubtype = targetSector.subtypes.find(
      (st) => st.toLowerCase() === normalizedSub.toLowerCase()
    );
    const finalSubtypeName = existingSubtype || normalizedSub;

    // 1. Fast Inline Creation: If typed child sub-type does not exist, provision it in sectors
    if (!existingSubtype) {
      const updatedSectors = sectors.map((s) => {
        if (s.id === parentId) {
          return {
            ...s,
            subtypes: [...s.subtypes, finalSubtypeName]
          };
        }
        return s;
      });
      persistTaxonomy(updatedSectors, `Added "${finalSubtypeName}" to ${targetSector.label}`);
    }

    // 2. Update this row's selection state
    setRowSelections((prev) => ({
      ...prev,
      [companyId]: {
        parentId,
        subtype: finalSubtypeName
      }
    }));

    // Strict Auto-Save Condition:
    // If isAutoSaveEnabled is FALSE and this was NOT an explicit user click/Enter on [Save]:
    // - Selecting a Tier 2 option must ONLY update the local component state for that row.
    // - It MUST NOT write to Firestore, MUST NOT advance focus to the next row, and MUST NOT dismiss the row.
    // - Shift focus to the row's [Save] button so user can review and hit Enter if desired.
    if (!isAutoSaveEnabled && !forceSave) {
      setTimeout(() => {
        const saveBtn = document.getElementById(`save-btn-${companyId}`);
        if (saveBtn) {
          saveBtn.focus();
        }
      }, 50);
      return;
    }

    // 3. Find NEXT untagged company to advance DOM focus to its [G] button
    const nextCompany = filteredUntaggedCompanies.slice(rowIndex + 1).find(
      (c) => c.id && c.id !== companyId && !dismissedCompanyIds.has(c.id) && !fadingRowIds.has(c.id)
    );

    // 4. Trigger Quick Save (updates Firestore, state, row animation, and session counter)
    await handleQuickSaveTriage(companyId, parentId, finalSubtypeName);

    // 5. Advance DOM focus immediately to the [G] button of the NEXT untagged company in the queue
    if (nextCompany?.id) {
      setTimeout(() => {
        const nextG = document.getElementById(`speedrunner-g-${nextCompany.id}`);
        if (nextG) {
          nextG.focus();
        }
      }, 50);
    }
  };

  const handleConfirmCreateSubtype = async (companyId: string) => {
    const rawText = (inlineNewSubtype[companyId] || '').trim();
    if (!rawText) return;

    const currentParentId =
      rowSelections[companyId]?.parentId ||
      activeCompanies.find((c) => c.id === companyId)?.industry_parent;

    if (!currentParentId) {
      alert('Please select a Parent Sector first.');
      return;
    }

    const parentSector = sectors.find((s) => s.id === currentParentId);
    if (!parentSector) return;

    // Prevent duplicate entries under the same parent (case-insensitive)
    const existing = parentSector.subtypes.find(
      (st) => st.toLowerCase() === rawText.toLowerCase()
    );
    const finalSubtypeName = existing || rawText;

    // 1. If it's a new sub-type for this parent sector, persist to Firestore settings/industry_taxonomy
    if (!existing) {
      const updatedSectors = sectors.map((s) => {
        if (s.id === currentParentId) {
          return {
            ...s,
            subtypes: [...s.subtypes, finalSubtypeName]
          };
        }
        return s;
      });
      persistTaxonomy(updatedSectors, `Added "${finalSubtypeName}" to ${parentSector.label}`);
    }

    // 2. Update this row's selection state
    setRowSelections((prev) => ({
      ...prev,
      [companyId]: {
        parentId: currentParentId,
        subtype: finalSubtypeName
      }
    }));

    // 3. Close the inline input mode for this row
    setInlineNewSubtype((prev) => {
      const next = { ...prev };
      delete next[companyId];
      return next;
    });

    // 4. Save company record to Firestore and trigger completion animation/counter decrement
    await handleQuickSaveTriage(companyId, currentParentId, finalSubtypeName);
  };

  const handleCancelCreateSubtype = (companyId: string) => {
    setInlineNewSubtype((prev) => {
      const next = { ...prev };
      delete next[companyId];
      return next;
    });
  };

  const handleQuickSaveTriage = async (companyId: string, parentId: string, subtype: string) => {
    if (!companyId || !parentId || !subtype) return;

    // Trigger row animation
    setFadingRowIds((prev) => new Set([...prev, companyId]));

    const targetCompany = activeCompanies.find((c) => c.id === companyId);
    const parentSector = sectors.find((s) => s.id === parentId);

    // Save to Firestore
    try {
      await safeUpdateDoc('companies', companyId, {
        industry_parent: parentId,
        business_type_raw: subtype,
        industry_type: subtype,
        industry: subtype,
        updatedAt: new Date().toISOString()
      });

      // Update in-memory companies state so entire app stays reactive
      if (setCompanies) {
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === companyId
              ? {
                  ...c,
                  industry_parent: parentId,
                  business_type_raw: subtype,
                  industry_type: subtype,
                  industry: subtype,
                  updatedAt: new Date().toISOString()
                }
              : c
          )
        );
      }

      // Smooth dismissal after animation
      setTimeout(() => {
        setDismissedCompanyIds((prev) => new Set([...prev, companyId]));
        setFadingRowIds((prev) => {
          const next = new Set(prev);
          next.delete(companyId);
          return next;
        });
        setSessionClassifiedCount((prev) => prev + 1);
      }, 300);

      // Feedback toast
      if (targetCompany && parentSector) {
        setSaveSuccessNotice(
          `Classified "${targetCompany.display_name || targetCompany.canonical_name}" as ${parentSector.icon} ${subtype}`
        );
        setTimeout(() => setSaveSuccessNotice(null), 3000);
      }
    } catch (err: any) {
      console.error('[TriageStation] Quick save failed:', err);
      alert('Failed to update company: ' + (err.message || 'Unknown error'));
      setFadingRowIds((prev) => {
        const next = new Set(prev);
        next.delete(companyId);
        return next;
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered Taxonomy for Search
  // ---------------------------------------------------------------------------
  const filteredSectors = useMemo(() => {
    if (!taxonomySearch.trim()) return sectors;
    const q = taxonomySearch.toLowerCase().trim();

    return sectors.filter((s) => {
      const matchLabel = s.label.toLowerCase().includes(q);
      const matchSubtype = s.subtypes.some((st) => st.toLowerCase().includes(q));
      return matchLabel || matchSubtype;
    });
  }, [sectors, taxonomySearch]);

  const totalSubtypesCount = useMemo(() => {
    return sectors.reduce((acc, s) => acc + s.subtypes.length, 0);
  }, [sectors]);

  return (
    <div className="space-y-6">
      {/* Toast Notice Banner */}
      {saveSuccessNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
          <button
            onClick={() => setSaveSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Top Header & Sub-Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Two-Tier Industry Taxonomy</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  Parent Sector + Child Sub-Type
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Standardize parent macro-sectors, configure Google Business Profile (GBP) child sub-types, and rapidly classify untagged accounts.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveView('taxonomy')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeView === 'taxonomy'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Taxonomy Structure</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-mono">
              {sectors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('triage')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
              activeView === 'triage'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${untaggedCompanies.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
            <span>Untagged Triage</span>
            {untaggedCompanies.length > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-black font-mono animate-pulse">
                {untaggedCompanies.length}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono">
                0
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* VIEW 1: TAXONOMY STRUCTURE (PARENT SECTORS & CHILD SUB-TYPES)          */}
      {/* ======================================================================= */}
      {activeView === 'taxonomy' && (
        <div className="space-y-4">
          {/* Quick Metrics & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={taxonomySearch}
                onChange={(e) => setTaxonomySearch(e.target.value)}
                placeholder="Search sectors, keywords, or raw sub-types..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {taxonomySearch && (
                <button
                  onClick={() => setTaxonomySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Expand / Collapse & Add Sector Controls */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={expandAllSectors}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 transition shadow-2xs"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAllSectors}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 transition shadow-2xs"
              >
                Collapse All
              </button>

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAddingSector(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Parent Sector</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToSystemDefaults}
                    title="Restore default 12 Parent Sectors & standard GBP sub-types"
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Inline Add Sector Card */}
          {isAddingSector && (
            <div className="p-4 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Create New Parent Sector</span>
                </span>
                <button
                  onClick={() => setIsAddingSector(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Sector Icon / Emoji
                  </label>
                  <input
                    type="text"
                    value={newSectorIcon}
                    onChange={(e) => setNewSectorIcon(e.target.value)}
                    placeholder="e.g. 💧, 🏗️, 🏢"
                    className="w-full px-3 py-1.5 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-center font-bold"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Parent Sector Name
                  </label>
                  <input
                    type="text"
                    value={newSectorLabel}
                    onChange={(e) => setNewSectorLabel(e.target.value)}
                    placeholder="e.g. Marine & Offshore Services"
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingSector(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSector}
                  disabled={!newSectorLabel.trim() || isSavingTaxonomy}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition shadow-xs"
                >
                  Save Sector
                </button>
              </div>
            </div>
          )}

          {/* List of Parent Sectors (Accordion / Hierarchy Cards) */}
          <div className="space-y-3">
            {filteredSectors.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs">
                No industry sectors match your search query "{taxonomySearch}".
              </div>
            ) : (
              filteredSectors.map((sector, index) => {
                const isExpanded = expandedSectorIds.has(sector.id);
                const isEditingThis = editingSectorId === sector.id;
                const stats = sectorUsageStats[sector.id] || { total: 0, subtypes: {} };
                const isAddingSubtype = addingSubtypeToSectorId === sector.id;

                return (
                  <div
                    key={sector.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs transition-all"
                  >
                    {/* Parent Sector Header Row */}
                    <div className="p-3.5 sm:px-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-850/60 transition select-none">
                      <div
                        onClick={() => toggleSectorExpand(sector.id)}
                        className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <button
                          type="button"
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {/* Emoji & Label / Edit Mode */}
                        {isEditingThis ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center space-x-2 flex-1 max-w-md"
                          >
                            <input
                              type="text"
                              value={editingSectorIcon}
                              onChange={(e) => setEditingSectorIcon(e.target.value)}
                              className="w-10 px-2 py-1 text-center text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                            <input
                              type="text"
                              value={editingSectorLabel}
                              onChange={(e) => setEditingSectorLabel(e.target.value)}
                              className="flex-1 px-3 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveSectorEdit(sector.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSectorId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2.5 truncate">
                            <span className="text-lg shrink-0">{sector.icon}</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {sector.label}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold shrink-0">
                              {sector.subtypes.length} Sub-Types
                            </span>
                            {stats.total > 0 && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 font-semibold shrink-0">
                                {stats.total} {stats.total === 1 ? 'account' : 'accounts'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Header Actions: Reorder, Edit, Add Subtype, Delete */}
                      <div className="flex items-center space-x-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <>
                            {/* Reorder buttons */}
                            <button
                              type="button"
                              onClick={() => moveSector(index, 'up')}
                              disabled={index === 0}
                              title="Move Up"
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 rounded-lg transition"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSector(index, 'down')}
                              disabled={index === sectors.length - 1}
                              title="Move Down"
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 rounded-lg transition"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Add Subtype shortcut */}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedSectorIds((prev) => new Set([...prev, sector.id]));
                                setAddingSubtypeToSectorId(sector.id);
                                setNewSubtypeName('');
                              }}
                              className="flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                            >
                              <Plus className="w-3 h-3" />
                              <span className="hidden sm:inline">Add Sub-Type</span>
                            </button>

                            {/* Edit Sector */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSectorId(sector.id);
                                setEditingSectorLabel(sector.label);
                                setEditingSectorIcon(sector.icon);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition"
                              title="Edit Sector"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Sector */}
                            <button
                              type="button"
                              onClick={() => handleDeleteSector(sector)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition"
                              title="Delete Sector"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded Child Sub-Types Panel */}
                    {isExpanded && (
                      <div className="px-4 py-3.5 bg-slate-50/70 dark:bg-slate-850/50 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <span>Assigned GBP / Raw Child Sub-Types</span>
                          <span className="text-slate-400 font-mono lowercase font-normal">
                            click sub-type to edit or inspect usage
                          </span>
                        </div>

                        {/* Inline Add Subtype Input */}
                        {isAddingSubtype && (
                          <div className="flex items-center space-x-2 p-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 rounded-xl shadow-xs">
                            <input
                              type="text"
                              value={newSubtypeName}
                              onChange={(e) => setNewSubtypeName(e.target.value)}
                              placeholder="Enter raw GBP sub-type (e.g. Desalination plant operator)..."
                              className="flex-1 px-3 py-1 text-xs bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddSubtype(sector.id);
                                if (e.key === 'Escape') setAddingSubtypeToSectorId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSubtype(sector.id)}
                              disabled={!newSubtypeName.trim()}
                              className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingSubtypeToSectorId(null)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Sub-types Pills / Badges Grid */}
                        {sector.subtypes.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-xs italic bg-white dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                            No child sub-types assigned yet. Click "Add Sub-Type" to configure raw GBP categories.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {sector.subtypes.map((st) => {
                              const usageCount = stats.subtypes[st.toLowerCase()] || 0;
                              const isEditingSt =
                                editingSubtypeInfo?.sectorId === sector.id &&
                                editingSubtypeInfo?.oldName === st;

                              if (isEditingSt) {
                                return (
                                  <div
                                    key={st}
                                    className="flex items-center space-x-1.5 p-1 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-600 rounded-lg shadow-xs"
                                  >
                                    <input
                                      type="text"
                                      value={editingSubtypeInfo.newName}
                                      onChange={(e) =>
                                        setEditingSubtypeInfo({
                                          ...editingSubtypeInfo,
                                          newName: e.target.value
                                        })
                                      }
                                      className="px-2 py-0.5 text-xs text-slate-900 dark:text-slate-100 bg-transparent focus:outline-hidden"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveSubtypeEdit();
                                        if (e.key === 'Escape') setEditingSubtypeInfo(null);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={handleSaveSubtypeEdit}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSubtypeInfo(null)}
                                      className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={st}
                                  className="group inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 transition"
                                >
                                  <span>{st}</span>
                                  {usageCount > 0 && (
                                    <span
                                      className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold"
                                      title={`${usageCount} active company records classified with this sub-type`}
                                    >
                                      {usageCount}
                                    </span>
                                  )}

                                  {isAdmin && (
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 ml-1 transition">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingSubtypeInfo({
                                            sectorId: sector.id,
                                            oldName: st,
                                            newName: st
                                          })
                                        }
                                        className="p-0.5 text-slate-400 hover:text-blue-600 rounded"
                                        title="Rename sub-type"
                                      >
                                        <Edit3 className="w-2.5 h-2.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSubtype(sector.id, st)}
                                        className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                                        title="Delete sub-type"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* VIEW 2: UNTAGGED ACCOUNTS TRIAGE STATION                                */}
      {/* ======================================================================= */}
      {activeView === 'triage' && (
        <div className="space-y-4">
          {/* Prominent Counter & Triage Controls Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            {/* Left: Prominent Counter Pill */}
            <div className="flex items-center space-x-3">
              {untaggedCompanies.length > 0 ? (
                <div className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-700/80 text-amber-700 dark:text-amber-300 font-bold text-xs shadow-2xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                  <span>⚠️ {untaggedCompanies.length} Accounts Require Classification</span>
                </div>
              ) : (
                <div className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-300 dark:border-emerald-700/80 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>All Active Companies Classified! (0 Untagged)</span>
                </div>
              )}

              {sessionClassifiedCount > 0 && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">
                  ⚡ {sessionClassifiedCount} classified in this session
                </span>
              )}
            </div>

            {/* Right: Search, Filter & Auto-Save Toggle */}
            <div className="flex items-center space-x-2.5">
              {/* Search filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={triageSearch}
                  onChange={(e) => setTriageSearch(e.target.value)}
                  placeholder="Filter by company name or city..."
                  className="pl-8 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 w-48 sm:w-60 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {triageSearch && (
                  <button
                    onClick={() => setTriageSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Auto-Save Checkbox / Switch */}
              <label
                className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xs"
                title="Automatically update company in Firestore as soon as child sub-type is selected"
              >
                <input
                  type="checkbox"
                  checked={isAutoSaveEnabled}
                  onChange={(e) => setIsAutoSaveEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px]">Auto-Save on Select</span>
              </label>
            </div>
          </div>

          {/* High-Speed Triage Table */}
          {filteredUntaggedCompanies.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {triageSearch ? 'No matching untagged companies' : 'All Accounts Are Fully Classified!'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {triageSearch
                  ? `No untagged companies match "${triageSearch}". Clear search to view all.`
                  : 'Every active company in your workspace has been categorized with a standardized Parent Sector and GBP Child Sub-Type.'}
              </p>
              {triageSearch ? (
                <button
                  type="button"
                  onClick={() => setTriageSearch('')}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:underline"
                >
                  Clear search filter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveView('taxonomy')}
                  className="px-4 py-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-200 dark:border-blue-900 transition"
                >
                  Back to Taxonomy Structure
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4 min-w-[240px]">Company Name & Location</th>
                      <th className="py-3 px-4 min-w-[210px]">Tier 1: Parent Sector</th>
                      <th className="py-3 px-4 min-w-[230px]">Tier 2: Child Sub-Type</th>
                      <th className="py-3 px-4 w-44 min-w-[170px] text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {filteredUntaggedCompanies.map((company, idx) => {
                      const companyId = company.id || `comp_${idx}`;
                      const isFading = fadingRowIds.has(companyId);

                      // Current selection for this row
                      const currentSelection = rowSelections[companyId] || {
                        parentId: company.industry_parent || '',
                        subtype: company.business_type_raw || company.industry_type || ''
                      };

                      // Target sector for subtype dropdown
                      const selectedSector = sectors.find((s) => s.id === currentSelection.parentId);
                      const availableSubtypes = selectedSector?.subtypes || [];

                      // Current status indicator text
                      const rawCurrent =
                        company.business_type_raw || company.industry_type || company.industry;
                      const hasNoParent = !company.industry_parent;

                      return (
                        <tr
                          key={companyId}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSkipForSession(company);
                            }
                          }}
                          className={`transition-all duration-300 hover:bg-slate-50/60 dark:hover:bg-slate-850/60 ${
                            isFading
                              ? 'opacity-0 -translate-x-4 pointer-events-none bg-emerald-50 dark:bg-emerald-950/20'
                              : 'opacity-100'
                          }`}
                        >
                          {/* Row Number */}
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Company Name, Location & Google Search Button */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-between space-x-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelected360CompanyId(company.id || null);
                                    }}
                                    className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors text-left truncate max-w-full"
                                    title={`Open 360° Profile for "${company.display_name || company.canonical_name}"`}
                                  >
                                    <span className="truncate font-medium">
                                      {company.display_name || company.canonical_name}
                                    </span>
                                  </button>
                                </div>
                                <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {company.city && (
                                    <span className="flex items-center space-x-1 truncate">
                                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>{company.city}</span>
                                    </span>
                                  )}
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
                                    {hasNoParent ? 'Missing Sector' : `Unspecified (${rawCurrent || 'None'})`}
                                  </span>
                                </div>
                              </div>

                              {/* Google Search Shortcut Button with Speedrunner Focus Chaining */}
                              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                <GoogleSearchButton
                                  id={`speedrunner-g-${companyId}`}
                                  companyName={company.display_name || company.canonical_name}
                                  location={company.city}
                                  size="xs"
                                  onActivate={() => handleActivateGoogleSearch(companyId)}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Tier 1: Parent Sector Searchable Combobox */}
                          <td className="py-3.5 px-4">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Tier1Combobox
                                id={`tier1-input-${companyId}`}
                                companyId={companyId}
                                value={currentSelection.parentId}
                                sectors={sectors}
                                onSelect={(newParentId) => handleSelectParentSector(companyId, newParentId)}
                                onAdvance={() => handleAdvanceToTier2(companyId)}
                                onSkip={() => handleSkipForSession(company)}
                              />
                            </div>
                          </td>

                          {/* Tier 2: Child Sub-Type Searchable Combobox with Fast Inline Creation */}
                          <td className="py-3.5 px-4">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Tier2Combobox
                                id={`tier2-input-${companyId}`}
                                companyId={companyId}
                                parentId={currentSelection.parentId}
                                value={currentSelection.subtype}
                                availableSubtypes={availableSubtypes}
                                disabled={!currentSelection.parentId}
                                onCommit={(subtype, isNew) =>
                                  handleCommitTier2(companyId, currentSelection.parentId, subtype, isNew, idx, false)
                                }
                                onSkip={() => handleSkipForSession(company)}
                              />
                            </div>
                          </td>

                          {/* 1-Click Tactile Update Action + Session Skip */}
                          <td className="py-3.5 px-4 text-right">
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSkipForSession(company);
                                }}
                                title="Skip for now (moves to end of queue) [Alt + S]"
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer select-none"
                              >
                                <span className="text-[11px] leading-none">⏭️</span>
                                <span>Skip</span>
                              </button>
                              <button
                                type="button"
                                id={`save-btn-${companyId}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCommitTier2(
                                    companyId,
                                    currentSelection.parentId,
                                    currentSelection.subtype,
                                    false,
                                    idx,
                                    true
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCommitTier2(
                                      companyId,
                                      currentSelection.parentId,
                                      currentSelection.subtype,
                                      false,
                                      idx,
                                      true
                                    );
                                  }
                                }}
                                disabled={!currentSelection.parentId || !currentSelection.subtype}
                                title={
                                  !currentSelection.parentId || !currentSelection.subtype
                                    ? 'Select both Parent Sector and Sub-Type to classify'
                                    : 'Save & Advance (Enter)'
                                }
                                className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                  currentSelection.parentId && currentSelection.subtype
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer active:scale-95'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-50'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  confirmDialog.isDestructive
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                    : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {confirmDialog.message}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition shadow-xs ${
                  confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-Memory Triage Session Toast */}
      {triageToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl shadow-2xl border border-slate-700/50 dark:border-slate-300 text-xs font-medium animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="text-amber-400 dark:text-amber-600 font-bold">⏭️</span>
          <span>{triageToast}</span>
        </div>
      )}

      {/* Company 360° Modal Integration */}
      {selected360CompanyId && (
        <Company360Modal
          isOpen={Boolean(selected360CompanyId)}
          companyId={selected360CompanyId}
          companies={companies}
          contacts={contacts}
          salespersons={salespersons}
          enquiries={enquiries}
          callLogs={callLogs}
          user={user}
          activeWorkspace={activeWorkspace}
          setCompanies={setCompanies}
          onClose={() => setSelected360CompanyId(null)}
        />
      )}
    </div>
  );
}
