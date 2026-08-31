const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsHub.tsx', 'utf8');

content = content.replace(
  `  setCompanyRelationships?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;`,
  `  setCompanyRelationships?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;\n  setIndustryTypes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;`
);

content = content.replace(
  `            setCompanyRelationships={setCompanyRelationships}\n            setCompanyTemperatures={setCompanyTemperatures}`,
  `            setCompanyRelationships={setCompanyRelationships}\n            setIndustryTypes={setIndustryTypes}\n            setCompanyTemperatures={setCompanyTemperatures}`
);

fs.writeFileSync('src/components/SettingsHub.tsx', content);
