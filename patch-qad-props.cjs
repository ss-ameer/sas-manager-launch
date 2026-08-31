const fs = require('fs');
let content = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

// Interface
content = content.replace(
  `  callPurposes?: { name: string }[];`,
  `  callPurposes?: { name: string }[];\n  industryTypes?: { name: string }[];`
);

// Destructuring
content = content.replace(
  `  callPurposes = [],`,
  `  callPurposes = [],\n  industryTypes = [],`
);

// Add state for industry type
content = content.replace(
  `  const [expressCity, setExpressCity] = useState('');`,
  `  const [expressCity, setExpressCity] = useState('');\n  const [expressIndustryType, setExpressIndustryType] = useState('');`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', content);
