const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const industryTypesState = `  const [industryTypes, setIndustryTypes] = useState<DropdownOption[]>(() => {
    return getLocalCache('omni_industry_types', [
      { id: 'ind_0', name: 'Hospitality & Leisure' },
      { id: 'ind_1', name: 'Property & Facility Management' },
      { id: 'ind_2', name: 'Contracting & Construction' },
      { id: 'ind_3', name: 'Engineering & Utilities' },
      { id: 'ind_4', name: 'Manufacturing & Industrial' },
      { id: 'ind_5', name: 'Trading, Wholesale & Distribution' },
      { id: 'ind_6', name: 'Government & Public Infrastructure' },
      { id: 'ind_7', name: 'Healthcare & Education' },
      { id: 'ind_8', name: 'Professional & Technical Services' },
      { id: 'ind_9', name: 'Other' }
    ]);
  });`;

content = content.replace(
  `  const [companyTemperatures, setCompanyTemperatures] = useState<DropdownOption[]>(() => {`,
  `${industryTypesState}\n  const [companyTemperatures, setCompanyTemperatures] = useState<DropdownOption[]>(() => {`
);

content = content.replace(
  `  useEffect(() => { setLocalCache('omni_company_temperatures', companyTemperatures); }, [companyTemperatures]);`,
  `  useEffect(() => { setLocalCache('omni_company_temperatures', companyTemperatures); }, [companyTemperatures]);\n  useEffect(() => { setLocalCache('omni_industry_types', industryTypes); }, [industryTypes]);`
);

content = content.replace(
  `    companyTemperatures: (() => void) | null;`,
  `    companyTemperatures: (() => void) | null;\n    industryTypes: (() => void) | null;`
);

content = content.replace(
  `    if (refs.companyTemperatures) { refs.companyTemperatures(); refs.companyTemperatures = null; }`,
  `    if (refs.companyTemperatures) { refs.companyTemperatures(); refs.companyTemperatures = null; }\n    if (refs.industryTypes) { refs.industryTypes(); refs.industryTypes = null; }`
);

const indSnapshot = `    if (!refs.industryTypes) {
      refs.industryTypes = onSnapshot(collection(db, 'dropdown_industry_types'), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as DropdownOption[];
        if (list.length > 0) setIndustryTypes(list.sort((a,b) => a.name.localeCompare(b.name)));
      });
    }`;

content = content.replace(
  `    if (!refs.companyTemperatures) {`,
  `${indSnapshot}\n    if (!refs.companyTemperatures) {`
);

fs.writeFileSync('src/App.tsx', content);
