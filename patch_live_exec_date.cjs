const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);`;

const r1 = `  const [primaryActivityDate, setPrimaryActivityDate] = useState<string>('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);`;

const t2 = `      setCallStatus(defaultStatus);
      const validPurposes = getPurposesForChannel(taskChan);
      setPurpose(task.purpose || validPurposes[0] || 'Discovery / Validation');`;

const r2 = `      setCallStatus(defaultStatus);
      const validPurposes = getPurposesForChannel(taskChan);
      setPurpose(task.purpose || validPurposes[0] || 'Discovery / Validation');
      
      if (task.date) {
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

const t3 = `      const updatedTaskRecord: CallLogEntry = {
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

const r3 = `      const isCurScheduled = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(updatedStatus);
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

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
