import React, { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Trash2, X, UserCheck, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface TargetTeamMember {
  id: string;
  name: string;
  initials?: string;
  role?: string;
}

export interface ReassignOpenRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  representativeName: string;
  openEnquiryCount: number;
  pendingActivityCount: number;
  availableTeamMembers: TargetTeamMember[];
  onReassignAndDelete: (reassignToSalespersonId: string) => Promise<void>;
  onDirectDelete: () => Promise<void>;
  isSubmitting?: boolean;
}

export default function ReassignOpenRecordsModal({
  isOpen,
  onClose,
  representativeName,
  openEnquiryCount,
  pendingActivityCount,
  availableTeamMembers,
  onReassignAndDelete,
  onDirectDelete,
  isSubmitting = false
}: ReassignOpenRecordsModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    availableTeamMembers[0]?.id || ''
  );

  if (!isOpen) return null;

  const handleReassignClick = async () => {
    if (!selectedTargetId) return;
    await onReassignAndDelete(selectedTargetId);
  };

  const handleDirectDeleteClick = async () => {
    await onDirectDelete();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col"
        >
          {/* Header */}
          <div className="bg-slate-950 px-5 py-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-sans tracking-tight">
                  Reassign Open Records Before Deletion
                </h3>
                <p className="text-xs text-slate-400">
                  Data Handover Workflow for {representativeName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content & Summary Count */}
          <div className="p-5 space-y-4">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-amber-200 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-300">
                  Active Workload Detected:
                </div>
                <div>
                  This representative has <strong className="text-white font-bold">{openEnquiryCount} open quote{openEnquiryCount === 1 ? '' : 's'}</strong> and <strong className="text-white font-bold">{pendingActivityCount} scheduled follow-up{pendingActivityCount === 1 ? '' : 's'}</strong>.
                </div>
              </div>
            </div>

            {/* Target Representative Selection */}
            {availableTeamMembers.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Target Active Team Member for Reassignment
                </label>
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {availableTeamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.initials ? `(${m.initials})` : ''} {m.role ? `- ${m.role}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-rose-400 italic">
                No alternative active team members available for reassignment.
              </p>
            )}

            <p className="text-xs text-slate-400 leading-relaxed">
              Choose whether to reassign all open quotes and scheduled follow-ups to the selected team member or perform a direct delete (unassigning all records).
            </p>
          </div>

          {/* Footer Action Buttons */}
          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              onClick={handleDirectDeleteClick}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/50 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Direct Delete (Unassign)</span>
            </button>

            {availableTeamMembers.length > 0 && (
              <button
                onClick={handleReassignClick}
                disabled={!selectedTargetId || isSubmitting}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Processing...' : 'Reassign & Delete Profile'}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
