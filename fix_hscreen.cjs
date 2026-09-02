const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/h-screen/g, 'h-[100dvh]');
  fs.writeFileSync(file, code);
}

fix('src/components/EnquiryDetail.tsx');
fix('src/components/Sidebar.tsx');
