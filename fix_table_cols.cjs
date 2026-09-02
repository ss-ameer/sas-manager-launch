const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const oldTableCols = `<td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                            {getResolvedCompanyName(log) || 'Unlinked'}
                          </td>
                          <td className="px-4 py-3">
                            {log.contact_name || log.contact_phone || '-'}
                          </td>`;

const newTableCols = `<td 
                            className={\`px-4 py-3 font-semibold hover:text-blue-600 transition cursor-pointer \${log.company_name ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'}\`}
                            onClick={() => {
                              if (log.company_id && onOpen360) {
                                onOpen360(log.company_id);
                              }
                            }}
                          >
                            {getResolvedCompanyName(log) || 'Unlinked'}
                          </td>
                          <td className={\`px-4 py-3 \${log.status === 'Invalid Number' ? 'line-through text-red-400' : ''}\`}>
                            {log.contact_name || log.contact_phone || '-'}
                          </td>`;

if (code.includes(oldTableCols)) {
  code = code.replace(oldTableCols, newTableCols);
  fs.writeFileSync('src/components/CallLogManager.tsx', code);
  console.log("Table cols replaced successfully!");
} else {
  console.log("Could not find table cols block");
}
