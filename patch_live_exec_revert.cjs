const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `  const [primaryActivityDate, setPrimaryActivityDate] = useState<string>('');`;
const r1 = ``;
code = code.replace(t1, r1);

const t2 = `      if (task.date) {
        const d = new Date(task.date);
        if (!isNaN(d.getTime())) {
          const offset = d.getTimezoneOffset() * 60000;
          const localIso = new Date(d.getTime() - offset).toISOString().slice(0, 16);
          setPrimaryActivityDate(localIso);
        } else {
          setPrimaryActivityDate('');
        }
      } else {
        setPrimaryActivityDate('');
      }`;
const r2 = ``;
code = code.replace(t2, r2);

const t3 = `      const isCurScheduled = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(updatedStatus);
      const computedDate = isCurScheduled && primaryActivityDate 
        ? new Date(primaryActivityDate).toISOString() 
        : (resolutionAction === 'complete' ? nowIso : task.date);

      const updatedTaskRecord: CallLogEntry = {
        ...task,
        company_name: activeContactId ? task.company_name : (task.company_name || task.unlinked_name),
        contact_id: activeContactId || task.contact_id,
        contact_name: activeContactName || task.contact_name,
        contact_phone: activeContactPhone || task.contact_phone || task.phone_number || task.phone,
        status: updatedStatus as CallStatus,
        outcome: updatedOutcome,
        requirement_notes: notes.trim(),
        purpose: purpose,
        date: computedDate,
        updatedAt: nowIso,`;

const r3 = `      const updatedTaskRecord: CallLogEntry = {
        ...task,
        company_name: activeContactId ? task.company_name : (task.company_name || task.unlinked_name),
        contact_id: activeContactId || task.contact_id,
        contact_name: activeContactName || task.contact_name,
        contact_phone: activeContactPhone || task.contact_phone || task.phone_number || task.phone,
        status: updatedStatus as CallStatus,
        outcome: updatedOutcome,
        requirement_notes: notes.trim(),
        purpose: purpose,
        date: resolutionAction === 'complete' ? nowIso : task.date,
        updatedAt: nowIso,`;
code = code.replace(t3, r3);

const t4 = `              {resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus) && (
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
              )}`;
const r4 = ``;
code = code.replace(t4, r4);

const t5 = `                    <span>Next Follow-Up Date & Time (Optional Spawner)</span>`;
const r5 = `                    <span>
                      {resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus) 
                        ? 'Scheduled Date & Time (Spawner) *' 
                        : 'Next Follow-Up Date & Time (Optional Spawner)'}
                    </span>`;
code = code.replace(t5, r5);

fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
