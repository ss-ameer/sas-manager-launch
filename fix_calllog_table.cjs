const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');
code = code.replace(
  'className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto"',
  'className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto"'
);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
