const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  `              companyRelationships={companyRelationships}`,
  `              companyRelationships={companyRelationships}\n              industryTypes={industryTypes}`
);

fs.writeFileSync('src/App.tsx', content);
