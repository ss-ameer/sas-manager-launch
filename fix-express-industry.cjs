const fs = require('fs');
let content = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

content = content.replace(
  `  const [expressCity, setExpressCity] = useState<string>('Dubai');`,
  `  const [expressCity, setExpressCity] = useState<string>('Dubai');\n  const [expressIndustryType, setExpressIndustryType] = useState<string>('');`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', content);
