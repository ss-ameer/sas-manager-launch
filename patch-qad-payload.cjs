const fs = require('fs');
let content = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

// JSX
const industryCombobox = `                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Industry / Type
                      </label>
                      <CreatableCombobox
                        options={industryTypes.map(i => i.name)}
                        value={expressIndustryType}
                        onChange={(val: string) => setExpressIndustryType(val)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                        placeholder="e.g. Technology"
                      />
                    </div>`;

content = content.replace(
  `                  {/* Relationship & Cycling Temperature Row */}\n                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">`,
  `                  {/* Relationship, Temperature, and Industry Row */}\n${industryCombobox}`
);

// Payload
content = content.replace(
  `              relationship: expressRelationship || 'Prospect',`,
  `              industry_type: expressIndustryType || undefined,\n              relationship: expressRelationship || 'Prospect',`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', content);
