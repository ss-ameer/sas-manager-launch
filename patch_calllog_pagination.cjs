const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const t1 = `  const filteredHistoryLogs = useMemo(() => {`;
const r1 = `  const filteredHistoryLogs = useMemo(() => {`;

const t2 = `  return (
    <>
      <PageHeader`;
const r2 = `  // Pagination Logic
  const totalItems = filteredHistoryLogs.length;
  const paginatedLogs = useMemo(() => {
    if (itemsPerPage === 'All') return filteredHistoryLogs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredHistoryLogs.slice(start, start + itemsPerPage);
  }, [filteredHistoryLogs, currentPage, itemsPerPage]);

  return (
    <>
      <PageHeader`;

code = code.replace(t2, r2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
