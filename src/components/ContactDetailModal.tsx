import React, { useState } from 'react';
import { Contact, getContactPhones, getContactEmails, getContactHandles, CallLogEntry, Enquiry, UserProfile, Salesperson } from '../types';
import { canEditOrDeleteRecord, isRecordOwner, canUserClickRecord, getSalespersonFullName } from '../utils/permissions';
import {
  X,
  User,
  Building2,
  Phone,
  Mail,
  MessageSquare,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  ShieldAlert,
  PhoneCall,
  Send,
  FileText,
  ChevronDown,
  ChevronUp,
  History
} from 'lucide-react';

interface ContactDetailModalProps {
  isOpen: boolean;
  contact: Contact | null;
  companyName?: string;
  callLogs?: CallLogEntry[];
  enquiries?: Enquiry[];
  salespersons?: Salesperson[];
  currentUser?: UserProfile | null;
  onClose: () => void;
  onEdit?: (contact: Contact) => void;
  onDelete?: (contact: Contact) => void;
  onSelectEnquiry?: (id: string) => void;
  onSelectCallLog?: (log: CallLogEntry) => void;
}

export default function ContactDetailModal({
  isOpen,
  contact,
  companyName,
  callLogs = [],
  enquiries = [],
  salespersons = [],
  currentUser,
  onClose,
  onEdit,
  onDelete,
  onSelectEnquiry,
  onSelectCallLog
}: ContactDetailModalProps) {
  if (!isOpen || !contact) return null;

  const [showHistory, setShowHistory] = useState(true);

  const isOwnDataOnly = currentUser && currentUser.role !== 'Admin' && currentUser.dataVisibilityScope === 'OWN_DATA_ONLY';
  const isBasicTier = currentUser && currentUser.role !== 'Admin' && currentUser.dataVisibilityTier === 'BASIC';
  const isOwnerOrAttributed = currentUser ? isRecordOwner(currentUser, contact) : true;
  const isMaskedForBasic = isBasicTier && !isOwnerOrAttributed;

  const phones = getContactPhones(contact);
  const emails = getContactEmails(contact);
  const handles = getContactHandles(contact);

  const primaryPhone = contact.mobile || phones[0]?.number || '';
  const primaryEmail = contact.email || emails[0]?.email || '';

  const whatsappPhone = primaryPhone.replace(/[^0-9]/g, '');

  const linkedLogs = callLogs.filter((cl) => {
    if (isOwnDataOnly && !isRecordOwner(currentUser, cl)) return false;
    return cl.contact_id === contact.id || (cl.contact_phone && primaryPhone && cl.contact_phone.includes(primaryPhone));
  });

  const linkedEnquiries = enquiries.filter((enq) => {
    if (isOwnDataOnly && !isRecordOwner(currentUser, enq)) return false;
    return enq.contact_id === contact.id;
  });

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-hidden">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden font-sans my-auto animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white relative shrink-0">
          <div className="space-y-1 pr-6">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h3 className="text-xl font-bold font-sans tracking-tight">{contact.full_name}</h3>
              {contact.is_primary && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
                  Primary Contact
                </span>
              )}
              {contact.is_dnc && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider">
                  DNC
                </span>
              )}
            </div>
            {contact.designation && (
              <p className="text-xs text-slate-300 font-medium">{contact.designation}</p>
            )}
            {companyName && (
              <div className="flex items-center space-x-1.5 text-xs text-blue-300 pt-1 font-semibold">
                <Building2 className="w-3.5 h-3.5" />
                <span>{companyName}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DNC Warning Banner if applicable */}
        {contact.is_dnc && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 flex items-center space-x-2 text-rose-800 text-xs font-medium">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Do Not Contact Flagged:</strong> {contact.dnc_reason || 'This contact has requested no communications.'}
            </span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {!isMaskedForBasic && whatsappPhone ? (
              <a
                href={`https://wa.me/${whatsappPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            ) : (
              <button
                disabled
                title={isMaskedForBasic ? "Restricted under Basic View" : "No phone number available"}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold opacity-60 cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            )}

            {!isMaskedForBasic && primaryEmail ? (
              <a
                href={`mailto:${primaryEmail}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <Mail className="w-4 h-4" />
                <span>Send Email</span>
              </a>
            ) : (
              <button
                disabled
                title={isMaskedForBasic ? "Restricted under Basic View" : "No email address available"}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold opacity-60 cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                <span>Send Email</span>
              </button>
            )}

            {!isMaskedForBasic && primaryPhone ? (
              <a
                href={`tel:${primaryPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Call Phone</span>
              </a>
            ) : (
              <button
                disabled
                title={isMaskedForBasic ? "Restricted under Basic View" : "No phone number available"}
                className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold opacity-60 cursor-not-allowed"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Call Phone</span>
              </button>
            )}
          </div>

          {/* Phone Numbers */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
              Phone Numbers ({phones.length})
            </h4>
            {phones.length > 0 ? (
              <div className="space-y-1.5">
                {phones.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-mono font-bold text-slate-900">
                        {isMaskedForBasic ? '*** **** (Basic View)' : p.number}
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-200/70 text-slate-600 text-[10px] font-medium rounded">
                        {p.label || 'Mobile'}
                      </span>
                    </div>
                    {!isMaskedForBasic && (
                      <button
                        type="button"
                        onClick={() => handleCopy(p.number, 'Phone number')}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition"
                        title="Copy Phone Number"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No phone numbers provided.</p>
            )}
          </div>

          {/* Email Addresses */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
              Email Addresses ({emails.length})
            </h4>
            {emails.length > 0 ? (
              <div className="space-y-1.5">
                {emails.map((e, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center space-x-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-slate-900 truncate">
                        {isMaskedForBasic ? '***@***.*** (Basic View)' : e.email}
                      </span>
                      {e.label && (
                        <span className="px-1.5 py-0.5 bg-slate-200/70 text-slate-600 text-[10px] font-medium rounded shrink-0">
                          {e.label}
                        </span>
                      )}
                    </div>
                    {!isMaskedForBasic && (
                      <button
                        type="button"
                        onClick={() => handleCopy(e.email, 'Email address')}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition shrink-0 ml-2"
                        title="Copy Email Address"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No email addresses provided.</p>
            )}
          </div>

          {/* Messaging & Social Handles */}
          {handles.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Messaging & Social Handles ({handles.length})
              </h4>
              <div className="space-y-1.5">
                {handles.map((h, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold text-slate-800">{h.platform}:</span>
                      <span className="font-mono text-slate-900">
                        {isMaskedForBasic ? '*** (Basic View)' : h.handle}
                      </span>
                    </div>
                    {!isMaskedForBasic && (
                      <button
                        type="button"
                        onClick={() => handleCopy(h.handle, `${h.platform} handle`)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition"
                        title="Copy Handle"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Expandable Linked Interaction History & Enquiries */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition text-left cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  Linked Outreach & Proposal History ({linkedLogs.length + linkedEnquiries.length})
                </span>
              </div>
              {showHistory ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            {showHistory && (
              <div className="space-y-3 p-3 bg-slate-50/50 rounded-xl border border-slate-200 text-xs font-sans">
                {linkedLogs.length === 0 && linkedEnquiries.length === 0 ? (
                  <p className="text-slate-400 italic text-[11px] text-center py-2">No past calls or enquiries found for this contact.</p>
                ) : (
                  <>
                    {linkedLogs.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Call Center Logs ({linkedLogs.length}):</span>
                        <div className="space-y-1">
                          {linkedLogs.map((log) => {
                            const canClick = currentUser ? canUserClickRecord(currentUser, log, salespersons) : true;
                            return (
                              <div
                                key={log.id}
                                onClick={() => {
                                  if (canClick && onSelectCallLog) {
                                    onSelectCallLog(log);
                                  }
                                }}
                                className={`p-2.5 bg-white rounded-lg border border-slate-200 flex items-start justify-between text-[11px] transition ${
                                  canClick ? 'hover:border-blue-400 hover:shadow-xs cursor-pointer' : 'opacity-90'
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                                    <PhoneCall className="w-3 h-3 text-blue-600 shrink-0" />
                                    <span>{log.date} — {log.purpose || 'Call'}</span>
                                  </div>
                                  <span className="text-slate-500 text-[10px] block">
                                    Logged by: <strong className="text-slate-700">{log.logged_by || 'Staff'}</strong> • Status: {log.status}
                                  </span>
                                  {!isBasicTier && log.requirement_notes && (
                                    <p className="text-slate-600 text-[10px] mt-1 line-clamp-2 bg-slate-50 p-1.5 rounded">{log.requirement_notes}</p>
                                  )}
                                </div>
                                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                  {log.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {linkedEnquiries.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Proposals & Enquiries ({linkedEnquiries.length}):</span>
                        <div className="space-y-1">
                          {linkedEnquiries.map((enq) => {
                            const canClick = currentUser ? canUserClickRecord(currentUser, enq, salespersons) : true;
                            const spName = getSalespersonFullName(enq.sales_person, salespersons);
                            return (
                              <div
                                key={enq.id}
                                onClick={() => {
                                  if (canClick && onSelectEnquiry && enq.id) {
                                    onSelectEnquiry(enq.id);
                                  }
                                }}
                                className={`p-2.5 bg-white rounded-lg border border-slate-200 flex items-start justify-between text-[11px] transition ${
                                  canClick ? 'hover:border-purple-400 hover:shadow-xs cursor-pointer' : 'opacity-90'
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                                    <FileText className="w-3 h-3 text-purple-600 shrink-0" />
                                    <span>{enq.quote_ref_no || `SN#${enq.sn}`} {enq.subject ? `- ${enq.subject}` : ''}</span>
                                  </div>
                                  <span className="text-slate-500 text-[10px] block">
                                    Logged by: <strong className="text-slate-700">{spName}</strong> {!isBasicTier && enq.value_aed ? `• AED ${enq.value_aed.toLocaleString()}` : ''}
                                  </span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                  {enq.status || 'Active'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {onDelete && canEditOrDeleteRecord(currentUser, contact) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(contact);
                }}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Contact</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
            {onEdit && canEditOrDeleteRecord(currentUser, contact) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(contact);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Contact</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
