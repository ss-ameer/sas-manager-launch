import React, { createContext, useContext, useCallback } from 'react';
import { Company, Contact, CallLogEntry, ActivityChannel, CallStatus } from '../types';

export type UniversalChannel =
  | 'phone'
  | 'call'
  | 'Call'
  | 'Phone Call'
  | 'message'
  | 'whatsapp'
  | 'sms'
  | 'WhatsApp'
  | 'Message (WhatsApp/SMS)'
  | 'email'
  | 'mail'
  | 'Email'
  | 'meeting'
  | 'Meeting'
  | 'Meeting (Virtual/In-Person)'
  | 'site_visit'
  | 'site visit'
  | 'Site Visit'
  | string;

export function normalizeActivityChannel(raw?: string): ActivityChannel {
  if (!raw) return 'Call';
  const lower = raw.toLowerCase().trim();
  if (lower.includes('phone') || lower.includes('call')) return 'Call';
  if (lower.includes('message') || lower.includes('whatsapp') || lower.includes('sms')) return 'WhatsApp';
  if (lower.includes('email') || lower.includes('mail')) return 'Email';
  if (lower.includes('meeting')) return 'Meeting';
  if (lower.includes('site') || lower.includes('visit')) return 'Site Visit';
  return 'Call';
}

export function sanitizeWhatsAppNumber(num?: any): string {
  if (!num) return '';
  return String(typeof num === 'object' ? (num.number || num.value || '') : num).replace(/\D/g, '');
}

export interface InitiateActivityOptions {
  company?: Company | { id?: string; display_name?: string; canonical_name?: string; [key: string]: any } | null;
  companyId?: string;
  companyName?: string;
  contact?: Contact | { id?: string; full_name?: string; mobile?: string; landline?: string; email?: string; [key: string]: any } | null;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  channel?: UniversalChannel;
  detail?: string;
  targetType?: 'contact' | 'company_mainline';
  enquiryId?: string;
  externalUrl?: string;
  existingLog?: CallLogEntry | null;
  logToEdit?: CallLogEntry | null;
  drawerMode?: 'create' | 'edit' | 'execute';
  initialStatus?: CallStatus;
  e?: React.SyntheticEvent;
}

export interface ActivityDrawerContextState {
  companyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  targetType?: 'contact' | 'company_mainline';
  enquiryId?: string;
  channel?: ActivityChannel | string;
  initialStatus?: CallStatus;
  existingLog?: CallLogEntry | null;
  logToEdit?: CallLogEntry | null;
  drawerMode?: 'create' | 'edit' | 'execute';
}

export interface ActivityLauncherContextType {
  initiateActivity: (options: InitiateActivityOptions) => void;
  openActivityDrawerWithContext: (context: ActivityDrawerContextState) => void;
  closeActivityDrawer: () => void;
  isActivityDrawerOpen: boolean;
  activityDrawerContext: ActivityDrawerContextState;
}

const ActivityLauncherContext = createContext<ActivityLauncherContextType | null>(null);

export interface ActivityLauncherProviderProps {
  children: React.ReactNode;
  isActivityDrawerOpen: boolean;
  setIsActivityDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activityDrawerContext: ActivityDrawerContextState;
  setActivityDrawerContext: React.Dispatch<React.SetStateAction<ActivityDrawerContextState>>;
  companies?: Company[];
  contacts?: Contact[];
}

export const ActivityLauncherProvider: React.FC<ActivityLauncherProviderProps> = ({
  children,
  isActivityDrawerOpen,
  setIsActivityDrawerOpen,
  activityDrawerContext,
  setActivityDrawerContext,
  companies = [],
  contacts = []
}) => {
  const initiateActivity = useCallback(
    (options: InitiateActivityOptions) => {
      if (options.e) {
        options.e.stopPropagation();
      }

      // Handle optional external url (e.g. from Company360Modal or external links)
      if (options.externalUrl) {
        try {
          window.open(options.externalUrl, '_blank', 'noopener,noreferrer');
        } catch {
          // ignore popup blocking in iframe
        }
      }

      // Resolve Company
      let compId = options.companyId || options.company?.id || '';
      let compName = options.companyName || options.company?.display_name || options.company?.canonical_name || '';

      if (!compId && options.contact?.company_id) {
        compId = options.contact.company_id;
      }

      if (compId && !compName && companies.length > 0) {
        const found = companies.find((c) => c.id === compId);
        if (found) {
          compName = found.display_name || found.canonical_name || '';
        }
      }

      // Resolve Contact
      let ctId = options.contactId || options.contact?.id || '';
      let ctName = options.contactName || options.contact?.full_name || '';
      let ctPhone = options.contactPhone || options.contact?.mobile || options.contact?.landline || '';
      let ctEmail = options.contactEmail || options.contact?.email || '';

      if (ctId && (!ctName || !ctPhone || !ctEmail) && contacts.length > 0) {
        const foundCt = contacts.find((c) => c.id === ctId);
        if (foundCt) {
          ctName = ctName || foundCt.full_name || '';
          ctPhone = ctPhone || foundCt.mobile || foundCt.landline || '';
          ctEmail = ctEmail || foundCt.email || '';
          if (!compId && foundCt.company_id) {
            compId = foundCt.company_id;
          }
        }
      }

      // Handle explicit detail (e.g., clicked phone number or email address)
      if (options.detail) {
        const det = options.detail.trim();
        if (det.includes('@')) {
          ctEmail = det;
        } else {
          ctPhone = det;
        }
      }

      // Resolve Target Type
      const targetType: 'contact' | 'company_mainline' =
        options.targetType ||
        (ctId || options.contact
          ? 'contact'
          : compId && !ctId
          ? 'company_mainline'
          : 'contact');

      // Resolve Normalized Channel
      const channel = normalizeActivityChannel(options.channel);

      const nextContext: ActivityDrawerContextState = {
        companyId: compId,
        companyName: compName,
        contactId: ctId,
        contactName: ctName,
        contactPhone: ctPhone,
        contactEmail: ctEmail,
        targetType,
        enquiryId: options.enquiryId,
        channel,
        initialStatus: options.initialStatus,
        existingLog: options.existingLog || null,
        logToEdit: options.logToEdit || null,
        drawerMode: options.drawerMode || (options.logToEdit ? 'edit' : 'create')
      };

      setActivityDrawerContext(nextContext);
      setIsActivityDrawerOpen(true);
    },
    [companies, contacts, setActivityDrawerContext, setIsActivityDrawerOpen]
  );

  const openActivityDrawerWithContext = useCallback(
    (ctx: ActivityDrawerContextState) => {
      setActivityDrawerContext(ctx);
      setIsActivityDrawerOpen(true);
    },
    [setActivityDrawerContext, setIsActivityDrawerOpen]
  );

  const closeActivityDrawer = useCallback(() => {
    setIsActivityDrawerOpen(false);
  }, [setIsActivityDrawerOpen]);

  return (
    <ActivityLauncherContext.Provider
      value={{
        initiateActivity,
        openActivityDrawerWithContext,
        closeActivityDrawer,
        isActivityDrawerOpen,
        activityDrawerContext
      }}
    >
      {children}
    </ActivityLauncherContext.Provider>
  );
};

export const useActivityLauncher = () => {
  const context = useContext(ActivityLauncherContext);
  if (!context) {
    // Fallback safe dummy handler if used outside provider during initial render
    return {
      initiateActivity: () => {},
      openActivityDrawerWithContext: () => {},
      closeActivityDrawer: () => {},
      isActivityDrawerOpen: false,
      activityDrawerContext: {}
    };
  }
  return context;
};
