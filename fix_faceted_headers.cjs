const fs = require('fs');

function fixHeader(file) {
  let code = fs.readFileSync(file, 'utf8');
  const target = '<div className="flex items-center justify-between mb-2">\n                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">';
  const replacement = '<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">\n                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">';
  if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(file, code);
    console.log('Fixed', file);
  }
}

fixHeader('src/components/CallLogManager.tsx');
fixHeader('src/components/CompanyModal.tsx');
