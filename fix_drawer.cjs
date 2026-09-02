const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

code = code.replace(
  'className="fixed inset-0 z-[100] overflow-hidden bg-slate-950/70 backdrop-blur-xs flex justify-end"',
  'className="fixed inset-0 z-[100] overflow-hidden bg-slate-950/70 backdrop-blur-xs flex justify-end items-end sm:items-start"'
);

code = code.replace(
  'className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full z-10 text-slate-100"',
  'className="relative w-full max-w-2xl bg-slate-900 sm:border-l border-t sm:border-t-0 border-slate-800 shadow-2xl flex flex-col h-[90vh] sm:h-full max-h-[90vh] sm:max-h-full rounded-t-2xl sm:rounded-none z-10 text-slate-100"'
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
