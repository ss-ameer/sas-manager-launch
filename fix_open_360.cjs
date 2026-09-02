const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

code = code.replace(/onOpen360\(log\.company_id\)/g, 'setSelected360CompanyId(log.company_id)');
code = code.replace(/if \(log\.company_id && onOpen360\)/g, 'if (log.company_id)');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
