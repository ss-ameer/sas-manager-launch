const fs = require('fs');
let code = fs.readFileSync('src/components/UserManagementHub.tsx', 'utf8');

const t1 = `        (c.status === 'Scheduled' ||
          c.status === 'Follow-Up Required' ||
          Boolean(c.next_followup_date)) &&`;

const r1 = `        (['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(c.status) ||
          c.status === 'Follow-Up Required' ||
          Boolean(c.next_followup_date)) &&`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/UserManagementHub.tsx', code);

code = fs.readFileSync('src/components/SalespersonProfiles.tsx', 'utf8');
code = code.replace(t1, r1);
fs.writeFileSync('src/components/SalespersonProfiles.tsx', code);
