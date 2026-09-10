import React from 'react';
import { Search, Filter, X, RotateCcw } from 'lucide-react';

export interface SearchResultCounterProps {
  totalCount: number;
  filteredCount: number;
  searchQuery?: string;
  entityLabel?: string;
  singularEntityLabel?: string;
  onClear?: () => void;
  activeFiltersCount?: number;
  activeFilterLabels?: string[];
  className?: string;
  variant?: 'banner' | 'pill' | 'inline' | 'compact';
  alwaysShow?: boolean;
}

/**
 * Standardized Search Result Counter and Active Filter Status Banner
 * Displays real-time matching records count with 1-click Reset / Clear action.
 */
export const SearchResultCounter: React.FC<SearchResultCounterProps> = ({
  totalCount,
  filteredCount,
  searchQuery = '',
  entityLabel = 'Records',
  singularEntityLabel,
  onClear,
  activeFiltersCount = 0,
  activeFilterLabels,
  className = '',
  variant = 'banner',
  alwaysShow = false
}) => {
  const trimmedQuery = searchQuery.trim();
  const isQueryActive = trimmedQuery.length > 0;
  const isCountFiltered = filteredCount < totalCount;
  const areFiltersActive = isQueryActive || isCountFiltered || activeFiltersCount > 0;

  const singular = singularEntityLabel || (entityLabel.endsWith('ies') ? entityLabel.slice(0, -3) + 'y' : entityLabel.endsWith('s') ? entityLabel.slice(0, -1) : entityLabel);
  const currentEntityName = filteredCount === 1 ? singular : entityLabel;

  // If nothing is filtered and alwaysShow is false, don't render
  if (!areFiltersActive && !alwaysShow) {
    return null;
  }

  // Not filtered but alwaysShow is true -> subtle count indicator
  if (!areFiltersActive && alwaysShow) {
    if (variant === 'pill' || variant === 'inline') {
      return (
        <span
          id="search-counter-unfiltered"
          className={`inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-sans ${className}`}
        >
          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{totalCount}</span>
          <span>{entityLabel}</span>
        </span>
      );
    }

    return (
      <div
        id="search-counter-unfiltered-banner"
        className={`flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 ${className}`}
      >
        <span className="flex items-center gap-1.5">
          <span>Total catalog:</span>
          <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{totalCount}</span>
          <span>{entityLabel}</span>
        </span>
      </div>
    );
  }

  // Active filter / search rendering
  // Compact / inline / pill mode
  if (variant === 'pill' || variant === 'inline') {
    return (
      <div
        id="search-result-counter-inline"
        className={`inline-flex items-center gap-2 flex-wrap ${className}`}
      >
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 shadow-2xs">
          {isQueryActive ? <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
          <span>Showing</span>
          <span className="font-bold font-mono text-blue-900 dark:text-blue-100">{filteredCount}</span>
          <span>of</span>
          <span className="font-mono text-slate-600 dark:text-slate-300">{totalCount}</span>
          <span>{entityLabel}</span>
          {isQueryActive && (
            <span className="text-blue-700 dark:text-blue-300 font-normal">
              for <strong className="font-semibold">"{trimmedQuery}"</strong>
            </span>
          )}
        </span>

        {onClear && (
          <button
            type="button"
            id="clear-search-pill-btn"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 shadow-2xs transition cursor-pointer"
            title="Clear active search and filters"
          >
            <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
            <span>Reset</span>
          </button>
        )}
      </div>
    );
  }

  // Full Banner Mode
  return (
    <div
      id="search-result-counter-banner"
      role="status"
      aria-live="polite"
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 shadow-2xs transition-all ${className}`}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 shrink-0">
          {isQueryActive ? <Search className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
        </div>

        <div className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap font-sans">
          {isQueryActive ? (
            <>
              <span>Found</span>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-600 text-white shadow-2xs">
                {filteredCount}
              </span>
              <span>matching {currentEntityName} for</span>
              <span className="font-semibold text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-800/60">
                "{trimmedQuery}"
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                (out of <strong className="font-mono text-slate-700 dark:text-slate-300">{totalCount}</strong> total)
              </span>
            </>
          ) : (
            <>
              <span>Showing</span>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-600 text-white shadow-2xs">
                {filteredCount}
              </span>
              <span>of</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{totalCount}</span>
              <span>{entityLabel}</span>
              {filteredCount < totalCount && (
                <span className="text-slate-500 dark:text-slate-400">
                  (filtered by active criteria)
                </span>
              )}
            </>
          )}

          {activeFilterLabels && activeFilterLabels.length > 0 && (
            <div className="flex items-center gap-1 ml-1 flex-wrap">
              {activeFilterLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800/60"
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {onClear && (
        <button
          type="button"
          id="clear-search-banner-btn"
          onClick={onClear}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/80 shadow-2xs transition-all cursor-pointer shrink-0"
          title="Clear search query and reset all filters"
        >
          <RotateCcw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
          <span>Clear Search / Reset</span>
        </button>
      )}
    </div>
  );
};

export default SearchResultCounter;
