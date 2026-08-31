const fs = require('fs');
let content = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const industryField = `                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                      Industry / Type
                    </label>
                    <CreatableCombobox
                      options={industryTypes.map(i => i.name)}
                      value={industryType}
                      onChange={(val: string) => setIndustryType(val)}
                      onCreateOption={async (val: string) => {
                        setIndustryType(val);
                        if (setIndustryTypes) {
                          try {
                            const docRef = await safeAddDoc('dropdown_industry_types', { name: val });
                            setIndustryTypes((prev) => {
                              if (prev.some(i => i.name.toLowerCase() === val.toLowerCase())) return prev;
                              return [...prev, { id: docRef?.id || ('ind_' + Date.now()), name: val }];
                            });
                          } catch (e) {
                            console.warn('Failed to save new industry type', e);
                          }
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      placeholder="e.g. Technology"
                    />
                  </div>`;

content = content.replace(
  `                <div className="grid grid-cols-2 gap-4">\n                  <div>\n                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">\n                      Relationship (Required)`,
  `${industryField}\n                  <div>\n                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">\n                      Relationship (Required)`
);

// We made it grid-cols-2 above, but now there are 3 fields (Industry, Relationship, Temperature).
// Let's wrap Relationship & Temperature in their own grid, or change to grid-cols-3.

content = content.replace(
  `                <div className="grid grid-cols-2 gap-4">\n                  <div>\n                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">\n                      Industry / Type`,
  `                <div className="grid grid-cols-3 gap-4">\n                  <div>\n                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">\n                      Industry / Type`
);

fs.writeFileSync('src/components/CompanyModal.tsx', content);
