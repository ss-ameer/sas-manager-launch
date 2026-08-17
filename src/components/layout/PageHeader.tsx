import React, { useRef, useEffect } from 'react';
import { LucideIcon, Menu } from 'lucide-react';
import { UserProfile } from '../../types';
import { isSuperAdmin } from '../../utils/permissions';

export interface PageHeaderBadge {
  text: string;
  variant?: 'blue' | 'green' | 'amber';
}

export interface PageHeaderAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'outline' | 'ghost';
}

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  badge?: PageHeaderBadge;
  primaryAction?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
  secondaryActions?: Array<PageHeaderAction>;
  className?: string;
  children?: React.ReactNode;
  currentUser?: UserProfile | null;
  onOpenSuperAdminConsole?: () => void;
  onOpenSidebar?: () => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  primaryAction,
  secondaryActions,
  className = '',
  children,
  currentUser,
  onOpenSuperAdminConsole,
  onOpenSidebar
}) => {
  const clicksRef = useRef<number[]>([]);

  const checkAndOpenGodMode = () => {
    if (isSuperAdmin(currentUser)) {
      if (onOpenSuperAdminConsole) {
        onOpenSuperAdminConsole();
      }
      window.dispatchEvent(new CustomEvent('open-super-admin-console'));
    } else {
      console.warn('Super Admin trigger activated, but user lacks Super Admin privileges.');
      alert('Access Denied: Super Admin privileges required for God Mode Console.');
    }
  };

  const handleTitleClick = () => {
    const now = Date.now();
    const recent = [...clicksRef.current.filter((t) => now - t <= 3000), now];
    clicksRef.current = recent;
    if (recent.length >= 5) {
      clicksRef.current = [];
      checkAndOpenGodMode();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        checkAndOpenGodMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser, onOpenSuperAdminConsole]);

  const badgeClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    green: 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  };

  return (
    <div className={`sticky top-0 z-20 w-full px-6 py-5 lg:px-8 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs ${className}`}>
      <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Info Column with Mobile Hamburger & Secret 5-click trigger */}
        <div className="flex items-center space-x-3.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (onOpenSidebar) onOpenSidebar();
              else window.dispatchEvent(new CustomEvent('open-mobile-sidebar'));
            }}
            className="md:hidden p-2 -ml-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
            title="Open Navigation Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={handleTitleClick}
            title="Secret Trigger: Click 5 times or press Ctrl+Shift+Alt+G for God Mode Console"
            className="flex items-start sm:items-center space-x-3.5 min-w-0 cursor-pointer select-none group flex-1"
          >
            {Icon && (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 rounded-xl text-blue-600 dark:text-blue-400 shrink-0 shadow-2xs group-hover:border-purple-500/50 transition">
                <Icon className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white dark:font-extrabold tracking-tight truncate group-hover:text-purple-400 transition">
                  {title}
                </h1>
                {badge && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      badgeClasses[badge.variant || 'blue']
                    }`}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
                {subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right Action Bar Column */}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0) || children) && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
            {secondaryActions?.map((act, index) => {
              const SecIcon = act.icon;
              const isGhost = act.variant === 'ghost';
              return (
                <button
                  key={index}
                  type="button"
                  onClick={act.onClick}
                  className={
                    isGhost
                      ? 'px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1.5'
                      : 'px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-2xs rounded-xl transition cursor-pointer flex items-center gap-1.5'
                  }
                >
                  {SecIcon && <SecIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                  <span>{act.label}</span>
                </button>
              );
            })}

            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2 border border-blue-500/20 active:scale-[0.98]"
              >
                {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
                <span>{primaryAction.label}</span>
              </button>
            )}

            {children}
          </div>
        )}
      </div>
    </div>
  );
};
