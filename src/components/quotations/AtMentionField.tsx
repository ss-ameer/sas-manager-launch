import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AtSign, AlertTriangle } from 'lucide-react';
import {
  QUOTATION_AT_TAGS,
  QuotationAtTagCategory,
  QuotationAtTagDefinition,
  QuotationTokenContext,
  buildQuotationTokenMap,
  isFieldOmitted,
  findUnknownAtTokens
} from '../../utils/quotationTokenResolver';

const CATEGORY_ORDER: QuotationAtTagCategory[] = [
  'Dates',
  'Client & Project',
  'Our Company & Quote',
  'Commercial, Bank & Totals'
];

interface TriggerState {
  isOpen: boolean;
  query: string;
  triggerIndex: number; // index of '@' in value
  cursorIndex: number;
}

function detectAtTrigger(text: string, selectionStart: number | null): TriggerState {
  if (selectionStart === null || selectionStart < 1) {
    return { isOpen: false, query: '', triggerIndex: -1, cursorIndex: 0 };
  }
  const beforeCursor = text.slice(0, selectionStart);
  // Look backwards from cursor for the nearest '@' that is at index 0 or preceded by whitespace or opening punctuation
  const match = /(?:^|[\s(\[{"'‘“])@([a-zA-Z0-9_]*)$/.exec(beforeCursor);
  if (!match) {
    return { isOpen: false, query: '', triggerIndex: -1, cursorIndex: selectionStart };
  }
  const query = match[1] || '';
  const atPos = selectionStart - query.length - 1;
  return {
    isOpen: true,
    query: query.toLowerCase(),
    triggerIndex: atPos,
    cursorIndex: selectionStart
  };
}

export function toggleInlineSelectionWrap(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  currentValue: string,
  onChange: (newVal: string) => void,
  marker: '**' | '*' | '__'
): boolean {
  if (!el) return false;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (start === null || end === null || start >= end) {
    return false;
  }

  const raw = String(currentValue ?? '');
  const selected = raw.slice(start, end);
  const mLen = marker.length;

  // Case 1: Selected text itself starts and ends with marker
  if (
    selected.length >= mLen * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const unwrapped = selected.slice(mLen, selected.length - mLen);
    const nextVal = `${raw.slice(0, start)}${unwrapped}${raw.slice(end)}`;
    onChange(nextVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + unwrapped.length);
    });
    return true;
  }

  // Case 2: Surrounding characters immediately outside selection match marker
  if (
    start >= mLen &&
    raw.slice(start - mLen, start) === marker &&
    raw.slice(end, end + mLen) === marker
  ) {
    const nextVal = `${raw.slice(0, start - mLen)}${selected}${raw.slice(end + mLen)}`;
    onChange(nextVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start - mLen, end - mLen);
    });
    return true;
  }

  // Case 3: Wrap selected text with marker
  const wrapped = `${marker}${selected}${marker}`;
  const nextVal = `${raw.slice(0, start)}${wrapped}${raw.slice(end)}`;
  onChange(nextVal);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + mLen, end + mLen);
  });
  return true;
}

export interface AtMentionInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (newValue: string) => void;
  tokenContext: QuotationTokenContext;
  showQuickAtButton?: boolean;
  compact?: boolean;
  inputRefProp?: (el: HTMLInputElement | null) => void;
}

