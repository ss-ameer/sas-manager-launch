const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const lines = code.split('\n');
lines[266] = "  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => (localStorage.getItem('callLogViewMode') as 'card' | 'table') || 'card');";
code = lines.join('\n');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
