import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface FieldHelpHintProps {
  hint: string;
  align?: 'left' | 'center' | 'right';
  placement?: 'bottom' | 'top';
}

export const FieldHelpHint: React.FC<FieldHelpHintProps> = ({
  hint,
  align = 'left',
  placement = 'bottom'
}) => {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pinned]);

  const isOpen = pinned || hovered;

  const alignmentClasses =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  const placementClasses =
    placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-1.5';

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((prev) => !prev);
        }}
        aria-label="Field information"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors cursor-pointer focus:outline-none ${
          isOpen
            ? 'text-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20'
            : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
        }`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <span
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${placementClasses} ${alignmentClasses} z-[80] w-64 p-2.5 rounded-xl bg-slate-900 text-white text-[11px] font-normal leading-relaxed shadow-xl border border-slate-700 pointer-events-auto`}
        >
          {hint}
        </span>
      )}
    </span>
  );
};

interface FieldLabelProps {
  label: React.ReactNode;
  required?: boolean;
  hint?: string;
  hintAlign?: 'left' | 'center' | 'right';
  hintPlacement?: 'bottom' | 'top';
  className?: string;
}

export const FieldLabel: React.FC<FieldLabelProps> = ({
  label,
  required,
  hint,
  hintAlign = 'left',
  hintPlacement = 'bottom',
  className = ''
}) => {
  return (
    <div
      className={`flex items-center gap-1.5 min-h-[20px] mb-1.5 text-xs font-bold text-slate-700 leading-tight ${className}`}
    >
      <span className="truncate">{label}</span>
      {required && <span className="text-rose-500 font-bold shrink-0">*</span>}
      {hint && <FieldHelpHint hint={hint} align={hintAlign} placement={hintPlacement} />}
    </div>
  );
};

export default FieldHelpHint;
