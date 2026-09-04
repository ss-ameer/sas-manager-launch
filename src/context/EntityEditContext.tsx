import React, { createContext, useContext } from 'react';
import { Company, Contact } from '../types';

export interface EntityEditContextType {
  openEditCompany: (companyOrId: Company | string, onSaved?: (savedCompany: Company) => void) => void;
  openEditContact: (companyId?: string, contactOrId?: Contact | string, onSaved?: (savedContact: Contact) => void) => void;
}

export const EntityEditContext = createContext<EntityEditContextType | null>(null);

export const useEntityEdit = (): EntityEditContextType => {
  const context = useContext(EntityEditContext);
  if (!context) {
    // Return safe stubs if used outside provider so components don't crash
    return {
      openEditCompany: () => {},
      openEditContact: () => {}
    };
  }
  return context;
};
