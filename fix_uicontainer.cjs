const fs = require('fs');
let code = fs.readFileSync('src/components/layout/UiContainer.tsx', 'utf8');
code = code.replace(
  'className={`bg-white rounded-2xl border border-slate-200 shadow-2xl ${paddingClasses[padding]} ${className}`}',
  'className={`bg-white rounded-2xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto ${paddingClasses[padding]} ${className}`}'
);
fs.writeFileSync('src/components/layout/UiContainer.tsx', code);
