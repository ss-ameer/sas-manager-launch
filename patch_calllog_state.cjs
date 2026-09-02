const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const target1 = `  const [subTab, setSubTab] = useState<'queue' | 'log'>(initialSubTab);`;
const replacement1 = `  const [subTab, setSubTab] = useState<'queue' | 'log'>(initialSubTab);
  
  // Table vs Card View
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(50);

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, outcomeFilter, geographyFilter]);`;

code = code.replace(target1, replacement1);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
