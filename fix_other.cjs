const fs = require('fs');

let cm = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');
cm = cm.replace(
  `const [legalSuffix, setLegalSuffix] = useState<LegalSuffix>('LLC');`,
  `const [legalSuffix, setLegalSuffix] = useState<LegalSuffix>('None / To Be Added Later');`
);
fs.writeFileSync('src/components/CompanyModal.tsx', cm);

let qa = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');
qa = qa.replace(
  `const [expressLegalSuffix, setExpressLegalSuffix] = useState<string>('LLC');`,
  `const [expressLegalSuffix, setExpressLegalSuffix] = useState<string>('None / To Be Added Later');`
);
qa = qa.replace(
  `legal_suffix: expressLegalSuffix || 'LLC',`,
  `legal_suffix: expressLegalSuffix || 'None / To Be Added Later',`
);
qa = qa.replace(
  `<option value="LLC">LLC</option>`,
  `<option value="None / To Be Added Later">None / To Be Added Later</option>\n                        <option value="LLC">LLC</option>`
);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', qa);

