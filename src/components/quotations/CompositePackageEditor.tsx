import React, { useState } from 'react';
import { LineItemComponent } from '../../types';
import {
  recalculateCompositeItemTotals,
  applyMarkupToSubComponents,
  getKingSaudOptionASstItem,
  getKingSaudOptionBGfsItem
} from '../../utils/kingSaudTankPreset';
import {
  Layers,
  Plus,
  Trash2,
  Percent,
  CheckCircle2,
  Sparkles,
  Wrench,
  Package,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface CompositePackageEditorProps {
  isCompositeSet?: boolean;
  subComponents?: LineItemComponent[];
  packagePricingMode?: 'itemized' | 'lump_sum';
  optionScopeNotes?: string;
  parentQuantity?: number;
  currency?: string;
  onChange: (patch: {
    is_composite_set: boolean;
    sub_components: LineItemComponent[];
    package_pricing_mode: 'itemized' | 'lump_sum';
    option_scope_notes?: string;
    unit_price?: number;
    cost_price?: number;
    total_price?: number;
    item_name?: string;
    description?: string;
    hs_code?: string;
    option?: string;
    unit?: string;
  }) => void;
  compact?: boolean;
}

export const CompositePackageEditor: React.FC<CompositePackageEditorProps> = ({
  isCompositeSet = false,
  subComponents = [],
  packagePricingMode = 'itemized',
  optionScopeNotes = '',
  parentQuantity = 1,
  currency = 'USD',
  onChange,
  compact = false
}) => {
  const [markupInput, setMarkupInput] = useState<string>('15');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const hasSubComponents = Boolean(isCompositeSet || (subComponents && subComponents.length > 0));
  const pricedComponents = (subComponents || []).filter((c) => !c.is_included_accessory);
  const accessoryComponents = (subComponents || []).filter((c) => Boolean(c.is_included_accessory));

  const totals = recalculateCompositeItemTotals(subComponents || [], parentQuantity);
  const marginPct =
    totals.packageUnitPrice > 0 && totals.packageCostPrice > 0
      ? (((totals.packageUnitPrice - totals.packageCostPrice) / totals.packageUnitPrice) * 100).toFixed(1)
      : null;

  const handleEnableComposite = (enable: boolean) => {
    if (!enable) {
      onChange({
        is_composite_set: false,
        sub_components: subComponents || [],
        package_pricing_mode: packagePricingMode,
        option_scope_notes: optionScopeNotes
      });
      return;
    }

    const initialComponents: LineItemComponent[] =
      subComponents && subComponents.length > 0
        ? subComponents
        : [
            {
              id: `comp_${Date.now()}_1`,
              sn: '1.1',
              item_name: '',
              remark: '',
              quantity: 1,
              unit: 'NOS',
              cost_price: 0,
              unit_price: 0,
              total_price: 0,
              is_included_accessory: false
            }
          ];

    const calc = recalculateCompositeItemTotals(initialComponents, parentQuantity);
    onChange({
      is_composite_set: true,
      sub_components: calc.components,
      package_pricing_mode: packagePricingMode || 'itemized',
      option_scope_notes: optionScopeNotes,
      ...(calc.packageUnitPrice > 0
        ? {
            unit_price: calc.packageUnitPrice,
            cost_price: calc.packageCostPrice,
            total_price: calc.packageTotalPrice
          }
        : {})
    });
  };

  const handleComponentsUpdate = (nextList: LineItemComponent[], nextMode = packagePricingMode, nextNotes = optionScopeNotes) => {
    const calc = recalculateCompositeItemTotals(nextList, parentQuantity);
    onChange({
      is_composite_set: true,
      sub_components: calc.components,
      package_pricing_mode: nextMode,
      option_scope_notes: nextNotes,
      unit_price: calc.packageUnitPrice,
      cost_price: calc.packageCostPrice,
      total_price: calc.packageTotalPrice
    });
  };

  const handleAddComponentRow = (isAccessory: boolean) => {
    const nextIdx = (subComponents?.length || 0) + 1;
    const newRow: LineItemComponent = {
      id: `comp_${Date.now()}_${nextIdx}`,
      sn: isAccessory ? `A${accessoryComponents.length + 1}` : `1.${pricedComponents.length + 1}`,
      item_name: '',
      remark: isAccessory ? 'Included Standard Accessory' : '',
      quantity: 1,
      unit: 'NOS',
      cost_price: 0,
      unit_price: 0,
      total_price: 0,
      is_included_accessory: isAccessory
    };
    handleComponentsUpdate([...(subComponents || []), newRow]);
  };

  const handleUpdateRowField = (
    compId: string,
    field: keyof LineItemComponent,
    value: any
  ) => {
    const nextList = (subComponents || []).map((c) => {
      if (c.id !== compId) return c;
      const updated = { ...c, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const q = Math.max(0, Number(updated.quantity) || 0);
        const up = updated.is_included_accessory ? 0 : Number(updated.unit_price) || 0;
        updated.total_price = Number((q * up).toFixed(2));
      }
      return updated;
    });
    handleComponentsUpdate(nextList);
  };

  const handleDeleteRow = (compId: string) => {
    const nextList = (subComponents || []).filter((c) => c.id !== compId);
    handleComponentsUpdate(nextList);
  };

  const handleApplyBatchMarkup = (pct: number) => {
    setMarkupInput(String(pct));
    const markedUp = applyMarkupToSubComponents(subComponents || [], pct);
    handleComponentsUpdate(markedUp);
  };

  const handleLoadKingSaudPreset = (which: 'sst' | 'gfs') => {
    const curr = currency === 'AED' ? 'AED' : 'USD';
    const preset = which === 'sst' ? getKingSaudOptionASstItem(curr) : getKingSaudOptionBGfsItem(curr);
    onChange({
      is_composite_set: true,
      sub_components: preset.sub_components || [],
      package_pricing_mode: preset.package_pricing_mode || 'itemized',
      option_scope_notes: preset.option_scope_notes,
      unit_price: preset.unit_price,
      cost_price: preset.cost_price,
      total_price: preset.total_price,
      item_name: preset.item_name,
      description: preset.description,
      hs_code: preset.hs_code,
      option: preset.option,
      unit: 'SET'
    });
  };

  return (
    <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-3 space-y-3">
      {/* Top Toggle & Package Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg p-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={() => handleEnableComposite(false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                !hasSubComponents
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Single Product
            </button>
            <button
              type="button"
              onClick={() => handleEnableComposite(true)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                hasSubComponents
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Multi-Component Set / Package (BOM)</span>
              {hasSubComponents && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-white font-mono text-[10px]">
                  {subComponents.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Loaders for King Saud STP Reference Offers */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => handleLoadKingSaudPreset('sst')}
              className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Populate this line item with King Saud Air Base STP Option A (SST Tank Set — 8 Tanks + 6 Accessories)"
            >
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>Load Option A (SST Tank Set)</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadKingSaudPreset('gfs')}
              className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Populate this line item with King Saud Air Base STP Option B (GFS Tank Set — 8 Tanks + 6 Accessories)"
            >
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>Load Option B (GFS Tank Set)</span>
            </button>
          </div>
        </div>

        {hasSubComponents && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isExpanded ? 'Collapse BOM' : `Expand BOM (${subComponents.length} parts)`}</span>
          </button>
        )}
      </div>

      {hasSubComponents && isExpanded && (
        <div className="space-y-3 pt-1 border-t border-indigo-200/60 dark:border-indigo-900/50">
          {/* Pricing Display Mode & Supplier Markup Calculator */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                Quote Display:
              </span>
              <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleComponentsUpdate(subComponents, 'itemized', optionScopeNotes)}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                    packagePricingMode !== 'lump_sum'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white'
                  }`}
                >
                  Itemized Component Prices
                </button>
                <button
                  type="button"
                  onClick={() => handleComponentsUpdate(subComponents, 'lump_sum', optionScopeNotes)}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                    packagePricingMode === 'lump_sum'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white'
                  }`}
                >
                  Single Package Lump-Sum
                </button>
              </div>
            </div>

            {/* Batch Supplier Markup Calculator */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-500 flex items-center gap-1">
                <Percent className="w-3 h-3 text-indigo-600" />
                <span>Markup on Cost:</span>
              </span>
              {[0, 10, 15, 20, 25].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleApplyBatchMarkup(pct)}
                  className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold transition cursor-pointer"
                  title={`Set all component Selling Prices = Supplier Cost + ${pct}%`}
                >
                  {pct === 0 ? 'At Cost (0%)' : `+${pct}%`}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  value={markupInput}
                  onChange={(e) => setMarkupInput(e.target.value)}
                  className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-right"
                  placeholder="%"
                />
                <button
                  type="button"
                  onClick={() => handleApplyBatchMarkup(Number(markupInput) || 0)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-semibold cursor-pointer"
                >
                  Apply %
                </button>
              </div>
            </div>
          </div>

          {/* Priced Sub-Components Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-600" />
                <span>Priced Tank / System Components ({pricedComponents.length})</span>
              </span>
              <button
                type="button"
                onClick={() => handleAddComponentRow(false)}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3" />
                <span>+ Add Component</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase text-slate-500">
                    <th className="py-1.5 px-2 w-8 text-center">#</th>
                    <th className="py-1.5 px-2 min-w-[210px]">Component Model / Specification</th>
                    <th className="py-1.5 px-2 min-w-[150px]">Remark / Tank Application</th>
                    <th className="py-1.5 px-2 w-16 text-center">Qty</th>
                    <th className="py-1.5 px-2 w-18 text-center">UOM</th>
                    <th className="py-1.5 px-2 w-28 text-right">Supplier Cost ({currency})</th>
                    <th className="py-1.5 px-2 w-28 text-right">Selling Rate ({currency})</th>
                    <th className="py-1.5 px-2 w-28 text-right">Line Total ({currency})</th>
                    <th className="py-1.5 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pricedComponents.map((comp, idx) => (
                    <tr key={comp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={comp.item_name ?? ''}
                          onChange={(e) => handleUpdateRowField(comp.id, 'item_name', e.target.value)}
                          placeholder="e.g. SST 475-60; Dia : 16.04m ; Ht : 6.0m ; Gross Cap : 1219KL"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-medium text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={comp.remark ?? ''}
                          onChange={(e) => handleUpdateRowField(comp.id, 'remark', e.target.value)}
                          placeholder="e.g. Equalization Tank (Closed Type Roof)"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={comp.quantity ?? 1}
                          onChange={(e) => handleUpdateRowField(comp.id, 'quantity', Number(e.target.value))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono font-bold text-center"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={comp.unit ?? 'NOS'}
                          onChange={(e) => handleUpdateRowField(comp.id, 'unit', e.target.value.toUpperCase())}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-center uppercase"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={comp.cost_price ?? 0}
                          onChange={(e) => handleUpdateRowField(comp.id, 'cost_price', Number(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-right text-slate-600 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={comp.unit_price ?? 0}
                          onChange={(e) => handleUpdateRowField(comp.id, 'unit_price', Number(e.target.value))}
                          className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded px-2 py-1 text-[11px] font-mono font-bold text-right text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-[11px] text-slate-900 dark:text-white tabular-nums">
                        {Number(comp.total_price || 0).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(comp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Delete component row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Included Zero-Price Accessories Section (e.g., HDG Flanged Outlets, Cage Ladders, Goose Neck Airvents) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                <span>Included Package Accessories — Quantity Only / Included in Price ({accessoryComponents.length})</span>
              </span>
              <button
                type="button"
                onClick={() => handleAddComponentRow(true)}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Add Included Accessory</span>
              </button>
            </div>

            {accessoryComponents.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {accessoryComponents.map((acc, idx) => (
                  <div key={acc.id} className="px-3 py-1.5 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                      A{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={acc.item_name ?? ''}
                      onChange={(e) => handleUpdateRowField(acc.id, 'item_name', e.target.value)}
                      placeholder="e.g. HDG CAGE LADDER UPTO 6.0 MTRS WITH PLATFORM"
                      className="flex-1 min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-slate-400">Qty:</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={acc.quantity ?? 1}
                        onChange={(e) => handleUpdateRowField(acc.id, 'quantity', Number(e.target.value))}
                        className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono font-bold text-center"
                      />
                      <input
                        type="text"
                        value={acc.unit ?? 'NOS'}
                        onChange={(e) => handleUpdateRowField(acc.id, 'unit', e.target.value.toUpperCase())}
                        className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-center uppercase"
                      />
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-semibold">
                        Included
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(acc.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Remove accessory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-[11px] text-slate-400 italic">
                No zero-price accessories listed. Click "+ Add Included Accessory" for items like HDG Flanged Outlets, Cage Ladders, or Airvents included in the tank set.
              </p>
            )}
          </div>

          {/* Option Technical Scope Notes & Package Rollup Summary */}
          {!compact && (
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">
                Option / Package Technical Scope &amp; Material Notes (Printed below this Option Table)
              </label>
              <textarea
                rows={2}
                value={optionScopeNotes ?? ''}
                onChange={(e) =>
                  handleComponentsUpdate(subComponents, packagePricingMode, e.target.value)
                }
                placeholder="e.g. 1. Tank design is based on AWWA D103-09. 2. External HDG Ladder, 1 No Drain Nozzle + Top Manhole + Level Indicator included."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Package Rollup Totals Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-950 text-white text-xs font-mono">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-indigo-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {pricedComponents.reduce((acc, c) => acc + (Number(c.quantity) || 0), 0)} Priced Units +{' '}
                  {accessoryComponents.reduce((acc, c) => acc + (Number(c.quantity) || 0), 0)} Included Accessories
                </span>
              </span>
              {totals.packageCostPrice > 0 && (
                <span className="text-slate-300">
                  Supplier Cost: <strong>{currency} {totals.packageCostPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </span>
              )}
              {marginPct !== null && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10.5px]">
                  Margin: {marginPct}%
                </span>
              )}
            </div>
            <div className="font-bold text-sm text-amber-300">
              Package Total: {currency}{' '}
              {totals.packageTotalPrice.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CompositePackageEditor;
