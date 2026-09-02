const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');
code = code.replace(
  '<div className="flex items-center justify-between mb-2">\n              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">',
  '<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">\n              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">'
);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
