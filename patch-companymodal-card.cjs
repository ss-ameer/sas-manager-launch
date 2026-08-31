const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

content = content.replace(
  `                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {relVal}
                              </span>`,
  `                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {relVal}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {c.industry_type || '-'}
                              </span>`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
