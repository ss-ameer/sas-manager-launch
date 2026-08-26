const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryForm.tsx', 'utf8');

code = code.replace(
  `const suf = unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC';`,
  `const suf = unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later';`
);

code = code.replace(
  `value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC'}`,
  `value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later'}`
);

code = code.replace(
  `value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC'}`,
  `value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later'}`
);

fs.writeFileSync('src/components/EnquiryForm.tsx', code);
