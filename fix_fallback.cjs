const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

code = code.replace(/openNewLogModal\(\);/g, 'setIsActivityDrawerOpen(true);');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
