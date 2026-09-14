import React, { useState, useMemo } from 'react';
import { Enquiry, Salesperson } from '../types';
import {
  X,
  Users,
  Search,
  Check,
  Shield,
  UserCheck,
  UserPlus,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface EnquiryCollaboratorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  salespersons: Salesperson[];
  canManage: boolean;
  onToggleCollaborator: (salesperson: Salesperson, isCurrentlyCollaborator: boolean) => Promise<void>;
  isCollaboratorCheck: (salesperson: Salesperson) => boolean;
}

export default function EnquiryCollaboratorsModal({
  isOpen,
  onClose,
  enquiry,
  salespersons,
  canManage,
  onToggleCollaborator,
  isCollaboratorCheck,
}: EnquiryCollaboratorsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Identify the primary assigned salesperson to exclude from collaborator picker
  const primarySp = useMemo(() => {
    const spVal = (enquiry.salesperson || enquiry.sales_person || '').trim().toLowerCase();
    const spId = (enquiry.salesperson_id || enquiry.sales_person_id || '').toLowerCase();
    return salespersons.find((s) => {
      if (spId && (s.id?.toLowerCase() === spId || s.linked_user_id?.toLowerCase() === spId)) return true;
      if (spVal && (s.full_name?.toLowerCase() === spVal || s.initials?.toLowerCase() === spVal)) return true;
      return false;
    });
  }, [enquiry, salespersons]);

  // Active workspace team members excluding primary salesperson
  const eligibleMembers = useMemo(() => {
    return salespersons.filter((s) => {
      if (primarySp && (s.id === primarySp.id || (s.initials && s.initials === primarySp.initials))) {
        return false;
      }
      return true;
    });
  }, [salespersons, primarySp]);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return eligibleMembers;
    return eligibleMembers.filter((s) => {
      const name = (s.full_name || '').toLowerCase();
      const initials = (s.initials || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const role = (s.role || s.designation || '').toLowerCase();
      return name.includes(q) || initials.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [eligibleMembers, searchTerm]);

  // Current active collaborators count
  const activeCollaboratorsCount = useMemo(() => {
    return eligibleMembers.filter((s) => isCollaboratorCheck(s)).length;
  }, [eligibleMembers, isCollaboratorCheck]);

  const handleToggle = async (sp: Salesperson) => {
    if (!canManage) return;
    const memberKey = sp.id || sp.initials || sp.full_name;
    setLoadingMemberId(memberKey);
    try {
      const isCurrently = isCollaboratorCheck(sp);
      await onToggleCollaborator(sp, isCurrently);
    } finally {
      setLoadingMemberId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 font-sans">
                Collaborators & Sharing
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Enquiry #{enquiry.sn} {enquiry.quote_ref_no ? `• ${enquiry.quote_ref_no}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Deal Owner Section */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs font-mono shrink-0">
              {primarySp?.initials || (enquiry.salesperson || enquiry.sales_person || 'REP').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-slate-800 font-sans">
                  {primarySp?.full_name || enquiry.salesperson || enquiry.sales_person || 'Assigned Salesperson'}
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-amber-200/80 text-amber-900 rounded-md font-mono">
                  Primary Owner
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block">
                Full universal ownership • Unrestricted access
              </span>
            </div>
          </div>
          <Shield className="w-4 h-4 text-amber-600 shrink-0" />
        </div>

        {/* Permission Warning Banner for Read-Only Viewers */}
        {!canManage && (
          <div className="px-6 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center space-x-2 text-xs text-blue-700">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              You have read-only access to this enquiry. Only the creator, primary salesperson, or workspace Admins can delegate access.
            </span>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team members by name, initials, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Team Members List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p>No team members found matching &quot;{searchTerm}&quot;</p>
            </div>
          ) : (
            filteredMembers.map((sp) => {
              const isCollab = isCollaboratorCheck(sp);
              const memberKey = sp.id || sp.initials || sp.full_name;
              const isLoading = loadingMemberId === memberKey;
              const initials = sp.initials || sp.full_name.slice(0, 2).toUpperCase();

              return (
                <div
                  key={memberKey}
                  onClick={() => {
                    if (canManage && !isLoading) {
                      handleToggle(sp);
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCollab
                      ? 'bg-blue-50/60 border-blue-200 hover:border-blue-300'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  } ${canManage ? 'cursor-pointer' : 'cursor-default opacity-85'}`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs font-mono shrink-0 transition-colors ${
                        isCollab
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-slate-800 font-sans">
                          {sp.full_name}
                        </span>
                        {sp.initials && (
                          <span className="text-[10px] font-mono text-slate-400">
                            ({sp.initials})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                        <span>{sp.role || sp.designation || 'Sales Representative'}</span>
                        {sp.email && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[160px] font-mono">{sp.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pl-2">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : isCollab ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shadow-xs">
                        <Check className="w-3.5 h-3.5" />
                        <span>Shared</span>
                      </span>
                    ) : canManage ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-medium transition">
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Not shared</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <span>
              <strong className="text-slate-800">{activeCollaboratorsCount}</strong> {activeCollaboratorsCount === 1 ? 'collaborator' : 'collaborators'} with delegated access
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
