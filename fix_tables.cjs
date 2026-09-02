const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(
    /className="overflow-x-auto/g,
    'className="w-full overflow-x-auto'
  );
  fs.writeFileSync(file, code);
}

fix('src/components/CompanyModal.tsx');
fix('src/components/CallLogManager.tsx');
