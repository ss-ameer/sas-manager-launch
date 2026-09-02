const fs = require('fs');
let code = fs.readFileSync('src/components/Company360Modal.tsx', 'utf8');

const t1 = `  const companyContacts = contacts.filter((c) => c.company_id === company.id);
  const companyCallLogs = callLogs.filter(
    (l) => l.company_id === company.id || (l.company_name && l.company_name.toLowerCase() === company.display_name.toLowerCase())
  );
  const companyEnquiries = enquiries.filter((e) => e.company_id === company.id);`;

const r1 = `  const companyContacts = contacts.filter((c) => !c.is_deleted && c.company_id === company.id);
  const companyCallLogs = callLogs.filter(
    (l) => !l.is_deleted && (l.company_id === company.id || (l.company_name && l.company_name.toLowerCase() === company.display_name.toLowerCase()))
  );
  const companyEnquiries = enquiries.filter((e) => !e.is_deleted && e.company_id === company.id);`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/Company360Modal.tsx', code);
