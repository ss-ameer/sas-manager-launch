const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const target1 = `                    max={
                      ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus)
                        ? undefined
                        : todayStr
                    }`;

const replacement1 = `                    max={todayStr}`;

const target2 = `                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Schedule Next Follow-Up Date (Optional)
                </label>
                <input
                  type="date"
                  value={logFormFollowupDate}`;

const replacement2 = `                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus) 
                    ? 'Scheduled Target Date *' 
                    : 'Schedule Next Follow-Up Date (Optional)'}
                </label>
                <input
                  type="date"
                  required={['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus)}
                  value={logFormFollowupDate}`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
