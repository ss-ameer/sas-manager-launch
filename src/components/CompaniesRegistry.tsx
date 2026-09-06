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

export default CompanyModal;
export * from './CompanyModal';
