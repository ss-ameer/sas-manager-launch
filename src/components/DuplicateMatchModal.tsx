import React from 'react';
import { Company } from '../types';
import { AlertTriangle, Building2, Phone, Mail, ShieldAlert, X, GitMerge, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ResolutionManagerModal from './ResolutionManagerModal';

export interface DuplicateMatchModalProps {
  isOpen: boolean;
  onClose?: () => void;
  existingCompany?: Company;
  newCompanyName?: string;
  onConfirmKeepNew?: () => void;
  onSelectExisting?: (company: Company) => void;

  // Additional/legacy resolution manager compatibility props:
  type?: 'company' | 'contact';
  candidateName?: string;
  existingRecordName?: string;
  matchReason?: string;
  similarityScore?: number;
  existingDetails?: {
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
    companyName?: string;
    website?: string;
  };
  newDetails?: {
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
    companyName?: string;
    website?: string;
  };
  onMerge?: () => void;
  onKeepNew?: () => void;
  onIgnore?: () => void;
  onCancel?: () => void;
}

export default function DuplicateMatchModal({
  isOpen,
  onClose,
  existingCompany,
  newCompanyName,
  onConfirmKeepNew,
  onSelectExisting,
  type = 'company',
  candidateName,
  existingRecordName,
  matchReason,
  similarityScore,
  existingDetails,
  newDetails,
  onMerge,
  onKeepNew,
  onIgnore,
  onCancel,
}: DuplicateMatchModalProps) {
  if (!isOpen) return null;

  const handleDismiss = onClose || onCancel || (() => {});

  // If passed directly via ResolutionManagerModal props without existingCompany, fallback to ResolutionManagerModal
  if (!existingCompany && (candidateName || matchReason || existingRecordName)) {
    return (
      <ResolutionManagerModal
        isOpen={isOpen}
        type={type}
        similarityScore={similarityScore || 0.85}
        matchReason={matchReason || 'Potential duplicate match detected'}
        candidateName={candidateName || newCompanyName || 'New Record'}
        existingRecordName={existingRecordName || 'Existing Catalog Record'}
        existingDetails={existingDetails}
        newDetails={newDetails}
        onMerge={onMerge || (() => {})}
        onKeepNew={onKeepNew}
        onIgnore={onIgnore || onConfirmKeepNew || (() => {})}
        onCancel={handleDismiss}
      />
    );
  }

  // High-contrast dark-slate modal implementation for direct company match
  const compName = existingCompany?.display_name || existingCompany?.canonical_name || existingRecordName || 'Existing Company';
  const newName = newCompanyName || candidateName || 'New Company Submission';
  const compPhone = existingCompany?.general_phone || existingCompany?.phones?.[0]?.number || existingDetails?.phone || 'N/A';
  const compEmail = existingCompany?.general_email || existingCompany?.emails?.[0]?.email || existingDetails?.email || 'N/A';
  const compCityCountry = [
    existingCompany?.city || existingDetails?.city,
    existingCompany?.country || existingDetails?.country
  ].filter(Boolean).join(', ') || 'N/A';

  const handleMergeClick = () => {
    if (onSelectExisting && existingCompany) {
      onSelectExisting(existingCompany);
    } else if (onMerge) {
      onMerge();
    }
  };

  const handleKeepNewClick = () => {
    if (onConfirmKeepNew) {
      onConfirmKeepNew();
    } else if (onIgnore) {
      onIgnore();
    } else if (onKeepNew) {
      onKeepNew();
    }
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
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-sans tracking-tight">
                  Duplicate Company Match Detected
                </h3>
                <p className="text-xs text-slate-400">
                  A company record with a matching name already exists in the catalog.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Warning Banner & Details */}
          <div className="p-5 space-y-4">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Potential Duplicate Found: </span>
                Attempting to register <strong className="text-white">"{newName}"</strong> which matches existing record <strong className="text-white">"{compName}"</strong>.
              </div>
            </div>

            {/* Existing Company Info Box */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="text-[11px] font-mono font-bold uppercase text-slate-400 tracking-wider flex items-center justify-between">
                <span>Matching Existing Catalog Record</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                  In System
                </span>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center space-x-2 text-slate-200">
                  <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="font-bold text-sm text-white">{compName}</span>
                </div>

                {compPhone !== 'N/A' && (
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Phone: {compPhone}</span>
                  </div>
                )}

                {compEmail !== 'N/A' && (
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Contact Email: {compEmail}</span>
                  </div>
                )}

                {compCityCountry !== 'N/A' && (
                  <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
                    <span>Location: {compCityCountry}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Please choose whether to merge with the existing record or proceed saving as a separate record.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-2.5">
            <button
              onClick={handleKeepNewClick}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400" />
              <span>Save as Separate Record</span>
            </button>

            <button
              onClick={handleMergeClick}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge & Use Existing</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
