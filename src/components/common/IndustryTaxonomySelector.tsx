import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useIndustryTaxonomy } from '../../hooks/useIndustryTaxonomy';
import { normalizeSubTypeName } from '../../utils/taxonomy';
import { Check, ChevronDown, Sparkles, X, Plus, Search, Loader2 } from 'lucide-react';

export interface IndustryTaxonomySelectorProps {
  parentSectorId: string;
  onParentSectorChange: (parentId: string) => void;
  subTypeValue: string;
  onSubTypeChange: (subType: string) => void;
  userIdentifier?: string;
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md';
  idPrefix?: string;
  className?: string;
  showLabels?: boolean;
}

export const IndustryTaxonomySelector: React.FC<IndustryTaxonomySelectorProps> = ({
  parentSectorId,
  onParentSectorChange,
  subTypeValue,
  onSubTypeChange,
  userIdentifier = 'Operator',
  variant = 'dark',
  size = 'md',
  idPrefix = 'ind-tax',
  className = '',
  showLabels = true
}) => {
  const {
    sectors,
    findParentForSubtype,
    getSubtypesForParent,
    addCustomSubtype
  } = useIndustryTaxonomy();

  const isDark = variant === 'dark';

  // ---------------------------------------------------------------------------
  // Tier 1 Combobox State (Macro Parent Category)
  // ---------------------------------------------------------------------------
  const [isTier1Open, setIsTier1Open] = useState(false);
  const [tier1Search, setTier1Search] = useState('');
  const [tier1HighlightedIdx, setTier1HighlightedIdx] = useState(0);
  const tier1WrapperRef = useRef<HTMLDivElement>(null);
  const tier1ListRef = useRef<HTMLDivElement>(null);
  const tier1InputRef = useRef<HTMLInputElement>(null);

  const selectedSector = useMemo(() => {
    return sectors.find((s) => s.id === parentSectorId);
  }, [sectors, parentSectorId]);

  // Strip emojis and punctuation to ensure keyboard filtering works even if sectors start with emojis
  const filteredSectors = useMemo(() => {
    const q = tier1Search.trim().toLowerCase();
    if (!q) return sectors;

    return sectors.filter((sec) => {
      const rawLabel = (sec.label || '').toLowerCase();
      const rawName = (sec.name || '').toLowerCase();
      const rawId = (sec.id || '').toLowerCase();
      const cleanLabel = (sec.label || sec.name || '')
        .replace(/[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .toLowerCase()
        .trim();

      return (
        cleanLabel.includes(q) ||
        rawLabel.includes(q) ||
        rawName.includes(q) ||
        rawId.includes(q)
      );
    });
  }, [sectors, tier1Search]);

  // Auto-scroll highlighted Tier 1 item into view
  useEffect(() => {
    if (isTier1Open && tier1ListRef.current) {
      const activeEl = tier1ListRef.current.querySelector(
        `[data-tier1-idx="${tier1HighlightedIdx}"]`
      ) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [tier1HighlightedIdx, isTier1Open]);

  const handleParentSelect = (newParentId: string) => {
    onParentSectorChange(newParentId);
    setIsTier1Open(false);
    setTier1Search('');

    // If a child sub-type was already selected, check if it belongs to the new parent
    if (subTypeValue && newParentId) {
      const parentSubtypes = getSubtypesForParent(newParentId);
      const belongs = parentSubtypes.some(
        (st) => st.trim().toLowerCase() === subTypeValue.trim().toLowerCase()
      );
      if (!belongs) {
        onSubTypeChange('');
      }
    }
  };

  const handleClearParent = (e: React.MouseEvent) => {
    e.stopPropagation();
    onParentSectorChange('');
    setTier1Search('');
  };

  const handleTier1KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isTier1Open) {
        setIsTier1Open(true);
      } else if (filteredSectors.length > 0) {
        setTier1HighlightedIdx((prev) => (prev + 1) % filteredSectors.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isTier1Open) {
        setIsTier1Open(true);
      } else if (filteredSectors.length > 0) {
        setTier1HighlightedIdx(
          (prev) => (prev - 1 + filteredSectors.length) % filteredSectors.length
        );
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredSectors.length > 0) {
        const target = filteredSectors[tier1HighlightedIdx] || filteredSectors[0];
        handleParentSelect(target.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsTier1Open(false);
      setTier1Search('');
    } else if (e.key === 'Tab') {
      if (isTier1Open && filteredSectors.length > 0) {
        const target = filteredSectors[tier1HighlightedIdx] || filteredSectors[0];
        handleParentSelect(target.id);
      }
      setIsTier1Open(false);
      setTier1Search('');
    }
  };

  // ---------------------------------------------------------------------------
  // Tier 2 Combobox State (Child GBP Sub-Type)
  // ---------------------------------------------------------------------------
  const [isTier2Open, setIsTier2Open] = useState(false);
  const [tier2Search, setTier2Search] = useState('');
  const [tier2HighlightedIdx, setTier2HighlightedIdx] = useState(0);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const tier2WrapperRef = useRef<HTMLDivElement>(null);
  const tier2ListRef = useRef<HTMLDivElement>(null);
  const tier2InputRef = useRef<HTMLInputElement>(null);

  // Available sub-types based on parent sector (or all if none selected)
  const availableSubtypes = useMemo(() => {
    let list: string[] = [];
    if (parentSectorId) {
      list = getSubtypesForParent(parentSectorId);
    } else {
      const set = new Set<string>();
      sectors.forEach((sec) => {
        (sec.subtypes || []).forEach((st) => set.add(st));
      });
      list = Array.from(set);
    }

    // If company has an existing custom/historical subTypeValue, preserve it in the list
    if (subTypeValue && !list.some((s) => s.toLowerCase() === subTypeValue.toLowerCase())) {
      list = [subTypeValue, ...list];
    }
    return list;
  }, [parentSectorId, getSubtypesForParent, sectors, subTypeValue]);

  const trimmedSearch = tier2Search.trim();
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

  interface Tier2Option {
    type: 'create' | 'existing';
    value: string;
    label: string;
  }

  const tier2Options: Tier2Option[] = useMemo(() => {
    const list: Tier2Option[] = [];
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

  // Auto-scroll highlighted Tier 2 item into view
  useEffect(() => {
    if (isTier2Open && tier2ListRef.current) {
      const activeEl = tier2ListRef.current.querySelector(
        `[data-tier2-idx="${tier2HighlightedIdx}"]`
      ) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [tier2HighlightedIdx, isTier2Open]);

  const handleTier2Select = async (opt: Tier2Option) => {
    if (opt.type === 'create') {
      const trimmed = opt.value;
      if (!trimmed) return;
      setIsSubmittingNew(true);
      const targetParent = parentSectorId || 'general_other';
      try {
        await addCustomSubtype(targetParent, trimmed, userIdentifier);
        if (!parentSectorId) {
          onParentSectorChange(targetParent);
        }
        onSubTypeChange(trimmed);
      } catch (err) {
        console.error('[IndustryTaxonomySelector] Error adding custom sub-type:', err);
      } finally {
        setIsSubmittingNew(false);
        setIsTier2Open(false);
        setTier2Search('');
      }
    } else {
      onSubTypeChange(opt.value);
      // If child is selected without a parent, auto-detect and pre-fill Parent Sector
      if (!parentSectorId) {
        const detected = findParentForSubtype(opt.value);
        if (detected) {
          onParentSectorChange(detected.id);
        }
      }
      setIsTier2Open(false);
      setTier2Search('');
    }
  };

  const handleClearSubType = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSubTypeChange('');
    setTier2Search('');
  };

  const handleTier2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isTier2Open) {
        setIsTier2Open(true);
      } else if (tier2Options.length > 0) {
        setTier2HighlightedIdx((prev) => (prev + 1) % tier2Options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isTier2Open) {
        setIsTier2Open(true);
      } else if (tier2Options.length > 0) {
        setTier2HighlightedIdx(
          (prev) => (prev - 1 + tier2Options.length) % tier2Options.length
        );
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (tier2Options.length > 0) {
        const target = tier2Options[tier2HighlightedIdx] || tier2Options[0];
        handleTier2Select(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsTier2Open(false);
      setTier2Search('');
    } else if (e.key === 'Tab') {
      if (isTier2Open && tier2Options.length > 0) {
        const target = tier2Options[tier2HighlightedIdx] || tier2Options[0];
        handleTier2Select(target);
      }
      setIsTier2Open(false);
      setTier2Search('');
    }
  };

  // ---------------------------------------------------------------------------
  // Outside Click Listener to Dismiss Dropdowns Cleanly
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        tier1WrapperRef.current &&
        !tier1WrapperRef.current.contains(e.target as Node)
      ) {
        setIsTier1Open(false);
        setTier1Search('');
      }
      if (
        tier2WrapperRef.current &&
        !tier2WrapperRef.current.contains(e.target as Node)
      ) {
        setIsTier2Open(false);
        setTier2Search('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ---------------------------------------------------------------------------
  // Geometry & Styling Classes
  // ---------------------------------------------------------------------------
  const heightClass = size === 'sm' ? 'h-9 text-xs rounded-lg' : 'h-11 text-sm rounded-xl';
  const paddingClass = size === 'sm' ? 'pl-2.5 pr-8' : 'pl-3.5 pr-8';

  const containerInputClass = isDark
    ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const dropdownContainerClass = isDark
    ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-100 shadow-2xl'
    : 'bg-white border-slate-200 divide-slate-100 text-slate-800 shadow-2xl';

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3.5 ${className}`}>
      {/* Tier 1: Macro Parent Category Combobox */}
      <div ref={tier1WrapperRef} className="relative">
        {showLabels && (
          <label
            htmlFor={`${idPrefix}-parent-input`}
            className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between select-none"
          >
            <span>Macro Parent Category</span>
            <span className="text-slate-500 font-sans lowercase font-normal">Tier 1</span>
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={tier1InputRef}
            id={`${idPrefix}-parent-input`}
            type="text"
            value={
              isTier1Open
                ? tier1Search
                : selectedSector
                ? `${selectedSector.icon || ''} ${selectedSector.label || selectedSector.name}`.trim()
                : ''
            }
            onChange={(e) => {
              setTier1Search(e.target.value);
              if (!isTier1Open) setIsTier1Open(true);
              setTier1HighlightedIdx(0);
            }}
            onFocus={() => {
              setIsTier1Open(true);
              setTier1Search('');
              const curIdx = sectors.findIndex((s) => s.id === parentSectorId);
              setTier1HighlightedIdx(curIdx >= 0 ? curIdx : 0);
            }}
            onKeyDown={handleTier1KeyDown}
            placeholder={
              selectedSector
                ? `${selectedSector.icon || ''} ${selectedSector.label || selectedSector.name}`.trim()
                : 'Search parent sector (e.g. Construction, Healthcare)...'
            }
            autoComplete="off"
            className={`w-full ${heightClass} ${paddingClass} border font-sans cursor-pointer outline-none transition-all ${containerInputClass}`}
          />

          {/* Right Action Icons (Clear / Chevron) */}
          <div className="absolute right-2.5 flex items-center space-x-1">
            {parentSectorId && !isTier1Open ? (
              <button
                type="button"
                onClick={handleClearParent}
                className="p-1 text-slate-400 hover:text-slate-200 transition rounded-full hover:bg-slate-800/60 cursor-pointer"
                title="Clear parent sector"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="pointer-events-none text-slate-400">
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-150 ${
                    isTier1Open ? 'rotate-180 text-blue-400' : ''
                  }`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tier 1 Filtered List Dropdown */}
        {isTier1Open && (
          <div
            ref={tier1ListRef}
            className={`absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl border divide-y py-1 animate-in fade-in zoom-in-95 duration-100 ${dropdownContainerClass}`}
          >
            {filteredSectors.length === 0 ? (
              <div className="px-3 py-2 text-slate-400 italic text-xs">
                No matching parent sectors
              </div>
            ) : (
              filteredSectors.map((sec, idx) => {
                const isSelected = sec.id === parentSectorId;
                const isHighlighted = idx === tier1HighlightedIdx;

                return (
                  <div
                    key={sec.id}
                    data-tier1-idx={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleParentSelect(sec.id);
                    }}
                    onMouseEnter={() => setTier1HighlightedIdx(idx)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-xs ${
                      isHighlighted
                        ? 'bg-blue-600 text-white font-semibold'
                        : isSelected
                        ? isDark
                          ? 'bg-blue-950/40 text-blue-400 font-semibold'
                          : 'bg-blue-50 text-blue-700 font-semibold'
                        : isDark
                        ? 'hover:bg-slate-800 text-slate-200'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-sm shrink-0">{sec.icon}</span>
                      <span className="truncate">{sec.label || sec.name}</span>
                    </div>
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isHighlighted
                            ? 'text-white'
                            : 'text-blue-500 dark:text-blue-400'
                        }`}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Tier 2: Child GBP Sub-Type Combobox */}
      <div ref={tier2WrapperRef} className="relative">
        {showLabels && (
          <label
            htmlFor={`${idPrefix}-subtype-input`}
            className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between select-none"
          >
            <span>Raw Business Type</span>
            <span className="text-slate-500 font-sans lowercase font-normal">GBP Sub-Type Tier 2</span>
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={tier2InputRef}
            id={`${idPrefix}-subtype-input`}
            type="text"
            value={isTier2Open ? tier2Search : subTypeValue || ''}
            onChange={(e) => {
              setTier2Search(e.target.value);
              if (!isTier2Open) setIsTier2Open(true);
              setTier2HighlightedIdx(0);
            }}
            onFocus={() => {
              setIsTier2Open(true);
              setTier2Search('');
              const curIdx = tier2Options.findIndex((o) => o.value === subTypeValue);
              setTier2HighlightedIdx(curIdx >= 0 ? curIdx : 0);
            }}
            onKeyDown={handleTier2KeyDown}
            placeholder={
              subTypeValue
                ? subTypeValue
                : parentSectorId
                ? 'Type to filter GBP sub-type (e.g. Diving Center)...'
                : 'Type or choose sub-type (All Sectors)...'
            }
            autoComplete="off"
            className={`w-full ${heightClass} ${paddingClass} border font-sans cursor-pointer outline-none transition-all ${containerInputClass}`}
          />

          {/* Right Action Icons (Loader / Clear / Chevron) */}
          <div className="absolute right-2.5 flex items-center space-x-1">
            {isSubmittingNew ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : subTypeValue && !isTier2Open ? (
              <button
                type="button"
                onClick={handleClearSubType}
                className="p-1 text-slate-400 hover:text-slate-200 transition rounded-full hover:bg-slate-800/60 cursor-pointer"
                title="Clear sub-type"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="pointer-events-none text-slate-400">
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-150 ${
                    isTier2Open ? 'rotate-180 text-blue-400' : ''
                  }`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tier 2 Filtered List Dropdown */}
        {isTier2Open && (
          <div
            ref={tier2ListRef}
            className={`absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl border divide-y py-1 animate-in fade-in zoom-in-95 duration-100 ${dropdownContainerClass}`}
          >
            {tier2Options.length === 0 ? (
              <div className="px-3 py-2 text-slate-400 italic text-xs">
                No matching sub-types found
              </div>
            ) : (
              tier2Options.map((opt, idx) => {
                const isSelected = opt.type === 'existing' && opt.value === subTypeValue;
                const isHighlighted = idx === tier2HighlightedIdx;

                if (opt.type === 'create') {
                  return (
                    <div
                      key="create-new-opt"
                      data-tier2-idx={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleTier2Select(opt);
                      }}
                      onMouseEnter={() => setTier2HighlightedIdx(idx)}
                      className={`flex items-center space-x-2 px-3 py-2 cursor-pointer transition-colors text-xs ${
                        isHighlighted
                          ? 'bg-emerald-600 text-white font-bold'
                          : isDark
                          ? 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-600 hover:text-white font-semibold'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white font-semibold'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{opt.label}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={opt.value}
                    data-tier2-idx={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleTier2Select(opt);
                    }}
                    onMouseEnter={() => setTier2HighlightedIdx(idx)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-xs ${
                      isHighlighted
                        ? 'bg-blue-600 text-white font-semibold'
                        : isSelected
                        ? isDark
                          ? 'bg-blue-950/40 text-blue-400 font-semibold'
                          : 'bg-blue-50 text-blue-700 font-semibold'
                        : isDark
                        ? 'hover:bg-slate-800 text-slate-200'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isHighlighted
                            ? 'text-white'
                            : 'text-blue-500 dark:text-blue-400'
                        }`}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndustryTaxonomySelector;
