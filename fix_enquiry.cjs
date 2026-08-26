const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryForm.tsx', 'utf8');

code = code.replace(
  `      const suf = (unregisteredEntities.legalSuffix || 'LLC') as LegalSuffix;\n      const display_name = suf === 'None / Other' ? compName : \`\${compName} \${suf}\`;`,
  `      const suf = unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC';\n      const display_name = (suf === 'None / Other' || suf === 'None / To Be Added Later') ? compName : \`\${compName} \${suf}\`;`
);

const inputBlock1 = `<input
                            type="text"
                            value={unregisteredEntities.legalSuffix || 'LLC'}
                            onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                          />`;
const selectBlock1 = `<select
                            value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC'}
                            onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                          >
                            {['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (
                              <option key={suf} value={suf}>{suf}</option>
                            ))}
                          </select>`;

code = code.replace(inputBlock1, selectBlock1);

const inputBlock2 = `<input
                        type="text"
                        value={unregisteredEntities.legalSuffix || 'LLC'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                      />`;
const selectBlock2 = `<select
                        value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'LLC'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      >
                        {['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (
                          <option key={suf} value={suf}>{suf}</option>
                        ))}
                      </select>`;

code = code.replace(inputBlock2, selectBlock2);

fs.writeFileSync('src/components/EnquiryForm.tsx', code);
