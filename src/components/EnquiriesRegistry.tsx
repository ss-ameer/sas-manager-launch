import React from 'react';
import EnquiryList from './EnquiryList';

export const ENQUIRY_ACTION_PILL_CLASSES =
  "border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 transition-colors shadow-xs";

export const ENQUIRY_ACTION_DELETE_CLASSES =
  "p-1 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 dark:text-slate-500 rounded-md transition-colors";

export const OVERDUE_FILTER_TOGGLE_ACTIVE_CLASSES =
  "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-bold ring-2 ring-rose-500/20";

export const OVERDUE_FILTER_TOGGLE_INACTIVE_CLASSES =
  "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900";

export default EnquiryList;
export * from './EnquiryList';
