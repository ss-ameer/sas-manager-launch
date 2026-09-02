const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t3 = `      const isCurScheduled = finalStatus === 'Scheduled' || finalStatus === 'Scheduled / Planned' || finalStatus?.toLowerCase().includes('scheduled');
      if (drawerMode === 'execute' || finalStatus === 'Completed' || (!isCurScheduled && drawerMode !== 'edit')) {
        finalStatus = (status && status !== 'Scheduled / Planned' && status !== 'Scheduled') ? status : 'Completed';
        completedAtIso = nowIso;
      }`;

const r3 = `      const isCurScheduled = finalStatus === 'Scheduled' || finalStatus === 'Scheduled / Planned' || finalStatus?.toLowerCase().includes('scheduled');
      if (!isCurScheduled && (drawerMode === 'execute' || finalStatus === 'Completed' || drawerMode !== 'edit')) {
        finalStatus = (status && status !== 'Scheduled / Planned' && status !== 'Scheduled' && !status.toLowerCase().includes('scheduled')) ? status : 'Completed';
        completedAtIso = nowIso;
      }`;

code = code.replace(t3, r3);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
