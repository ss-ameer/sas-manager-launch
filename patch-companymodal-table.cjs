const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

// Table Headers
content = content.replace(
  `                          <th className="py-3.5 px-4">Company Name & City</th>\n                          <th className="py-3.5 px-4">Relationship & Temp</th>`,
  `                          <th className="py-3.5 px-4">Company Name & City</th>\n                          <th className="py-3.5 px-4">Industry / Type</th>\n                          <th className="py-3.5 px-4">Relationship & Temp</th>`
);

// Table Body row
content = content.replace(
  `                              <td className="py-4 px-4 whitespace-nowrap">\n                                <div className="flex flex-col gap-1.5 items-start">`,
  `                              <td className="py-4 px-4">\n                                <span className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-medium border border-slate-200 dark:border-slate-700 max-w-[150px] truncate" title={c.industry_type || '-'}>\n                                  {c.industry_type || '-'}\n                                </span>\n                              </td>\n                              <td className="py-4 px-4 whitespace-nowrap">\n                                <div className="flex flex-col gap-1.5 items-start">`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
