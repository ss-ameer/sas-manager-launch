import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Building2,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  CalendarClock,
  Ban,
  FileText,
  Loader2,
  Sparkles,
  ArrowRight,
  PhoneCall
} from 'lucide-react';
import { CallLogEntry, CallStatus, ActivityChannel } from '../types';
import { safeSetDoc } from '../firebase';
import { CallLogRepository } from '../services/repositories/CallLogRepository';
import { channelStatuses, getOutcomesForStatus } from './QuickActivityDrawer';

export interface LiveExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CallLogEntry | any | null;
  onSuccess?: (updatedTask: CallLogEntry, spawnedTask?: CallLogEntry) => void;
  user?: any;
}

export default function LiveExecutionModal({
  isOpen,
  onClose,
  task,
  onSuccess,
  user
}: LiveExecutionModalProps) {
  const taskChannel: ActivityChannel = ((task?.channel as ActivityChannel) || 'Call') as ActivityChannel;
  const availableStatuses = channelStatuses[taskChannel] || channelStatuses.Call || [
    'Completed Log',
    'Scheduled / Planned',
    'No Answer',
    'Busy',
    'Invalid Number'
  ];

  // Default completed status
  const defaultCompletedStatus =
    availableStatuses.find((s) => s.toLowerCase().includes('completed') || s.toLowerCase().includes('conducted') || s.toLowerCase().includes('sent')) ||
    availableStatuses[0] ||
    'Completed Log';

  const [resolutionAction, setResolutionAction] = useState<'complete' | 'reschedule' | 'cancel'>('complete');
  const [callStatus, setCallStatus] = useState<string>(defaultCompletedStatus);
  const [callOutcome, setCallOutcome] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize and reset form when task or isOpen changes
  useEffect(() => {
    if (task && isOpen) {
      setResolutionAction('complete');
      setCallStatus(defaultCompletedStatus);
      const initialOutcomes = getOutcomesForStatus(defaultCompletedStatus);
      setCallOutcome(initialOutcomes[0] || 'Meeting Booked');
      setNotes('');
      
      // Default next follow-up date to tomorrow at 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const offset = tomorrow.getTimezoneOffset() * 60000;
      const localIso = new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
      setNextFollowUpDate(localIso);
    }
  }, [task, isOpen, defaultCompletedStatus]);

  // Update outcomes when status changes
  useEffect(() => {
    if (isOpen) {
      const validOutcomes = getOutcomesForStatus(callStatus);
      if (!validOutcomes.includes(callOutcome)) {
        setCallOutcome(validOutcomes[0] || '');
      }
    }
  }, [callStatus, callOutcome, isOpen]);

  if (!isOpen || !task) return null;

  const isConnectedState = [
    'Completed Log',
    'Completed',
    'Conducted',
    'Message Sent',
    'Email Sent',
    'Read / Seen',
    'Opened / Replied'
  ].includes(callStatus);

  const availableOutcomes = getOutcomesForStatus(callStatus);

  const companyName = task.company_name || task.unlinked_name || 'No Company';
  const contactName = task.contact_name || 'No Contact';
  const phoneNumber = task.contact_phone || task.phone_number || task.phone || task.unlinked_contact_info || '';
  const originalAgenda = task.followup_intent || task.requirement_notes || task.notes || 'No prior agenda notes attached.';

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !task.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      let updatedStatus: string = callStatus;
      let updatedOutcome: string | undefined = task.outcome;
      let finalNotes: string = task.requirement_notes || '';

      if (resolutionAction === 'cancel') {
        updatedStatus = 'Cancelled';
        updatedOutcome = 'Action Cancelled';
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Cancelled]: ${notes.trim()}`
            : `[Cancelled]: ${notes.trim()}`
          : finalNotes;
      } else if (resolutionAction === 'reschedule') {
        updatedStatus = 'Rescheduled';
        updatedOutcome = 'Follow-Up Scheduled';
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Rescheduled]: ${notes.trim()}`
            : `[Rescheduled]: ${notes.trim()}`
          : finalNotes;
      } else {
        // resolutionAction === 'complete'
        updatedStatus = callStatus;
        if (isConnectedState || availableOutcomes.length > 0) {
          updatedOutcome = callOutcome;
        }
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Execution Notes]: ${notes.trim()}`
            : notes.trim()
          : finalNotes;
      }

      // Step 1: Update the CURRENT task's database record
      const updatedTaskRecord: CallLogEntry = {
        ...task,
        status: updatedStatus as CallStatus,
        outcome: updatedOutcome,
        requirement_notes: finalNotes,
        updatedAt: nowIso,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName,
        ...(resolutionAction === 'complete' ? { completed_at: nowIso, completedAt: nowIso } : {}),
        ...(nextFollowUpDate && resolutionAction !== 'cancel' ? { next_followup_date: nextFollowUpDate } : {})
      };

      await safeSetDoc('activity_logs', task.id, updatedTaskRecord);
      await safeSetDoc('call_logs', task.id, updatedTaskRecord);
      await CallLogRepository.save(updatedTaskRecord);

      // Step 2 (The Spawner): IF complete or reschedule AND nextFollowUpDate has a value
      let spawnedFollowUpTask: CallLogEntry | undefined = undefined;
      if (
        (resolutionAction === 'complete' || resolutionAction === 'reschedule') &&
        nextFollowUpDate &&
        nextFollowUpDate.trim() !== ''
      ) {
        const spawnedId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
        spawnedFollowUpTask = {
          id: spawnedId,
          workspace_id: task.workspace_id || 'ws_default',
          company_id: task.company_id,
          company_name: task.company_name || task.unlinked_name,
          contact_id: task.contact_id,
          contact_name: task.contact_name,
          contact_phone: task.contact_phone || task.phone_number || task.phone,
          channel: task.channel || 'Call',
          date: nextFollowUpDate,
          status: 'Scheduled / Planned' as CallStatus,
          outcome: 'Follow-Up Scheduled',
          purpose: task.purpose || 'Follow-up / Check-in',
          requirement_notes: notes.trim() || task.requirement_notes || 'Scheduled Follow-Up Task',
          followup_intent: notes.trim() || task.followup_intent || undefined,
          logged_by: userName,
          sales_person: userName,
          created_by_uid: userUid,
          created_by_name: userName,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        await safeSetDoc('activity_logs', spawnedId, spawnedFollowUpTask);
        await safeSetDoc('call_logs', spawnedId, spawnedFollowUpTask);
        await CallLogRepository.save(spawnedFollowUpTask);
      }

      // Step 3: Await database writes, trigger onSuccess and close
      if (onSuccess) {
        onSuccess(updatedTaskRecord, spawnedFollowUpTask);
      }
      onClose();
    } catch (err) {
      console.error('Error executing task resolution:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="live-execution-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        id="live-execution-modal-container"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <PhoneCall className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Live Execution Command Center
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Log resolution and spawn scheduled follow-ups
              </p>
            </div>
          </div>
          <button
            id="close-live-execution-modal-button"
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleExecute} className="p-6 space-y-5">
          {/* Target Task Briefing Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                  {companyName}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{contactName}</span>
              </div>
            </div>

            {phoneNumber && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-mono">{phoneNumber}</span>
                </div>
                <a
                  href={`tel:${phoneNumber}`}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition font-medium"
                >
                  <PhoneCall className="w-3 h-3" />
                  <span>Call Now</span>
                </a>
              </div>
            )}

            {/* Read-Only Original Agenda */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                <FileText className="w-3 h-3" />
                <span>Original Agenda / Notes</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800 whitespace-pre-wrap">
                {originalAgenda}
              </p>
            </div>
          </div>

          {/* 3-Way Action Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Select Resolution Action
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                id="action-toggle-complete"
                onClick={() => setResolutionAction('complete')}
                className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'complete'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Complete Call</span>
              </button>

              <button
                type="button"
                id="action-toggle-reschedule"
                onClick={() => setResolutionAction('reschedule')}
                className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'reschedule'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <CalendarClock className="w-4 h-4 shrink-0" />
                <span className="truncate">Just Reschedule</span>
              </button>

              <button
                type="button"
                id="action-toggle-cancel"
                onClick={() => setResolutionAction('cancel')}
                className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'cancel'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Ban className="w-4 h-4 shrink-0" />
                <span className="truncate">Cancel Activity</span>
              </button>
            </div>
          </div>

          {/* Conditional Form Fields */}
          {resolutionAction === 'complete' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Call Status Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Call Status <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableStatuses.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCallStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        callStatus === st
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Call Outcome Select Dropdown (shown when connected or when outcomes available) */}
              {(isConnectedState || availableOutcomes.length > 0) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Call Outcome <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="call-outcome-select"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  >
                    {availableOutcomes.map((out) => (
                      <option key={out} value={out}>
                        {out}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Discussion Summary & Notes
                </label>
                <textarea
                  id="execution-notes-textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarize key takeaways, client response, requirement updates..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>

              {/* Next Follow-Up Date Input */}
              <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Next Follow-Up Date & Time (Optional Spawner)</span>
                  </label>
                  {nextFollowUpDate && (
                    <button
                      type="button"
                      onClick={() => setNextFollowUpDate('')}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  id="next-followup-datetime"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-mono"
                />
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Leaving a date creates a fresh scheduled task in your queue automatically.
                </p>
              </div>
            </div>
          )}

          {resolutionAction === 'reschedule' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Next Follow-Up Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  New Scheduled Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="reschedule-datetime"
                  required
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition font-mono"
                />
              </div>

              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reschedule Reason & Agenda
                </label>
                <textarea
                  id="reschedule-notes-textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Client requested call tomorrow at 11 AM due to management review..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          )}

          {resolutionAction === 'cancel' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="cancel-notes-textarea"
                  rows={3}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Project dropped, wrong contact details, client opted out..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              id="confirm-execute-resolution-button"
              disabled={isSubmitting}
              className={`py-2.5 px-5 rounded-xl text-xs font-bold text-white shadow-sm transition flex items-center space-x-2 cursor-pointer ${
                resolutionAction === 'cancel'
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400'
                  : resolutionAction === 'reschedule'
                  ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {resolutionAction === 'cancel'
                      ? 'Confirm Cancellation'
                      : resolutionAction === 'reschedule'
                      ? 'Reschedule Task'
                      : 'Complete & Save'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
