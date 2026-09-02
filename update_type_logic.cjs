const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

code = code.replace(/const type = \(log\.interaction_type \|\| 'call'\)\.toLowerCase\(\);/g, 
                    "const type = (log.channel || log.interaction_type || 'call').toLowerCase();");

fs.writeFileSync('src/components/CallLogManager.tsx', code);
