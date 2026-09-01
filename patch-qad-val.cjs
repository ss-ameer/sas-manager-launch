const fs = require('fs');
let qad = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

qad = qad.replace(
  "    if (isAsync || (outcome && (!isSuccessStatus(activeStatus) || !OUTCOMES.includes(outcome as any)))) {",
  `    const validOutcomes = callOutcomes?.length ? callOutcomes.map(o => o.name) : OUTCOMES;
    if (isAsync || (outcome && (!isSuccessStatus(activeStatus) || !validOutcomes.includes(outcome as any)))) {`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', qad);
