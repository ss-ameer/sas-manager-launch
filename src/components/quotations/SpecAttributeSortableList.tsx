import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, CornerDownLeft, GripVertical } from 'lucide-react';
import {
  canonicalSpecAttributeKey,
  isCoreSpecAttributeKey
} from '../../utils/specAttributeLayout';

export interface SpecAttributeSortableItem {
  key: string;
  isVisible: boolean;
  isFullWidth: boolean;
  hasBreakAfter: boolean;
  /** Optional indicator when an attribute is suppressed by global visibility in a per-item view */
  globallyHidden?: boolean;
  /** Optional subtle value preview (e.g. for focused item inspector) */
  valuePreview?: string;
}

interface SpecAttributeSortableListProps {
  items: SpecAttributeSortableItem[];
  onToggleVisibility: (key: string) => void;
  onToggleFullWidth: (key: string) => void;
  onToggleBreakAfter: (key: string) => void;
  onReorder: (nextOrderedKeys: string[]) => void;
  compact?: boolean;
  emptyLabel?: string;
}

/**
 * Fast, ergonomic vertical sortable list for quotation technical specs & core attributes.
 * Supports native HTML5 drag-and-drop via the ⋮⋮ handle plus precision ↑/↓ buttons,
 * aligned visibility checkboxes, Core metadata badges, and compact 50%/100% & ↵ toggles.
 */
