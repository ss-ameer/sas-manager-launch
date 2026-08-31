const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

// State
content = content.replace(
  `  const [city, setCity] = useState('');`,
  `  const [city, setCity] = useState('');\n  const [industryType, setIndustryType] = useState<string>('');`
);

// Form reset
content = content.replace(
  `    setCity('');`,
  `    setCity('');\n    setIndustryType('');`
);

// Edit set
content = content.replace(
  `    setCity(company.city || '');`,
  `    setCity(company.city || '');\n    setIndustryType(company.industry_type || '');`
);

// Save mapping
content = content.replace(
  `      city: city.trim(),`,
  `      city: city.trim(),\n      industry_type: industryType.trim(),`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