export const AtMentionInput: React.FC<AtMentionInputProps> = ({
  value,
  onChange,
  tokenContext,
  showQuickAtButton = true,
  compact: _compact,
  inputRefProp,
  className = '',
  onKeyDown,
  onBlur,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [trigger, setTrigger] = useState<TriggerState>({
    isOpen: false,
    query: '',
    triggerIndex: -1,
    cursorIndex: 0
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const tokenMap = useMemo(() => buildQuotationTokenMap(tokenContext), [tokenContext]);
  const omitted = tokenContext.omittedFields ?? tokenContext.quotation?.omitted_fields;

  const filteredTags = useMemo(() => {
    if (!trigger.isOpen) return [];
    const q = trigger.query.trim().toLowerCase();
    if (!q) return QUOTATION_AT_TAGS;
    return QUOTATION_AT_TAGS.filter(
      (item) =>
        item.key.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (tokenMap[item.key] || '').toLowerCase().includes(q)
    );
  }, [trigger.isOpen, trigger.query, tokenMap]);

  const unknownTokens = useMemo(() => findUnknownAtTokens(value), [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger.query, trigger.isOpen]);

  useEffect(() => {
    if (!trigger.isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setTrigger((prev) => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [trigger.isOpen]);

  const insertTag = (tagDef: QuotationAtTagDefinition) => {
    const raw = String(value ?? '');
    if (trigger.triggerIndex >= 0 && trigger.cursorIndex >= trigger.triggerIndex) {
      const before = raw.slice(0, trigger.triggerIndex);
      const after = raw.slice(trigger.cursorIndex);
      const needsSpace = after.length > 0 && !/^[\s.,;:!?)}\]'"”]/.test(after);
      const inserted = `${tagDef.tag}${needsSpace ? ' ' : ''}`;
      const nextVal = `${before}${inserted}${after}`;
      onChange(nextVal);
      setTrigger({ isOpen: false, query: '', triggerIndex: -1, cursorIndex: 0 });
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const nextCursor = before.length + inserted.length;
          inputRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
    } else {
      const sep = raw.length > 0 && !/\s$/.test(raw) ? ' ' : '';
      const nextVal = `${raw}${sep}${tagDef.tag}`;
      onChange(nextVal);
      setTrigger({ isOpen: false, query: '', triggerIndex: -1, cursorIndex: 0 });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleOpenPickerButton = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = String(value ?? '');
    if (trigger.isOpen) {
      setTrigger((prev) => ({ ...prev, isOpen: false }));
      return;
    }
    const cursor = inputRef.current?.selectionStart ?? raw.length;
    const before = raw.slice(0, cursor);
    const after = raw.slice(cursor);
    const needSpace = before.length > 0 && !/[\s(\[{"']$/.test(before);
    const prefix = needSpace ? ' @' : '@';
    const nextVal = `${before}${prefix}${after}`;
    const newAtPos = before.length + (needSpace ? 1 : 0);
    const newCursor = newAtPos + 1;
    onChange(nextVal);
    setTrigger({
      isOpen: true,
      query: '',
      triggerIndex: newAtPos,
      cursorIndex: newCursor
    });
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  return (
    <div className="relative w-full">
      <div className="relative flex items-center w-full">
        <input
          {...rest}
          ref={(el) => {
            inputRef.current = el;
            inputRefProp?.(el);
          }}
          type="text"
          value={value ?? ''}
          onChange={(e) => {
            const nextVal = e.target.value;
            const sel = e.target.selectionStart;
            onChange(nextVal);
            setTrigger(detectAtTrigger(nextVal, sel));
          }}
          onClick={(e) => {
            const sel = (e.target as HTMLInputElement).selectionStart;
            const det = detectAtTrigger(String(value ?? ''), sel);
            if (det.isOpen) setTrigger(det);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
              const k = e.key.toLowerCase();
              if (k === 'b' || k === 'i' || k === 'u') {
                const marker = k === 'b' ? '**' : k === 'i' ? '*' : '__';
                if (toggleInlineSelectionWrap(inputRef.current, value, onChange, marker)) {
                  e.preventDefault();
                  return;
                }
              }
            }
            if (trigger.isOpen && filteredTags.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) => (prev + 1) % filteredTags.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) => (prev - 1 + filteredTags.length) % filteredTags.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const chosen = filteredTags[activeIndex] || filteredTags[0];
                if (chosen) insertTag(chosen);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setTrigger((prev) => ({ ...prev, isOpen: false }));
                return;
              }
            }
            onKeyDown?.(e);
          }}
          onBlur={(e) => {
            onBlur?.(e);
          }}
          className={`${className} ${showQuickAtButton ? 'pr-6' : ''}`}
        />
        {showQuickAtButton && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleOpenPickerButton}
            title="Insert @ data tag (or type @ anywhere)"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
          >
            <AtSign className="w-3 h-3" />
          </button>
        )}
      </div>

      {unknownTokens.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[9.5px] text-rose-600 font-medium">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            Unrecognized tag: <code className="font-mono font-bold">{unknownTokens.join(', ')}</code> (type{' '}
            <code className="font-mono">@</code> to pick a valid field)
          </span>
        </div>
      )}

      {trigger.isOpen && (
        <AtTagFloatingDropdown
          menuRef={menuRef}
          filteredTags={filteredTags}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          onSelectTag={insertTag}
          tokenMap={tokenMap}
          omitted={omitted}
          query={trigger.query}
        />
      )}
    </div>
  );
};

export interface AtMentionTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (newValue: string) => void;
  tokenContext: QuotationTokenContext;
  showInsertBar?: boolean;
  compact?: boolean;
  textareaRefProp?: (el: HTMLTextAreaElement | null) => void;
}

export const AtMentionTextarea: React.FC<AtMentionTextareaProps> = ({
  value,
  onChange,
  tokenContext,
  showInsertBar = true,
  compact: _compact,
  textareaRefProp,
  className = '',
  onKeyDown,
  onBlur,
  ...rest
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [trigger, setTrigger] = useState<TriggerState>({
    isOpen: false,
    query: '',
    triggerIndex: -1,
    cursorIndex: 0
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const tokenMap = useMemo(() => buildQuotationTokenMap(tokenContext), [tokenContext]);
  const omitted = tokenContext.omittedFields ?? tokenContext.quotation?.omitted_fields;

  const filteredTags = useMemo(() => {
    if (!trigger.isOpen) return [];
    const q = trigger.query.trim().toLowerCase();
    if (!q) return QUOTATION_AT_TAGS;
    return QUOTATION_AT_TAGS.filter(
      (item) =>
        item.key.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (tokenMap[item.key] || '').toLowerCase().includes(q)
    );
  }, [trigger.isOpen, trigger.query, tokenMap]);

  const unknownTokens = useMemo(() => findUnknownAtTokens(value), [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger.query, trigger.isOpen]);

  useEffect(() => {
    if (!trigger.isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setTrigger((prev) => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [trigger.isOpen]);

  const insertTag = (tagDef: QuotationAtTagDefinition) => {
    const raw = String(value ?? '');
    if (trigger.triggerIndex >= 0 && trigger.cursorIndex >= trigger.triggerIndex) {
      const before = raw.slice(0, trigger.triggerIndex);
      const after = raw.slice(trigger.cursorIndex);
      const needsSpace = after.length > 0 && !/^[\s.,;:!?)}\]'"”]/.test(after);
      const inserted = `${tagDef.tag}${needsSpace ? ' ' : ''}`;
      const nextVal = `${before}${inserted}${after}`;
      onChange(nextVal);
      setTrigger({ isOpen: false, query: '', triggerIndex: -1, cursorIndex: 0 });
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const nextCursor = before.length + inserted.length;
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
    } else {
      const sep = raw.length > 0 && !/\s$/.test(raw) ? ' ' : '';
      const nextVal = `${raw}${sep}${tagDef.tag}`;
      onChange(nextVal);
      setTrigger({ isOpen: false, query: '', triggerIndex: -1, cursorIndex: 0 });
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleOpenPickerButton = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = String(value ?? '');
    if (trigger.isOpen) {
      setTrigger((prev) => ({ ...prev, isOpen: false }));
      return;
    }
    const cursor = textareaRef.current?.selectionStart ?? raw.length;
    const before = raw.slice(0, cursor);
    const after = raw.slice(cursor);
    const needSpace = before.length > 0 && !/[\s(\[{"']$/.test(before);
    const prefix = needSpace ? ' @' : '@';
    const nextVal = `${before}${prefix}${after}`;
    const newAtPos = before.length + (needSpace ? 1 : 0);
    const newCursor = newAtPos + 1;
    onChange(nextVal);
    setTrigger({
      isOpen: true,
      query: '',
      triggerIndex: newAtPos,
      cursorIndex: newCursor
    });
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  return (
    <div className="relative w-full">
      <textarea
        {...rest}
        ref={(el) => {
          textareaRef.current = el;
          textareaRefProp?.(el);
        }}
        value={value ?? ''}
        onChange={(e) => {
          const nextVal = e.target.value;
          const sel = e.target.selectionStart;
          onChange(nextVal);
          setTrigger(detectAtTrigger(nextVal, sel));
        }}
        onClick={(e) => {
          const sel = (e.target as HTMLTextAreaElement).selectionStart;
          const det = detectAtTrigger(String(value ?? ''), sel);
          if (det.isOpen) setTrigger(det);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const k = e.key.toLowerCase();
            if (k === 'b' || k === 'i' || k === 'u') {
              const marker = k === 'b' ? '**' : k === 'i' ? '*' : '__';
              if (toggleInlineSelectionWrap(textareaRef.current, value, onChange, marker)) {
                e.preventDefault();
                return;
              }
            }
          }
          if (trigger.isOpen && filteredTags.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % filteredTags.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => (prev - 1 + filteredTags.length) % filteredTags.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const chosen = filteredTags[activeIndex] || filteredTags[0];
              if (chosen) insertTag(chosen);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setTrigger((prev) => ({ ...prev, isOpen: false }));
              return;
            }
          }
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          onBlur?.(e);
        }}
        className={className}
      />

      {showInsertBar && (
        <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[9.5px] text-slate-400">
            Type <code className="font-mono font-bold text-blue-600">@</code> anywhere to insert live deal, client, or bank data
          </span>
          <button
            type="button"
            onClick={handleOpenPickerButton}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-[10px] font-semibold transition cursor-pointer"
          >
            <AtSign className="w-3 h-3" />
            <span>+ Insert @Tag</span>
          </button>
        </div>
      )}

      {unknownTokens.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[9.5px] text-rose-600 font-medium bg-rose-50/80 border border-rose-200 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            Unrecognized @tag: <code className="font-mono font-bold">{unknownTokens.join(', ')}</code> — will highlight in preview and warn before PDF print.
          </span>
        </div>
      )}

      {trigger.isOpen && (
        <AtTagFloatingDropdown
          menuRef={menuRef}
          filteredTags={filteredTags}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          onSelectTag={insertTag}
          tokenMap={tokenMap}
          omitted={omitted}
          query={trigger.query}
        />
      )}
    </div>
  );
};

interface AtTagFloatingDropdownProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  filteredTags: QuotationAtTagDefinition[];
  activeIndex: number;
  setActiveIndex: (idx: number) => void;
  onSelectTag: (tag: QuotationAtTagDefinition) => void;
  tokenMap: Record<string, string>;
  omitted?: Record<string, boolean> | null;
  query: string;
}

const AtTagFloatingDropdown: React.FC<AtTagFloatingDropdownProps> = ({
  menuRef,
  filteredTags,
  activeIndex,
  setActiveIndex,
  onSelectTag,
  tokenMap,
  omitted,
  query
}) => {
  return (
    <div
      ref={menuRef}
      className="absolute left-0 right-0 top-full mt-1 z-[70] bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto text-xs animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="sticky top-0 z-10 px-3 py-1.5 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
          <AtSign className="w-3 h-3 text-blue-600" />
          <span>Live @ Data Tags {query ? `• "${query}"` : ''}</span>
        </span>
        <span className="text-[9.5px] text-slate-400 font-mono">↑↓ Navigate • Enter</span>
      </div>

      {filteredTags.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-slate-500">
          No matching <code className="font-mono text-rose-600">@{query}</code> tag found.
        </div>
      ) : (
        <div className="p-1.5 space-y-2">
          {CATEGORY_ORDER.map((category) => {
            const groupItems = filteredTags.filter((t) => t.category === category);
            if (groupItems.length === 0) return null;
            return (
              <div key={category} className="space-y-0.5">
                <div className="px-2 py-0.5 text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  {category}
                </div>
                {groupItems.map((item) => {
                  const globalIdx = filteredTags.findIndex((f) => f.key === item.key);
                  const isSelected = globalIdx === activeIndex;
                  const isOmitted = isFieldOmitted(item.key, omitted);
                  const rawVal = tokenMap[item.key] || '';
                  const displayVal = isOmitted
                    ? '— (Omitted)'
                    : rawVal
                    ? rawVal
                    : '— (Empty)';

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectTag(item);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <code
                          className={`font-mono font-bold text-[10.5px] shrink-0 px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-blue-700 text-white'
                              : 'bg-blue-50 text-blue-700 border border-blue-200/70'
                          }`}
                        >
                          {item.tag}
                        </code>
                        <span
                          className={`text-[10.5px] truncate ${
                            isSelected ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono truncate max-w-[140px] shrink-0 ${
                          isSelected
                            ? 'text-white font-semibold'
                            : isOmitted || !rawVal
                            ? 'text-slate-400 italic'
                            : 'text-slate-700 font-medium'
                        }`}
                      >
                        {displayVal}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
