const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryList.tsx', 'utf8');
code = code.replace(
  '<div className="overflow-x-auto">',
  '<div className="w-full overflow-x-auto">'
);
fs.writeFileSync('src/components/EnquiryList.tsx', code);
