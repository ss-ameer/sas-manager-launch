const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryForm.tsx', 'utf8');

code = code.replace(
  `const [subLegalSuffix, setSubLegalSuffix] = useState('LLC');`,
  `const [subLegalSuffix, setSubLegalSuffix] = useState('None / To Be Added Later');`
);

code = code.replace(
  `legalSuffix: companyMatched.legal_suffix || 'LLC',`,
  `legalSuffix: companyMatched.legal_suffix || 'None / To Be Added Later',`
);

code = code.replace(
  `setSubLegalSuffix(data.legal_suffix || 'LLC');`,
  `setSubLegalSuffix(data.legal_suffix || 'None / To Be Added Later');`
);

code = code.replace(
  `legal_suffix: 'LLC',`,
  `legal_suffix: 'None / To Be Added Later',`
);

code = code.replace(
  `setSubLegalSuffix(comp.legal_suffix || 'LLC');`,
  `setSubLegalSuffix(comp.legal_suffix || 'None / To Be Added Later');`
);

code = code.replace(
  `setSubLegalSuffix('LLC');`,
  `setSubLegalSuffix('None / To Be Added Later');`
);

code = code.replace(
  `{['LLC', 'FZE', 'FZCO', 'PJSC', 'JSC', 'Corp', 'Ltd', 'None / Other'].map((suf) => (`,
  `{['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (`
);

fs.writeFileSync('src/components/EnquiryForm.tsx', code);
