const fs = require('fs');
let code = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const t1 = `  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase();`;

const r1 = `  const filteredCompanies = companies.filter((c) => {
    if (c.is_deleted) return false;
    const q = searchQuery.toLowerCase();`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/CompanyModal.tsx', code);
