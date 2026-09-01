const fs = require('fs');
let qad = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

qad = qad.replace(
  /\{\(\(interactionChannel === 'Call' \|\| interactionChannel === 'Phone Call'\) && callStatuses\?\.length \? callStatuses\.map\(s => s\.name\) : getStatusesForChannel\(interactionChannel\)\)/g,
  `{(((interactionChannel === 'Call' || interactionChannel === 'Phone Call') && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel))`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', qad);
