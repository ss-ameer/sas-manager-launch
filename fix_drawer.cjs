const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

code = code.replace(
  /\.\.\.\(isDncOptOut \? \{ dnc: true, opt_out: true \} : \{\}\)/g,
  '...(isDncOptOut ? { dnc: true, opt_out: true, is_dnc: true } : { dnc: false, opt_out: false, is_dnc: false }) as any'
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
