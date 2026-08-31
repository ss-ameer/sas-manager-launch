const fs = require('fs');
let content = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

content = content.replace(
  `  callPurposes = [],`,
  `  callPurposes = [],\n  industryTypes = [],`
);

fs.writeFileSync('src/components/CallLogManager.tsx', content);
