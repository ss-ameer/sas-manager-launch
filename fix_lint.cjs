const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

// fix List import
code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, (match, group1) => {
  if (!group1.includes('List')) {
    return 'import {' + group1 + ', List} from "lucide-react";';
  }
  return match;
});

// fix canUserClickRecord
code = code.replace(/canUserClickRecord\(user, activeWorkspace\?\.id, activeWorkspace\)/g, 'canUserClickRecord(user, log, salespersons, activeWorkspace?.id)');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
