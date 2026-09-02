const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {activeChannel} Summary & Notes
                </label>
                <textarea`;

const r1 = `              {resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Activity Date & Time (Future Scheduling)
                  </label>
                  <input
                    type="datetime-local"
                    value={primaryActivityDate}
                    onChange={(e) => setPrimaryActivityDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-mono"
                  />
                </div>
              )}

              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {activeChannel} Summary & Notes
                </label>
                <textarea`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
