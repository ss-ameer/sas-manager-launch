const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `                <input
                  type="datetime-local"
                  id="next-followup-datetime"
                  value={nextFollowUpDate}`;

const r1 = `                <input
                  type="datetime-local"
                  id="next-followup-datetime"
                  required={resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus)}
                  value={nextFollowUpDate}`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
