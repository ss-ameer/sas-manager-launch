import React, { useState } from 'react';

interface CustomLabelSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export const PHONE_LABEL_DEFAULT_OPTIONS = [
  'Main',
  'Direct Line',
  'Mobile',
  'Reception',
  'Landline',
  'WhatsApp',
  'Support',
  'Billing',
  'Sales Desk',
  'Engineering Dept',
  'Fax'
];

export const EMAIL_LABEL_DEFAULT_OPTIONS = [
  'Main',
  'Direct',
  'Work',
  'Personal',
  'Info',
  'Sales',
  'Support',
  'Billing',
  'Inquiries'
];

export function CustomLabelSelect({
  value,
  onChange,
  options,
  placeholder = 'Custom Tag...',
  className = ''
}: CustomLabelSelectProps) {
  const isStandardOption = options.includes(value);
  const [isCustomMode, setIsCustomMode] = useState(!isStandardOption && value !== '');

  const isCustom = isCustomMode || (!isStandardOption && value !== '');

  if (isCustom) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:border-amber-500 focus:outline-none font-medium"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setIsCustomMode(false);
            if (!options.includes(value)) {
              onChange(options[0] || 'Main');
            }
          }}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 px-1.5 py-1 rounded bg-slate-800 border border-slate-700 shrink-0 cursor-pointer"
          title="Switch back to predefined options"
        >
          Select
        </button>
      </div>
    );
  }

  return (
    <select
      value={isStandardOption ? value : (options[0] || 'Main')}
      onChange={(e) => {
        if (e.target.value === '__OTHER_CUSTOM__') {
          setIsCustomMode(true);
          onChange('');
        } else {
          setIsCustomMode(false);
          onChange(e.target.value);
        }
      }}
      className={`px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-semibold focus:border-amber-500 focus:outline-none ${className}`}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      <option value="__OTHER_CUSTOM__">Custom / Other...</option>
    </select>
  );
}

export default CustomLabelSelect;
