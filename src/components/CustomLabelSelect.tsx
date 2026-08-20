import React, { useId } from 'react';

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
  const listId = useId();

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:border-amber-500 focus:outline-none font-medium ${className}`}
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
