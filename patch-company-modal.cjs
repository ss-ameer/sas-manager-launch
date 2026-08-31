const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

// Fix titles
content = content.replace(
  /<span>Add Canonical Company<\/span>/g,
  '<span>Add Company</span>'
);

content = content.replace(
  /\{editingCompany \? 'Edit Canonical Company' : 'Add Canonical Company'\}/g,
  "{editingCompany ? 'Edit Company' : 'Add Company'}"
);

// Fix grid layout and heights
content = content.replace(
  /<div className="grid grid-cols-3 gap-4">/g,
  '<div className="grid grid-cols-3 gap-4 items-end">'
);

// In CreatableCombobox className
content = content.replace(
  /className="w-full bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"/g,
  'className="w-full h-11 bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"'
);

// In select className
content = content.replace(
  /className="w-full bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans font-semibold cursor-pointer"/g,
  'className="w-full h-11 bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans font-semibold cursor-pointer"'
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
