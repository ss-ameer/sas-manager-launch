const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

if (!code.includes('Flame')) {
  code = code.replace(/List,/g, 'List,\n  Flame,\n  Sun,\n  Cloud,\n  Snowflake,');
}

fs.writeFileSync('src/components/CallLogManager.tsx', code);
