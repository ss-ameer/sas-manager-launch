import React from 'react';
import CompanyModal from './CompanyModal';
import { formatSubTypeName } from '../utils/taxonomy';
import CompanyDetailView, {
  CompanyDetailDrawer,
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES,
  EmptyDetailField
} from './CompanyDetailView';

export {
  formatSubTypeName,
  CompanyDetailView,
  CompanyDetailDrawer,
  EmptyDetailField,
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES
};

/**
 * Formats company sub-type for Table and Card view display in Companies Registry
 */
export const formatCompanySubType = (company?: { subType?: string; business_type_raw?: string } | null) => {
  if (!company) return '';
  return formatSubTypeName(company.subType || company.business_type_raw);
};

export const TABLE_FALLBACK_TEXT_CLASSES = "text-xs font-medium text-slate-600 dark:text-slate-300 not-italic";
export const TABLE_HEADER_TEXT_CLASSES = "text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200";
export const ACTION_PILL_BUTTON_CLASSES = "border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 transition-colors shadow-xs";

export default CompanyModal;
export * from './CompanyModal';
