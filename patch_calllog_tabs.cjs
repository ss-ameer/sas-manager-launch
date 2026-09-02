const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const target1 = `                <span>Today ({allScheduledQueueItems.filter(i => isTaskDueTodayOrOverdue(i.date)).length})</span>`;
const replacement1 = `                <span>Today ({allScheduledQueueItems.filter(i => isTaskDueTodayOrOverdue(i.next_followup_date || i.date)).length})</span>`;

const target2 = `                <span>Upcoming ({allScheduledQueueItems.filter(i => isTaskUpcoming(i.date)).length})</span>`;
const replacement2 = `                <span>Upcoming ({allScheduledQueueItems.filter(i => isTaskUpcoming(i.next_followup_date || i.date)).length})</span>`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
