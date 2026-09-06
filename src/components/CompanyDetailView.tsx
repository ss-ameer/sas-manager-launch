import React from 'react';
import CompanyModal, {
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES
} from './CompaniesRegistry';

export {
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES
};

/**
 * Standard Company Detail / Inline Inspector View Empty State Container
 */
export interface EmptyDetailFieldProps {
  label: string;
  fallbackText: string;
  className?: string;
}

export const EmptyDetailField: React.FC<EmptyDetailFieldProps> = ({
  label,
  fallbackText,
  className = ''
}) => (
  <div className={`space-y-2 ${className}`}>
    <span className={DETAIL_HEADER_CLASSES}>{label}</span>
    <div className={DETAIL_EMPTY_CONTAINER_CLASSES}>
      <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>{fallbackText}</span>
    </div>
  </div>
);

export default CompanyModal;
