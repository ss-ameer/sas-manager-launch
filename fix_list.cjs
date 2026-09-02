const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

code = code.replace(/LayoutGrid,/, 'LayoutGrid,\n  List,');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
