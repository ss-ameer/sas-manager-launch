import React, { useMemo, useState } from 'react';
import { Enquiry, Company, Contact } from '../types';
import { X, Phone, PhoneOff, AlertTriangle, CheckCircle2, Search, Filter, HelpCircle, FileSpreadsheet } from 'lucide-react';

interface PhoneDataDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiries: Enquiry[];
  companies: Company[];
  contacts: Contact[];
}

export default function PhoneDataDiagnosticModal({
  isOpen,
  onClose,
  enquiries,
  companies,
  contacts
}: PhoneDataDiagnosticModalProps) {
  const [filterSegment, setFilterSegment] = useState<'all' | 'usable' | 'missing_phone' | 'missing_contact'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();
    (companies || []).forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [companies]);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    (contacts || []).forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [contacts]);

  // Analyze each enquiry row
  const analysis = useMemo(() => {
    let usableCount = 0;
    let missingPhoneCount = 0;
    let missingContactCount = 0;
    let companyPhoneFallbackCount = 0;

    const rows = (enquiries || []).map((e) => {
      const company = e.company_id ? companyMap.get(e.company_id) : undefined;
      const contact = e.contact_id ? contactMap.get(e.contact_id) : undefined;

      const contactPhone = (contact?.mobile || contact?.landline || '').trim();
      const companyPhone = (company?.general_phone || '').trim();

      let usablePhone = '';
      let status: 'usable_contact' | 'usable_company' | 'missing_contact' | 'missing_phone' = 'missing_phone';

      if (contactPhone) {
        usablePhone = contactPhone;
        status = 'usable_contact';
        usableCount++;
      } else if (companyPhone) {
        usablePhone = companyPhone;
        status = 'usable_company';
        companyPhoneFallbackCount++;
        usableCount++;
      } else if (!contact) {
        status = 'missing_contact';
        missingContactCount++;
      } else {
        status = 'missing_phone';
        missingPhoneCount++;
      }

      return {
        id: e.id || '',
        sn: e.sn,
        enquiry_date: e.enquiry_date,
        quote_ref_no: e.quote_ref_no,
        company_name: company?.display_name || company?.canonical_name || 'Unknown Company',
        contact_name: contact?.full_name || 'No Contact Person',
        usablePhone,
        status
      };
    });

    const total = rows.length;
    const usablePercentage = total > 0 ? Math.round((usableCount / total) * 100) : 0;

    return {
      total,
      usableCount,
      usablePercentage,
      missingPhoneCount,
      missingContactCount,
      companyPhoneFallbackCount,
      rows
    };
  }, [enquiries, companyMap, contactMap]);

  if (!isOpen) return null;

  const filteredRows = analysis.rows.filter((r) => {
    if (filterSegment === 'usable' && !(r.status === 'usable_contact' || r.status === 'usable_company')) return false;
    if (filterSegment === 'missing_phone' && r.status !== 'missing_phone') return false;
    if (filterSegment === 'missing_contact' && r.status !== 'missing_contact') return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.company_name.toLowerCase().includes(q) ||
        r.contact_name.toLowerCase().includes(q) ||
        r.quote_ref_no.toLowerCase().includes(q) ||
        r.usablePhone.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Historical Phone Data Diagnostic</h2>
              <p className="text-xs text-slate-300">
                Auditing ~{analysis.total} Historical Rows for Call Queue Readiness
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Metrics Banner */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Rows Audited</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{analysis.total.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">Enquiry records in system</div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-sm">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Usable Phone Readiness</span>
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {analysis.usableCount.toLocaleString()} ({analysis.usablePercentage}%)
            </div>
            <div className="text-xs text-emerald-700 mt-1">Ready to call / queue instantly</div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-sm">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-1">
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Missing Phone Numbers</span>
            </div>
            <div className="text-2xl font-black text-amber-700 mt-1">
              {analysis.missingPhoneCount.toLocaleString()}
            </div>
            <div className="text-xs text-amber-700 mt-1">Contact exists, missing phone</div>
          </div>

          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 shadow-sm">
            <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Missing Contact Record</span>
            </div>
            <div className="text-2xl font-black text-rose-700 mt-1">
              {analysis.missingContactCount.toLocaleString()}
            </div>
            <div className="text-xs text-rose-700 mt-1">Company only / unassigned</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setFilterSegment('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterSegment === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Rows ({analysis.total})
            </button>
            <button
              onClick={() => setFilterSegment('usable')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterSegment === 'usable' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Usable Phone ({analysis.usableCount})
            </button>
            <button
              onClick={() => setFilterSegment('missing_phone')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterSegment === 'missing_phone' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Missing Phone ({analysis.missingPhoneCount})
            </button>
            <button
              onClick={() => setFilterSegment('missing_contact')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterSegment === 'missing_contact' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Missing Contact ({analysis.missingContactCount})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search audited rows..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Audit Results Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">S/N & Ref</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Contact Person</th>
                  <th className="p-3">Resolved Phone Number</th>
                  <th className="p-3">Audit Readiness Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRows.slice(0, 150).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-800">
                      #{r.sn} <span className="text-[11px] font-normal text-slate-500">({r.quote_ref_no || 'No Ref'})</span>
                    </td>
                    <td className="p-3 font-medium text-slate-900">{r.company_name}</td>
                    <td className="p-3 text-slate-700">{r.contact_name}</td>
                    <td className="p-3">
                      {r.usablePhone ? (
                        <span className="font-mono text-emerald-700 font-semibold">{r.usablePhone}</span>
                      ) : (
                        <span className="text-slate-400 italic">None registered</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.status === 'usable_contact' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Direct Mobile/Landline</span>
                        </span>
                      )}
                      {r.status === 'usable_company' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                          <Phone className="w-3 h-3" />
                          <span>Company General Phone</span>
                        </span>
                      )}
                      {r.status === 'missing_phone' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <PhoneOff className="w-3 h-3" />
                          <span>Missing Phone String</span>
                        </span>
                      )}
                      {r.status === 'missing_contact' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          <AlertTriangle className="w-3 h-3" />
                          <span>No Contact Assigned</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      No audited records match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 150 && (
            <div className="mt-3 text-center text-xs text-slate-500 italic">
              Showing first 150 of {filteredRows.length} rows. Filter or search to inspect specific items.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Recommendation:</span> Highlighting missing numbers allows operators to complete contact profiles before populating daily queues.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
