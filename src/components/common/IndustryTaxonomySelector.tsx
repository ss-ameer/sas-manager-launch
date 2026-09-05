import React, { useState, useEffect, useRef } from 'react';
import { useIndustryTaxonomy } from '../../hooks/useIndustryTaxonomy';
import { Check, X, Plus, Sparkles, AlertCircle } from 'lucide-react';

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
    getParentSector,
    findParentForSubtype,
    getSubtypesForParent,
    addCustomSubtype
  } = useIndustryTaxonomy();

  // Inline Quick Creation State
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [inlineNewSubtype, setInlineNewSubtype] = useState('');
  const [inlineTargetParent, setInlineTargetParent] = useState(parentSectorId || 'general_other');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Sync inlineTargetParent when parentSectorId changes
  useEffect(() => {
    if (parentSectorId) {
      setInlineTargetParent(parentSectorId);
    }
  }, [parentSectorId]);

  // Focus input when entering inline creation mode
  useEffect(() => {
    if (isCreatingInline && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [isCreatingInline]);

  // Available sub-types for currently selected parent
  const availableSubtypes = parentSectorId ? getSubtypesForParent(parentSectorId) : [];

  // When Parent Sector is changed by operator
  const handleParentChange = (newParentId: string) => {
    onParentSectorChange(newParentId);

    // If a child sub-type was already selected, check if it belongs to the new parent
    if (subTypeValue && newParentId) {
      const parentSubtypes = getSubtypesForParent(newParentId);
      const belongs = parentSubtypes.some(
        (st) => st.trim().toLowerCase() === subTypeValue.trim().toLowerCase()
      );
      // If it doesn't belong to the newly selected parent, reset it so cascading is clean
      if (!belongs) {
        onSubTypeChange('');
      }
    }
  };

  // When Child Sub-Type is changed by operator
  const handleSubTypeChange = (newVal: string) => {
    if (newVal === '__CREATE_NEW__') {
      setIsCreatingInline(true);
      setInlineNewSubtype('');
      setInlineTargetParent(parentSectorId || 'general_other');
      return;
    }

    onSubTypeChange(newVal);

    // If child is selected first or parent is empty, auto-detect and pre-fill Parent Sector
    if (newVal) {
      const detectedParent = findParentForSubtype(newVal);
      if (detectedParent && detectedParent.id !== parentSectorId) {
        onParentSectorChange(detectedParent.id);
      }
    }
  };

  // Confirm inline custom sub-type creation
  const handleConfirmInlineCreate = async () => {
    const trimmed = inlineNewSubtype.trim();
    if (!trimmed) return;

    setIsSubmittingNew(true);
    const targetParent = inlineTargetParent || parentSectorId || 'general_other';

    try {
      await addCustomSubtype(targetParent, trimmed, userIdentifier);
      onParentSectorChange(targetParent);
      onSubTypeChange(trimmed);
      setIsCreatingInline(false);
      setInlineNewSubtype('');
    } catch (err) {
      console.error('[IndustryTaxonomySelector] Error adding custom sub-type:', err);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleCancelInlineCreate = () => {
    setIsCreatingInline(false);
    setInlineNewSubtype('');
  };

  const isDark = variant === 'dark';

  const selectContainerClass = isDark
    ? 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-blue-500'
    : 'bg-white border-slate-300 text-slate-800 focus:ring-blue-500';

  const heightClass = size === 'sm' ? 'h-9 text-xs px-2.5 rounded-lg' : 'h-11 text-sm px-4 rounded-xl';

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3.5 ${className}`}>
      {/* Tier 1: Macro Parent Category */}
      <div>
        {showLabels && (
          <label
            htmlFor={`${idPrefix}-parent-select`}
            className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between"
          >
            <span>Macro Parent Category</span>
            <span className="text-slate-500 font-sans lowercase font-normal">Tier 1</span>
          </label>
        )}
        <select
          id={`${idPrefix}-parent-select`}
          value={parentSectorId}
          onChange={(e) => handleParentChange(e.target.value)}
          className={`w-full ${heightClass} border font-sans cursor-pointer focus:ring-2 focus:border-transparent outline-none transition-all ${selectContainerClass}`}
        >
          <option value="">Select Parent Industry (Optional)</option>
          {sectors.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.icon} {sec.label || sec.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tier 2: Child GBP Sub-Type */}
      <div>
        {showLabels && (
          <label
            htmlFor={`${idPrefix}-subtype-select`}
            className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between"
          >
            <span>Raw Business Type</span>
            <span className="text-slate-500 font-sans lowercase font-normal">GBP Sub-Type Tier 2</span>
          </label>
        )}

        {isCreatingInline ? (
          /* Inline New Sub-Type Input Mode */
          <div className="flex items-center gap-1.5 animate-fadeIn">
            <div className="relative flex-1">
              <input
                ref={inlineInputRef}
                type="text"
                value={inlineNewSubtype}
                onChange={(e) => setInlineNewSubtype(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmInlineCreate();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelInlineCreate();
                  }
                }}
                placeholder="Enter GBP Sub-Type (e.g. Diving Center)..."
                disabled={isSubmittingNew}
                className={`w-full ${heightClass} border font-sans pr-8 focus:ring-2 focus:border-transparent outline-none transition-all ${
                  isDark
                    ? 'bg-slate-900 border-blue-500 text-white placeholder-slate-400'
                    : 'bg-white border-blue-500 text-slate-900 placeholder-slate-400'
                }`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            </div>

            {/* If no parent sector was selected, allow choosing parent sector for the new tag */}
            {!parentSectorId && (
              <select
                value={inlineTargetParent}
                onChange={(e) => setInlineTargetParent(e.target.value)}
                title="Assign newly created sub-type to parent sector"
                className={`w-28 ${heightClass} border font-sans text-xs cursor-pointer outline-none ${selectContainerClass}`}
              >
                {sectors.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.icon} {sec.label || sec.name}
                  </option>
                ))}
              </select>
            )}

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleConfirmInlineCreate}
              disabled={!inlineNewSubtype.trim() || isSubmittingNew}
              title="Confirm and Add Sub-Type (Enter)"
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-xs transition flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4" />
            </button>

            {/* Cancel button */}
            <button
              type="button"
              onClick={handleCancelInlineCreate}
              disabled={isSubmittingNew}
              title="Cancel (Esc)"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-xs transition flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Standard Cascading Dropdown Mode */
          <select
            id={`${idPrefix}-subtype-select`}
            value={subTypeValue}
            onChange={(e) => handleSubTypeChange(e.target.value)}
            className={`w-full ${heightClass} border font-sans cursor-pointer focus:ring-2 focus:border-transparent outline-none transition-all ${selectContainerClass}`}
          >
            <option value="">
              {parentSectorId ? 'Select GBP Sub-Type...' : 'Select GBP Sub-Type (All Sectors)...'}
            </option>

            {/* If company already has a custom/historical subTypeValue not in current list, keep it visible and selected */}
            {subTypeValue &&
              (parentSectorId
                ? !availableSubtypes.some((s) => s.toLowerCase() === subTypeValue.toLowerCase())
                : !sectors.some((sec) =>
                    (sec.subtypes || []).some((st) => st.toLowerCase() === subTypeValue.toLowerCase())
                  )) && (
                <option value={subTypeValue}>{subTypeValue} (Current / Custom)</option>
              )}

            {parentSectorId ? (
              /* Sub-types filtered strictly by selected Parent Sector */
              availableSubtypes.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))
            ) : (
              /* If no Parent Sector is selected yet, display sub-types grouped by parent */
              sectors.map((sec) => (
                <optgroup key={sec.id} label={`${sec.icon} ${sec.label || sec.name}`}>
                  {(sec.subtypes || []).map((st) => (
                    <option key={`${sec.id}_${st}`} value={st}>
                      {st}
                    </option>
                  ))}
                </optgroup>
              ))
            )}

            {/* Create New Sub-Type trigger */}
            <option
              value="__CREATE_NEW__"
              className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
            >
              + Add Custom Sub-Type...
            </option>
          </select>
        )}
      </div>
    </div>
  );
};

export default IndustryTaxonomySelector;
