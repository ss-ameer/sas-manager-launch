const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

if (!code.includes('LayoutGrid')) {
  code = code.replace("import {\\n  Phone,", "import {\\n  LayoutGrid,\\n  List,\\n  Phone,");
  fs.writeFileSync('src/components/CallLogManager.tsx', code);
}
