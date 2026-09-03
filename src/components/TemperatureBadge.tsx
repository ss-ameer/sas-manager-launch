import React, { useState, useEffect } from 'react';
import { Flame, Sun, Snowflake, AlertTriangle } from 'lucide-react';
import { Company } from '../types';
import {
  getTemperatureDisplay,
  cycleCompanyTemperature,
  StandardTemperature
} from '../utils/temperatureCycle';

export interface TemperatureBadgeProps {
  companyId?: string;
  temperature?: string;
  isDnc?: boolean;
  variant?: 'pill' | 'icon' | 'compact';
  size?: 'sm' | 'md' | 'lg';
  companies?: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  onTemperatureChange?: (nextTemp: StandardTemperature) => void;
  className?: string;
  disabled?: boolean;
  showDncWarning?: boolean;
}

export default function TemperatureBadge({
  companyId,
  temperature: initialTemp = 'Cold',
  isDnc: initialDnc = false,
  variant = 'pill',
  size = 'md',
  companies,
  setCompanies,
  onTemperatureChange,
  className = '',
  disabled = false,
  showDncWarning = true
}: TemperatureBadgeProps) {
  // Find live company if available in companies prop
  const liveCompany = companyId && companies ? companies.find((c) => c.id === companyId) : null;
  const effectiveTemp = liveCompany ? (liveCompany.temperature || 'Cold') : initialTemp;
  const effectiveDnc = liveCompany ? Boolean(liveCompany.is_dnc || liveCompany.dnc || liveCompany.temperature === 'DNC') : initialDnc;

  // Local optimistic state
  const [localTemp, setLocalTemp] = useState<string>(effectiveTemp);
  const [localDnc, setLocalDnc] = useState<boolean>(effectiveDnc);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    setLocalTemp(effectiveTemp);
    setLocalDnc(effectiveDnc);
  }, [effectiveTemp, effectiveDnc]);

  const display = getTemperatureDisplay(localTemp, localDnc);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!companyId || disabled || isUpdating) return;

    const next = display.next;
    setLocalTemp(next);
    setLocalDnc(false);
    setIsUpdating(true);

    if (onTemperatureChange) {
      onTemperatureChange(next);
    }

    try {
      await cycleCompanyTemperature(companyId, localTemp, localDnc, {
        companies,
        setCompanies,
        onOptimisticUpdate: (t) => {
          setLocalTemp(t);
          setLocalDnc(false);
        }
      });
    } catch (err) {
      console.error('[TemperatureBadge] Failed to cycle temperature:', err);
      // Revert if error
      setLocalTemp(effectiveTemp);
      setLocalDnc(effectiveDnc);
    } finally {
      setIsUpdating(false);
    }
  };

  const isInteractive = Boolean(companyId && !disabled);
  const interactiveClasses = isInteractive
    ? 'cursor-pointer hover:scale-110 active:scale-95 transition-transform duration-150 select-none'
    : 'cursor-default opacity-80';

  const tooltip = isInteractive
    ? display.tooltip
    : `Temperature: ${display.normalized}`;

  // 1. Icon Variant (for visual metadata cluster or table icon)
  if (variant === 'icon') {
    let IconComp = Snowflake;
    if (display.normalized === 'DNC') IconComp = AlertTriangle;
    else if (display.normalized === 'Hot') IconComp = Flame;
    else if (display.normalized === 'Warm') IconComp = Sun;

    const sizeClasses =
      size === 'sm'
        ? 'w-6 h-6 text-xs'
        : size === 'lg'
        ? 'w-9 h-9 text-sm'
        : 'w-8 h-8 text-xs';

    const iconSizeClasses =
      size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4.5 h-4.5' : 'w-4 h-4';

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!isInteractive}
        title={tooltip}
        className={`rounded-full flex items-center justify-center shrink-0 ${sizeClasses} ${display.iconBgClass} ${interactiveClasses} ${className}`}
      >
        <IconComp className={iconSizeClasses} />
      </button>
    );
  }

  // 2. Compact Variant
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!isInteractive}
        title={tooltip}
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-tight border ${display.badgeClass} ${interactiveClasses} ${className}`}
      >
        <span>{display.label}</span>
      </button>
    );
  }

  // 3. Standard Pill Variant
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isInteractive}
      title={tooltip}
      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border shrink-0 ${display.badgeClass} ${interactiveClasses} ${className}`}
    >
      <span>{display.label}</span>
    </button>
  );
}
