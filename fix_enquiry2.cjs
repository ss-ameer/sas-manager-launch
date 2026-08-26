const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryForm.tsx', 'utf8');

code = code.replace(
  `legalSuffix: data.legal_suffix || 'LLC',`,
  `legalSuffix: data.legal_suffix || 'None / To Be Added Later',`
);

fs.writeFileSync('src/components/EnquiryForm.tsx', code);
