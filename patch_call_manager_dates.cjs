const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const target1 = `        // Overdue first (isTaskOverdue)
        const isAOverdue = isTaskOverdue(a.date);
        const isBOverdue = isTaskOverdue(b.date);
        if (isAOverdue && !isBOverdue) return -1;
        if (!isAOverdue && isBOverdue) return 1;

        const timeA = parseTaskScheduledDate(a.date)?.getTime() || 0;
        const timeB = parseTaskScheduledDate(b.date)?.getTime() || 0;`;

const replacement1 = `        // Overdue first (isTaskOverdue)
        const dateA = a.next_followup_date || a.date;
        const dateB = b.next_followup_date || b.date;
        const isAOverdue = isTaskOverdue(dateA);
        const isBOverdue = isTaskOverdue(dateB);
        if (isAOverdue && !isBOverdue) return -1;
        if (!isAOverdue && isBOverdue) return 1;

        const timeA = parseTaskScheduledDate(dateA)?.getTime() || 0;
        const timeB = parseTaskScheduledDate(dateB)?.getTime() || 0;`;

const target2 = `  const queueItems = useMemo(() => {
    let base = allScheduledQueueItems;
    if (queueTimeframe === 'today') {
      base = allScheduledQueueItems.filter((i) => isTaskDueTodayOrOverdue(i.date));
    } else if (queueTimeframe === 'upcoming') {
      base = allScheduledQueueItems.filter((i) => isTaskUpcoming(i.date));
    }
    return [...base].sort((a, b) => {
      const timeA = parseTaskScheduledDate(a.date)?.getTime() || 0;
      const timeB = parseTaskScheduledDate(b.date)?.getTime() || 0;`;

const replacement2 = `  const queueItems = useMemo(() => {
    let base = allScheduledQueueItems;
    if (queueTimeframe === 'today') {
      base = allScheduledQueueItems.filter((i) => isTaskDueTodayOrOverdue(i.next_followup_date || i.date));
    } else if (queueTimeframe === 'upcoming') {
      base = allScheduledQueueItems.filter((i) => isTaskUpcoming(i.next_followup_date || i.date));
    }
    return [...base].sort((a, b) => {
      const timeA = parseTaskScheduledDate(a.next_followup_date || a.date)?.getTime() || 0;
      const timeB = parseTaskScheduledDate(b.next_followup_date || b.date)?.getTime() || 0;`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
