const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

code = code.replace(/onClick=\{\(\) => \{\s*const confirmDelete = await/g, 'onClick={async () => {\n                                const confirmDelete = await');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
