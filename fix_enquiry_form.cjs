const fs = require('fs');
let code = fs.readFileSync('src/components/EnquiryForm.tsx', 'utf8');

code = code.replace(
  '<div className={`h-screen flex',
  '<div className={`h-[100dvh] flex'
);

fs.writeFileSync('src/components/EnquiryForm.tsx', code);