export const SpecAttributeSortableList: React.FC<SpecAttributeSortableListProps> = ({
  items,
  onToggleVisibility,
  onToggleFullWidth,
  onToggleBreakAfter,
  onReorder,
  compact = false,
  emptyLabel = 'No specification attributes available.'
}) => {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[11px] text-slate-500 text-center">
        {emptyLabel}
      </div>
    );
  }

  const orderedKeys = items.map((i) => i.key);

  const moveIndex = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= orderedKeys.length ||
      toIdx >= orderedKeys.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const next = [...orderedKeys];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next);
  };

  const handleDropOnKey = (targetKey: string) => {
    if (!draggingKey || draggingKey === targetKey) {
      setDraggingKey(null);
      setDragOverKey(null);
      return;
    }
    const fromIdx = orderedKeys.findIndex(
      (k) => canonicalSpecAttributeKey(k) === canonicalSpecAttributeKey(draggingKey)
    );
    const toIdx = orderedKeys.findIndex(
      (k) => canonicalSpecAttributeKey(k) === canonicalSpecAttributeKey(targetKey)
    );
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      moveIndex(fromIdx, toIdx);
    }
    setDraggingKey(null);
    setDragOverKey(null);
  };

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white divide-y divide-slate-100 overflow-hidden">
      {items.map((item, idx) => {
        const isCore = isCoreSpecAttributeKey(item.key);
        const isDragging = draggingKey === item.key;
        const isDragOver = dragOverKey === item.key && draggingKey !== item.key;
        const effectiveActive = item.isVisible && !item.globallyHidden;

        return (
          <div
            key={`${canonicalSpecAttributeKey(item.key)}_${idx}`}
            draggable
            onDragStart={(e) => {
              setDraggingKey(item.key);
              e.dataTransfer.effectAllowed = 'move';
              try {
                e.dataTransfer.setData('text/plain', item.key);
              } catch {
                // Ignore restricted clipboard environments
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverKey !== item.key) {
                setDragOverKey(item.key);
              }
            }}
            onDragLeave={() => {
              if (dragOverKey === item.key) {
                setDragOverKey(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnKey(item.key);
            }}
            onDragEnd={() => {
              setDraggingKey(null);
              setDragOverKey(null);
            }}
            className={`group flex items-center gap-1.5 transition-colors select-none ${
              compact ? 'px-2 py-1.5' : 'px-2.5 py-1.5'
            } ${
              isDragging
                ? 'opacity-45 bg-indigo-50/70'
                : isDragOver
                ? 'bg-indigo-50/90 ring-1 ring-inset ring-indigo-400'
                : effectiveActive
                ? 'bg-white hover:bg-slate-50/90'
                : 'bg-slate-50/60 hover:bg-slate-100/70'
            }`}
          >
            {/* Drag Handle */}
            <span
              className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-500 transition-colors"
              title="Drag to reorder"
              aria-hidden="true"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>

            {/* Visibility Checkbox + Label */}
            <button
              type="button"
              onClick={() => onToggleVisibility(item.key)}
              disabled={item.globallyHidden}
              title={
                item.globallyHidden
                  ? `${item.key} is hidden globally in Specs & Grid`
                  : item.isVisible
                  ? `Hide ${item.key}`
                  : `Show ${item.key}`
              }
              className={`flex-1 min-w-0 flex items-center gap-1.5 text-left ${
                item.globallyHidden ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                  effectiveActive
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-slate-300 text-transparent'
                }`}
              >
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </span>

              <span className="min-w-0 flex-1 flex items-center gap-1.5">
                <span
                  className={`truncate text-[11px] leading-tight ${
                    effectiveActive
                      ? 'font-semibold text-slate-800'
                      : 'font-medium text-slate-400 line-through'
                  }`}
                >
                  {item.key}
                </span>

                {isCore && (
                  <span className="shrink-0 px-1 py-0.25 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200/80">
                    Core
                  </span>
                )}

                {item.globallyHidden && (
                  <span className="shrink-0 px-1 py-0.25 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Global Off
                  </span>
                )}

                {!item.globallyHidden && item.valuePreview && (
                  <span className="truncate text-[10px] text-slate-400 font-normal max-w-[92px]">
                    {item.valuePreview}
                  </span>
                )}
              </span>
            </button>

            {/* Right-aligned layout & precision reorder controls */}
            <div className="shrink-0 flex items-center gap-1">
              {/* Width Span Toggle: 50% vs 100% */}
              <button
                type="button"
                disabled={!effectiveActive}
                onClick={() => onToggleFullWidth(item.key)}
                title={
                  item.isFullWidth
                    ? 'Full-width row (100%). Click to switch to 2-column (50%).'
                    : 'Half-width column (50%). Click to stretch full-width (100%).'
                }
                className={`h-5 px-1.5 rounded text-[9.5px] font-bold tabular-nums border transition-colors ${
                  !effectiveActive
                    ? 'opacity-35 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400'
                    : item.isFullWidth
                    ? 'bg-sky-600 border-sky-600 text-white hover:bg-sky-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50'
                }`}
              >
                {item.isFullWidth ? '100%' : '50%'}
              </button>

              {/* Line Break Toggle (↵) */}
              <button
                type="button"
                disabled={!effectiveActive || item.isFullWidth}
                onClick={() => onToggleBreakAfter(item.key)}
                title={
                  item.isFullWidth
                    ? 'Full-width attributes automatically start and end their own row'
                    : item.hasBreakAfter
                    ? 'Line break active after this attribute (click to remove)'
                    : 'Force next attribute onto a new line (↵)'
                }
                className={`h-5 w-5 rounded flex items-center justify-center border transition-colors ${
                  !effectiveActive || item.isFullWidth
                    ? 'opacity-30 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400'
                    : item.hasBreakAfter
                    ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50'
                }`}
              >
                <CornerDownLeft className="w-2.5 h-2.5" />
              </button>

              {/* Precision Up / Down Reorder */}
              <div className="flex items-center rounded border border-slate-200 bg-slate-50/80 overflow-hidden">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveIndex(idx, idx - 1)}
                  title="Move up"
                  className="h-5 w-4.5 flex items-center justify-center text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                >
                  <ArrowUp className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => moveIndex(idx, idx + 1)}
                  title="Move down"
                  className="h-5 w-4.5 flex items-center justify-center border-l border-slate-200 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                >
                  <ArrowDown className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
