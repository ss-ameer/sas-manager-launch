const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// We also need to pass setIndustryTypes to SettingsHub if needed.
// CompanyModal needs industryTypes and setIndustryTypes.
// Let's add industryTypes={industryTypes} wherever companyTemperatures={companyTemperatures} is present.
// And setIndustryTypes={setIndustryTypes} wherever setCompanyTemperatures={setCompanyTemperatures} is present.

content = content.replace(
  /companyTemperatures=\{companyTemperatures\}/g,
  `industryTypes={industryTypes}\n            companyTemperatures={companyTemperatures}`
);

content = content.replace(
  /setCompanyTemperatures=\{setCompanyTemperatures\}/g,
  `setIndustryTypes={setIndustryTypes}\n            setCompanyTemperatures={setCompanyTemperatures}`
);

fs.writeFileSync('src/App.tsx', content);
