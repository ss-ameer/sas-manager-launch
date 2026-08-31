const fs = require('fs');
let content = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

content = content.replace(
  `import { findDuplicateCompany, findDuplicateContact } from '../utils/fuzzyMatch';`,
  `import { findDuplicateCompany, findDuplicateContact } from '../utils/fuzzyMatch';\nimport { CreatableCombobox } from './CreatableCombobox';`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', content);
