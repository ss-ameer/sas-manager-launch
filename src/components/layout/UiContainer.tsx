import React from 'react';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps, PageHeaderBadge, PageHeaderAction } from './PageHeader';

/**
 * Standardized Page Body wrapper.
 * Provides consistent outer margins, maximum container width, and inner vertical spacing.
 */
interface PageBodyProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

export const PageBody: React.FC<PageBodyProps> = ({
  children,
  className = '',
  maxWidth = 'max-w-[1600px]',
}) => {
  return (
    <div className={`shrink-0 p-4 sm:p-6 lg:p-8 space-y-6 ${maxWidth} mx-auto w-full ${className}`}>
      {children}
    </div>
  );
};

/**
 * Standardized Card / Panel wrapper for cards and dashboard widgets.
 * Standardizes border radius (rounded-2xl), borders (border-slate-200/80), shadow, and internal padding.
 */
interface CardPanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'compact' | 'normal' | 'spacious';
}

export const CardPanel: React.FC<CardPanelProps> = ({
  children,
  className = '',
  padding = 'normal',
}) => {
  const paddingClasses = {
    none: '',
    compact: 'p-4 sm:p-5',
    normal: 'p-6 lg:p-7',
    spacious: 'p-6 lg:p-8',
  };

  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl shadow-xs transition-all duration-200 ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
};

export type KpiStatTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'indigo';

export interface KpiStatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: KpiStatTone;
  onClick?: () => void;
  active?: boolean;
  compact?: boolean;
  className?: string;
}

const KPI_ICON_TONE_CLASSES: Record<KpiStatTone, string> = {
  slate: 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/70',
  blue: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60',
  amber: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60',
  rose: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60',
  purple: 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60',
};

const KPI_ACTIVE_TONE_CLASSES: Record<KpiStatTone, string> = {
  slate: 'ring-2 ring-slate-500/20 border-slate-400 dark:border-slate-500',
  blue: 'ring-2 ring-blue-500/20 border-blue-400 dark:border-blue-500',
  emerald: 'ring-2 ring-emerald-500/20 border-emerald-400 dark:border-emerald-500',
  amber: 'ring-2 ring-amber-500/20 border-amber-400 dark:border-amber-500',
  rose: 'ring-2 ring-rose-500/20 border-rose-400 dark:border-rose-500',
  purple: 'ring-2 ring-purple-500/20 border-purple-400 dark:border-purple-500',
  indigo: 'ring-2 ring-indigo-500/20 border-indigo-400 dark:border-indigo-500',
};

/**
 * Standardized KPI Stat Card primitive for uniform metrics across all modules.
 */
export const KpiStatCard: React.FC<KpiStatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  tone = 'slate',
  onClick,
  active = false,
  compact = false,
  className = '',
}) => {
  const interactiveClasses = onClick ? 'cursor-pointer active:scale-[0.99]' : '';
  const activeClasses = active ? KPI_ACTIVE_TONE_CLASSES[tone] : '';

  const content = (
    <>
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="min-w-0 flex-1">
          <div
            className={`${
              compact ? 'text-[10.5px]' : 'text-[11px]'
            } font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate`}
          >
            {label}
          </div>
          <div
            className={`${
              compact ? 'text-lg sm:text-[19px] leading-tight mt-0.5' : 'text-xl sm:text-2xl mt-0.5'
            } font-bold font-mono tracking-tight tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap truncate`}
          >
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={`${
              compact ? 'p-1.5 rounded-lg' : 'p-2 rounded-xl'
            } flex items-center justify-center shrink-0 ${KPI_ICON_TONE_CLASSES[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
      {subtext && (
        <div
          className={`${
            compact ? 'mt-1 text-[11px]' : 'mt-1.5 text-xs'
          } text-slate-500 dark:text-slate-400 font-medium truncate`}
        >
          {subtext}
        </div>
      )}
    </>
  );

  const wrapperClasses = `bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 ${
    compact ? 'rounded-xl px-3.5 py-2.5' : 'rounded-2xl px-4 py-3.5'
  } shadow-2xs hover:shadow-sm transition-all text-left flex flex-col justify-between ${interactiveClasses} ${activeClasses} ${className}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={wrapperClasses}>
        {content}
      </button>
    );
  }

  return <div className={wrapperClasses}>{content}</div>;
};

/**
 * Standardized Modal Content Container.
 * Ensures consistent inner padding, rounded borders, and scroll overflow logic for modals across the system.
 */
interface ModalContentContainerProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'normal' | 'compact' | 'spacious';
}

export const ModalContentContainer: React.FC<ModalContentContainerProps> = ({
  children,
  className = '',
  padding = 'normal',
}) => {
  const paddingClasses = {
    compact: 'p-5 lg:p-6',
    normal: 'p-6 lg:p-8',
    spacious: 'p-8 lg:p-10',
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
};
