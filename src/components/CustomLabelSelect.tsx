import React, { useId } from 'react';

interface CustomLabelSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export const PHONE_LABEL_DEFAULT_OPTIONS = [
  'Mobile',
  'Work',
  'Main',
  'Direct',
  'WhatsApp',
  'Direct Line',
  'Reception',
  'Landline',
  'Support',
  'Billing',
  'Sales Desk',
  'Engineering Dept',
  'Fax'
];

export const EMAIL_LABEL_DEFAULT_OPTIONS = [
  'Work',
  'Personal',
  'Billing / Accounts',
  'Inquiries',
  'Main',
  'Direct',
  'Info',
  'Sales',
  'Support'
];

export function CustomLabelSelect({
  value,
  onChange,
  options,
  placeholder = 'Custom Tag...',
  className = ''
}: CustomLabelSelectProps) {
  const listId = useId();

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 text-xs rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-medium ${className}`}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
}

export default CustomLabelSelect;
