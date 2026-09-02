const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t1 = `                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Next Follow-up Date
                      </label>
                      <div className="flex items-center gap-2">
                        {isFollowupMissing && (
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-500/50 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Required for {status === 'Busy' || status === 'No Answer' ? status : outcome || 'this disposition'}</span>
                          </span>
                        )}
                        {followupDate && (
                          <button
                            type="button"
                            onClick={() => setFollowupDate('')}
                            className="text-[10px] text-slate-400 hover:text-rose-300 font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>`;

const r1 = `                    <div className="flex flex-col mb-2 gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Next Follow-up Date
                        </label>
                        {followupDate && (
                          <button
                            type="button"
                            onClick={() => setFollowupDate('')}
                            className="text-[10px] text-slate-400 hover:text-rose-300 font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {isFollowupMissing && (
                        <div className="w-full">
                          <span className="text-[10px] font-bold text-amber-400 inline-flex items-center gap-1.5 bg-amber-950/80 px-2 py-1 rounded border border-amber-500/50 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Required for {status === 'Busy' || status === 'No Answer' ? status : outcome || 'this disposition'}</span>
                          </span>
                        </div>
                      )}
                    </div>`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
