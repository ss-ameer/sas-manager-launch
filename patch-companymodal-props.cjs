const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

content = content.replace(
  `  companyRelationships?: DropdownOption[];`,
  `  industryTypes?: DropdownOption[];\n  companyRelationships?: DropdownOption[];`
);
content = content.replace(
  `  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;`,
  `  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;\n  setIndustryTypes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;`
);

content = content.replace(
  `  companyRelationships = [],`,
  `  industryTypes = [],\n  companyRelationships = [],`
);
content = content.replace(
  `  setCallLogs,`,
  `  setCallLogs,\n  setIndustryTypes,`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
