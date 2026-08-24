const fs = require('fs');
let code = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const targetPhones = `{companyPhones.map((ph, idx) => {
                    const currentRestriction = getLineRestriction(editingRestrictedLines, ph.value);

                    return (
                      <div key={ph.id || idx} className="flex items-center space-x-2">
                        <CustomLabelSelect
                          value={ph.label}
                          onChange={(val) => {
                            setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                          }}
                          options={PHONE_LABEL_DEFAULT_OPTIONS}
                          className="w-36 shrink-0"
                        />
                        <input
                          type="text"
                          placeholder="Phone number..."
                          value={ph.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                          }}
                          className="flex-1 px-4 py-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-xl font-mono bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-w-0"
                        />`;

const replacePhones = `<datalist id="company-phone-tags">
                  <option value="Landline" />
                  <option value="Direct Line" />
                  <option value="Mobile" />
                  <option value="WhatsApp" />
                  <option value="Fax" />
                </datalist>
                {companyPhones.map((ph, idx) => {
                  const currentRestriction = getLineRestriction(editingRestrictedLines, ph.value);

                  return (
                    <div key={ph.id || idx} className="flex items-center space-x-2">
                      <input
                        list="company-phone-tags"
                        value={ph.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                        }}
                        placeholder="Tag"
                        className="w-28 sm:w-32 px-3 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shrink-0"
                      />
                      <input
                        type="text"
                        placeholder="Phone number..."
                        value={ph.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                        }}
                        className="flex-1 min-w-0 px-4 py-2.5 text-xs border border-slate-700 rounded-xl font-mono bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />`;

const targetEmails = `{companyEmails.map((em, idx) => (
                    <div key={em.id || idx} className="flex items-center space-x-2">
                      <CustomLabelSelect
                        value={em.label}
                        onChange={(val) => {
                          setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                        }}
                        options={EMAIL_LABEL_DEFAULT_OPTIONS}
                        className="w-36 shrink-0"
                      />
                      <input
                        type="email"
                        placeholder="Email address..."
                        value={em.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                        }}
                        className="flex-1 px-4 py-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />
                      {companyEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCompanyEmails(prev => prev.filter((_, i) => i !== idx))}
                          className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer"
                          title="Remove Email"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}`;

const replaceEmails = `<datalist id="company-email-tags">
                  <option value="Work" />
                  <option value="Main" />
                  <option value="Inquiries" />
                  <option value="Sales" />
                  <option value="Support" />
                </datalist>
                {companyEmails.map((em, idx) => (
                  <div key={em.id || idx} className="flex items-center space-x-2">
                    <input
                      list="company-email-tags"
                      value={em.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                      }}
                      placeholder="Tag"
                      className="w-28 sm:w-32 px-3 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shrink-0"
                    />
                    <input
                      type="email"
                      placeholder="Email address..."
                      value={em.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                      }}
                      className="flex-1 min-w-0 px-4 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                    {companyEmails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCompanyEmails(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer shrink-0"
                        title="Remove Email"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}`;

if (code.includes(targetPhones)) {
  code = code.replace(targetPhones, replacePhones);
  console.log("Phones replaced successfully");
} else {
  console.log("targetPhones NOT FOUND");
}

if (code.includes(targetEmails)) {
  code = code.replace(targetEmails, replaceEmails);
  console.log("Emails replaced successfully");
} else {
  console.log("targetEmails NOT FOUND");
}

fs.writeFileSync('src/components/CompanyModal.tsx', code);
