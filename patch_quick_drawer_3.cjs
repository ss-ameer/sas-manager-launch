const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t4 = `          id: activeLog.id,
          date: activityIsoDate,
          status: (status && status !== 'Scheduled / Planned' && status !== 'Scheduled') ? status : 'Completed',`;

const r4 = `          id: activeLog.id,
          date: activityIsoDate,
          status: finalStatus as any,`;

code = code.replace(t4, r4);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
