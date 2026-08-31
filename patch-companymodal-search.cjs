const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

content = content.replace(
  `      (c.relationship && c.relationship.toLowerCase().includes(q)) ||`,
  `      (c.industry_type && c.industry_type.toLowerCase().includes(q)) ||\n      (c.relationship && c.relationship.toLowerCase().includes(q)) ||`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
