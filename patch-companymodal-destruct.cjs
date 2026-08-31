const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

content = content.replace(
  `  companyRelationships,`,
  `  industryTypes = [],\n  companyRelationships,`
);
content = content.replace(
  `  setCallLogs,`,
  `  setCallLogs,\n  setIndustryTypes,`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
