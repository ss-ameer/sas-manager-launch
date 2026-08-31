const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsHub.tsx', 'utf8');

content = content.replace(
  `  companyTemperatures?: DropdownOption[];`,
  `  industryTypes?: DropdownOption[];\n  companyTemperatures?: DropdownOption[];`
);

content = content.replace(
  `  companyTemperatures = [],`,
  `  industryTypes = [],\n  companyTemperatures = [],`
);

content = content.replace(
  `            companyTemperatures={companyTemperatures}`,
  `            industryTypes={industryTypes}\n            companyTemperatures={companyTemperatures}`
);

fs.writeFileSync('src/components/SettingsHub.tsx', content);
