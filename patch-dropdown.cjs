const fs = require('fs');
let content = fs.readFileSync('src/components/DropdownSettingsManager.tsx', 'utf8');

// Props
content = content.replace(
  `  companyTemperatures?: DropdownOption[];`,
  `  industryTypes?: DropdownOption[];\n  companyTemperatures?: DropdownOption[];`
);
content = content.replace(
  `  setCompanyTemperatures?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;`,
  `  setIndustryTypes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;\n  setCompanyTemperatures?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;`
);

// Destructuring
content = content.replace(
  `  companyTemperatures = [],`,
  `  industryTypes = [],\n  companyTemperatures = [],`
);
content = content.replace(
  `  setCompanyTemperatures,`,
  `  setIndustryTypes,\n  setCompanyTemperatures,`
);

// activeSubTab
content = content.replace(
  `const [activeSubTab, setActiveSubTab] = useState<'sources' | 'categories' | 'units' | 'statuses' | 'outcomes' | 'purposes' | 'relationships' | 'temperatures'>('categories');`,
  `const [activeSubTab, setActiveSubTab] = useState<'sources' | 'categories' | 'units' | 'statuses' | 'outcomes' | 'purposes' | 'relationships' | 'temperatures' | 'industry_types'>('categories');`
);

// getUsageCount
content = content.replace(
  `| 'temperatures' | 'purposes') => {`,
  `| 'temperatures' | 'purposes' | 'industry_types') => {`
);

content = content.replace(
  `    } else if (type === 'relationships') {
      return companies?.filter(c => c.relationship === optionName).length || 0;`,
  `    } else if (type === 'relationships') {
      return companies?.filter(c => c.relationship === optionName).length || 0;
    } else if (type === 'industry_types') {
      return companies?.filter(c => c.industry_type === optionName).length || 0;`
);

// activeList
content = content.replace(
  `    activeSubTab === 'temperatures' ? companyTemperatures :`,
  `    activeSubTab === 'industry_types' ? industryTypes :
    activeSubTab === 'temperatures' ? companyTemperatures :`
);

// isSystemOption
content = content.replace(
  `    if (type === 'relationships') return SYSTEM_COMPANY_RELATIONSHIPS.includes(optionName);`,
  `    if (type === 'relationships') return SYSTEM_COMPANY_RELATIONSHIPS.includes(optionName);
    if (type === 'industry_types') return false;` // Assuming no system protected industry types for deletion
);

// collectionName
content = content.replace(
  `    activeSubTab === 'temperatures' ? 'dropdown_company_temperatures' :`,
  `    activeSubTab === 'industry_types' ? 'dropdown_industry_types' :
    activeSubTab === 'temperatures' ? 'dropdown_company_temperatures' :`
);

// handleSaveEdit matchingCompanies
content = content.replace(
  `            } else if (activeSubTab === 'relationships') {
              const matchingCompanies = companies.filter(c => c.relationship === opt.name);
              matchingCompanies.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'companies', c.id);
                  batch.update(ref, { relationship: trimmedNewName });
                  updateCount++;
                }
              });`,
  `            } else if (activeSubTab === 'relationships') {
              const matchingCompanies = companies.filter(c => c.relationship === opt.name);
              matchingCompanies.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'companies', c.id);
                  batch.update(ref, { relationship: trimmedNewName });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'industry_types') {
              const matchingCompanies = companies.filter(c => c.industry_type === opt.name);
              matchingCompanies.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'companies', c.id);
                  batch.update(ref, { industry_type: trimmedNewName });
                  updateCount++;
                }
              });`
);

// handleSaveEdit State updates
content = content.replace(
  `        } else if (activeSubTab === 'relationships' && setCompanyRelationships) {
          setCompanyRelationships((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.relationship === opt.name ? { ...c, relationship: trimmedNewName } : c))
            );
          }
        }`,
  `        } else if (activeSubTab === 'relationships' && setCompanyRelationships) {
          setCompanyRelationships((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.relationship === opt.name ? { ...c, relationship: trimmedNewName } : c))
            );
          }
        } else if (activeSubTab === 'industry_types' && typeof setIndustryTypes !== 'undefined') {
          setIndustryTypes((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.industry_type === opt.name ? { ...c, industry_type: trimmedNewName } : c))
            );
          }`
);

// Tabs array
content = content.replace(
  `{ id: 'relationships', label: 'Company Relationships' },`,
  `{ id: 'industry_types', label: 'Industry Types' },
          { id: 'relationships', label: 'Company Relationships' },`
);

fs.writeFileSync('src/components/DropdownSettingsManager.tsx', content);
