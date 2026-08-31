const fs = require('fs');
let content = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');
content = content.replace(
  `        industryTypes={industryTypes}\n        industryTypes={industryTypes}`,
  `        industryTypes={industryTypes}`
);
fs.writeFileSync('src/components/CallLogManager.tsx', content);
