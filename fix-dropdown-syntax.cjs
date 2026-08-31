const fs = require('fs');
let content = fs.readFileSync('src/components/DropdownSettingsManager.tsx', 'utf8');

content = content.replace(
  `          } else if (activeSubTab === 'temperatures' && setCompanyTemperatures) {`,
  `          }\n        } else if (activeSubTab === 'temperatures' && setCompanyTemperatures) {`
);

fs.writeFileSync('src/components/DropdownSettingsManager.tsx', content);
