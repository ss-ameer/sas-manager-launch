import React from 'react';
import { Search } from 'lucide-react';

export interface GoogleSearchButtonProps {
  companyName: string;
  location?: string;
  className?: string;
  size?: 'sm' | 'xs';
}

export const GoogleSearchButton: React.FC<GoogleSearchButtonProps> = ({
  companyName,
  location,
  className = '',
  size = 'xs'
}) => {
  if (!companyName || !companyName.trim()) return null;

  const searchQuery = (companyName.trim() + (location?.trim() ? ` ${location.trim()}` : '')).trim();
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  const tooltipText = `Search "${companyName.trim()}" on Google`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  const isXs = size === 'xs';

  return (
    <button
      type="button"
      id={`google-search-${companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`}
      onClick={handleClick}
      title={tooltipText}
      aria-label={tooltipText}
      className={`group inline-flex items-center justify-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 shadow-xs transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95 shrink-0 ${
        isXs ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      } ${className}`}
    >
      <span className="font-black text-[10px] leading-none text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400 font-sans select-none">
        G
      </span>
      <Search className={`${isXs ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-slate-400 group-hover:text-blue-500 dark:text-slate-500 dark:group-hover:text-blue-400 transition-colors`} />
    </button>
  );
};

export default GoogleSearchButton;
