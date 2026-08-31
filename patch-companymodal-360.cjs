const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

content = content.replace(
  `                      <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>REF: {getReferenceId('CMP', selectedCompany, companies)}</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {selectedCompany.relationship || 'Prospect'}
                      </span>`,
  `                      <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>REF: {getReferenceId('CMP', selectedCompany, companies)}</span>
                      </span>
                      {selectedCompany.industry_type && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {selectedCompany.industry_type}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {selectedCompany.relationship || 'Prospect'}
                      </span>`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
