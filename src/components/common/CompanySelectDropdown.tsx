import React, { useState, useRef, useEffect } from 'react';
import { Company } from '../../types';
import { Search, Plus, Building2, MapPin, Loader2, Check } from 'lucide-react';
import { BRAND_CONFIG } from '../../config';

export interface CompanySelectDropdownProps {
  companies: Company[];
  selectedCompanyId: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectCompany: (company: Company) => void;
  onCreateCompanyInline: (companyName: string) => Promise<void> | void;
  isCreating?: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  highlightClasses?: string;
}

export default function CompanySelectDropdown({
  companies,
  selectedCompanyId,
  searchQuery,
  onSearchChange,
  onSelectCompany,
  onCreateCompanyInline,
  isCreating = false,
  isOpen,
  onOpenChange,
  placeholder = BRAND_CONFIG.placeholderSearchText || 'Search client company...',
  disabled = false,
  highlightClasses = ''
}: CompanySelectDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  // Compute matching companies
  const matchingCompanies = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    return companies.filter((c) => {
      const matchName = (c.display_name || '').toLowerCase().includes(q);
      const matchCanon = (c.canonical_name || '').toLowerCase().includes(q);
      const matchAlias = Array.isArray(c.aliases) && c.aliases.some((a) => (a || '').toLowerCase().includes(q));
      return matchName || matchCanon || matchAlias;
    });
  }, [companies, searchQuery]);

  const hasExactMatch = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return false;
    return matchingCompanies.some(
      (c) => (c.display_name || '').toLowerCase().trim() === q ||
             (c.canonical_name || '').toLowerCase().trim() === q
    );
  }, [matchingCompanies, searchQuery]);

  const handleCreate = async () => {
    if (!searchQuery.trim() || isCreating) return;
    await onCreateCompanyInline(searchQuery.trim());
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          required
          disabled={disabled}
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            if (!isOpen) onOpenChange(true);
          }}
          onFocus={() => onOpenChange(true)}
          className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 pl-3 pr-8 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all ${highlightClasses}`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && searchQuery.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl mt-1.5 max-h-56 overflow-y-auto z-50 shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100">
          {/* Matched Companies List */}
          {matchingCompanies.map((c) => {
            const isSelected = c.id === selectedCompanyId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectCompany(c);
                  onOpenChange(false);
                }}
                className={`w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-sans flex items-center justify-between cursor-pointer transition ${
                  isSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate mr-2">
                  <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {c.display_name}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </div>
                    {c.canonical_name && c.canonical_name !== c.display_name && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">
                        Canonical: {c.canonical_name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase shrink-0 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {c.city || '—'}, {c.country || '—'}
                </span>
              </button>
            );
          })}

          {/* Inline Company Creation clickable UI block */}
          {matchingCompanies.length === 0 ? (
            <button
              type="button"
              disabled={isCreating}
              onClick={handleCreate}
              className="w-full p-3.5 bg-blue-50/90 hover:bg-blue-100/90 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-left text-xs font-semibold flex items-center space-x-2.5 transition cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
              ) : (
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <div className="truncate flex-1">
                <span>+ Create New Company: </span>
                <strong className="underline underline-offset-2">"{searchQuery.trim()}"</strong>
              </div>
            </button>
          ) : (
            !hasExactMatch && (
              <button
                type="button"
                disabled={isCreating}
                onClick={handleCreate}
                className="w-full p-2.5 bg-slate-50 hover:bg-blue-50/80 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300 text-left text-[11px] font-medium flex items-center space-x-2 transition cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                {isCreating ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
                <span className="truncate">
                  + Create New Company: <strong>"{searchQuery.trim()}"</strong>
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
