const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
content = content.replace(
  "export interface DropdownOption {\n  id: string;\n  name: string;\n  color?: string;\n}",
  "export interface DropdownOption {\n  id: string;\n  name: string;\n  color?: string;\n  sentiment?: 'positive' | 'neutral' | 'negative';\n}"
);
fs.writeFileSync('src/types.ts', content);
