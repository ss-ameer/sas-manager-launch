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
  maxWidth = 'max-w-7xl',
}) => {
  return (
    <div className={`p-6 lg:p-8 space-y-6 ${maxWidth} mx-auto w-full ${className}`}>
      {children}
    </div>
  );
};

/**
 * Standardized Card / Panel wrapper for cards and dashboard widgets.
 * Standardizes border radius (rounded-xl), borders (border-slate-200/80), shadow, and internal padding.
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
      className={`bg-white border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
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
      className={`bg-white rounded-2xl border border-slate-200 shadow-2xl ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
};
