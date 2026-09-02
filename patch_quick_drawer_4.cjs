const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t1 = `.filter(st => drawerMode === 'execute' ? (st !== 'Scheduled' && st !== 'Scheduled / Planned') : true)`;
const r1 = ``;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
