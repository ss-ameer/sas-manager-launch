const fs = require('fs');
let content = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

content = content.replace(
  `  callOutcomes = [],\n  setCallStatuses,`,
  `  callOutcomes = [],\n  callPurposes = [],\n  setCallStatuses,`
);

fs.writeFileSync('src/components/CallLogManager.tsx', content);
