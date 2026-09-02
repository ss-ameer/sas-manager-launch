const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const t1 = `    (callLogs || []).forEach((l) => {
      const fDate = l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date;
      if (!fDate) return;
      const isClosed = ['Completed', 'Cancelled', 'Closed', 'Closed - Deal Made'].includes(l.status);
      if (isClosed) return;`;

const r1 = `    (callLogs || []).forEach((l) => {
      const isCurScheduled = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(l.status);
      const fDate = l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date || (isCurScheduled ? l.date : null);
      if (!fDate) return;
      const isClosed = ['Completed', 'Cancelled', 'Closed', 'Closed - Deal Made'].includes(l.status);
      if (isClosed && !isCurScheduled) return;`;

code = code.replace(t1, r1);

const t2 = `    const scheduled = filteredCallLogs.filter(
      (l) => l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date
    );`;

const r2 = `    const scheduled = filteredCallLogs.filter(
      (l) => l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date || ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(l.status)
    );`;

code = code.replace(t2, r2);

fs.writeFileSync('src/components/Dashboard.tsx', code);
