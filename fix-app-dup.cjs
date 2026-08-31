const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  `              industryTypes={industryTypes}\n              industryTypes={industryTypes}`,
  `              industryTypes={industryTypes}`
);

fs.writeFileSync('src/App.tsx', content);
