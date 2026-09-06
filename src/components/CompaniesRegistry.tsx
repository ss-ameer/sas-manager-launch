import React from 'react';
import CompanyModal from './CompanyModal';
import { formatSubTypeName } from '../utils/taxonomy';

export { formatSubTypeName };

/**
 * Formats company sub-type for Table and Card view display in Companies Registry
 */
export const formatCompanySubType = (company?: { subType?: string; business_type_raw?: string } | null) => {
  if (!company) return '';
  return formatSubTypeName(company.subType || company.business_type_raw);
};

export const TABLE_FALLBACK_TEXT_CLASSES = "text-xs font-medium text-slate-600 dark:text-slate-300 not-italic";
export const TABLE_HEADER_TEXT_CLASSES = "text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200";
export const DETAIL_HEADER_CLASSES = "text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider";
export const DETAIL_EMPTY_FALLBACK_CLASSES = "text-sm font-medium text-slate-600 dark:text-slate-300 not-italic";
export const DETAIL_EMPTY_CONTAINER_CLASSES = "bg-slate-50 dark:bg-slate-800/50 rounded-md p-2.5 border border-slate-200 dark:border-slate-700";
export const ACTION_PILL_BUTTON_CLASSES = "border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 transition-colors shadow-xs";

export default CompanyModal;
export * from './CompanyModal';
