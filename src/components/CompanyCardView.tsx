import React from 'react';
import { Company } from '../types';
import TemperatureBadge from './TemperatureBadge';
import GoogleSearchButton from './common/GoogleSearchButton';
import { IndustryBadge, formatSubTypeName } from '../utils/taxonomy';
import { MapPin } from 'lucide-react';
import { SearchMatchHint, CompanySearchMatchHint, UnassignedIndustryPill } from './CompaniesRegistry';
import { CompanyOutreachSummary, formatRelativeOutreachDate } from '../utils/activityLogic';

export interface CompanyCardViewProps {
  company: Company;
  isSelected: boolean;
  onSelect: () => void;
  linkCount: number;
  relVal: string;
  matchHint?: SearchMatchHint | null;
  companies: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  outreachSummary?: CompanyOutreachSummary;
}

export const CompanyCardView: React.FC<CompanyCardViewProps> = ({
  company: c,
  isSelected,
  onSelect,
  linkCount,
  relVal,
  matchHint,
  companies,
  setCompanies,
  outreachSummary
}) => {
  const hasIndustry = Boolean(
    c.industry_parent ||
    c.business_type_raw ||
    (c as any).subType ||
    c.industry ||
    c.industry_type
  );

  const summary = outreachSummary || {
    lastContactedAt: null,
    lastContactedDateStr: null,
    lastContactedChannel: null,
    totalCompletedTouches: 0,
    totalCalls: 0,
    outreachCadence: 'never' as const
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 group cursor-pointer ${
        isSelected
          ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 text-slate-900 dark:text-white shadow-sm'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
      }`}
    >
      <div className="space-y-2 w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 dark:text-white block truncate font-sans">
              {c.display_name}
            </span>
            <GoogleSearchButton companyName={c.display_name} location={c.city} size="xs" />
            {c.isInternalCompany && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                <span>🏢</span>
                <span>Our Company</span>
              </span>
            )}
          </div>
          <TemperatureBadge
            companyId={c.id}
            temperature={c.temperature}
            isDnc={c.is_dnc}
            variant="pill"
            companies={companies}
            setCompanies={setCompanies}
          />
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center space-x-1 font-sans">
            <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>{c.city || 'Unknown City'}, {c.country || 'UAE'}</span>
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {relVal}
          </span>
          {hasIndustry ? (
            <IndustryBadge
              company={
                c
                  ? {
                      ...c,
                      business_type_raw: formatSubTypeName((c as any).subType || c.business_type_raw)
                    }
                  : c
              }
            />
          ) : (
            <UnassignedIndustryPill />
          )}
        </div>

        {/* Search match context hint */}
        {matchHint && (
          <div>
            <CompanySearchMatchHint matchHint={matchHint} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-xs font-sans gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {summary.outreachCadence === 'never' ? (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
              title="No completed outreach logged for this account"
            >
              Never Contacted
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                summary.outreachCadence === 'recent'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
              title={`Last contacted on ${new Date(summary.lastContactedAt!).toLocaleString()}${summary.lastContactedChannel ? ` via ${summary.lastContactedChannel}` : ''}`}
            >
              Last: {formatRelativeOutreachDate(summary.lastContactedAt)}
            </span>
          )}

          {summary.totalCompletedTouches > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              title={`${summary.totalCompletedTouches} completed interaction${summary.totalCompletedTouches === 1 ? '' : 's'}`}
            >
              <span>📞</span>
              <span>{summary.totalCompletedTouches}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
          <span
            className={
              linkCount > 0
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'italic text-slate-500 dark:text-slate-400'
            }
          >
            {linkCount > 0 ? `${linkCount} ENQUIRIES` : '0 ENQUIRIES'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CompanyCardView;
