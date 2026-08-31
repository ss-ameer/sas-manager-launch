const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsHub.tsx', 'utf8');

content = content.replace(
  `  setCallOutcomes,
  setCompanyRelationships,
  setCompanyTemperatures,`,
  `  setCallOutcomes,
  setCallPurposes,
  setCompanyRelationships,
  setIndustryTypes,
  setCompanyTemperatures,`
);

fs.writeFileSync('src/components/SettingsHub.tsx', content);
