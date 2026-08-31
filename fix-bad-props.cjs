const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Dashboard component duplicates
appContent = appContent.replace(
  /              setCallLogs=\{setCallLogs\}\n        callStatuses=\{callStatuses\}\n        callOutcomes=\{callOutcomes\}\n        callPurposes=\{callPurposes\}\n              setProducts=\{setProducts\}/g,
  `              setCallLogs={setCallLogs}
              setProducts={setProducts}`
);

// CompanyModal component duplicates
appContent = appContent.replace(
  /            setCallLogs=\{setCallLogs\}\n        callStatuses=\{callStatuses\}\n        callOutcomes=\{callOutcomes\}\n        callPurposes=\{callPurposes\}\n            activeWorkspace=\{activeWorkspace\}/g,
  `            setCallLogs={setCallLogs}
            activeWorkspace={activeWorkspace}`
);

// ContactModal component duplicates
appContent = appContent.replace(
  /            setCallLogs=\{setCallLogs\}\n        callStatuses=\{callStatuses\}\n        callOutcomes=\{callOutcomes\}\n        callPurposes=\{callPurposes\}\n            activeWorkspace=\{activeWorkspace\}/g,
  `            setCallLogs={setCallLogs}
            activeWorkspace={activeWorkspace}`
);

// SettingsHub component duplicates
appContent = appContent.replace(
  /            setCallLogs=\{setCallLogs\}\n        callStatuses=\{callStatuses\}\n        callOutcomes=\{callOutcomes\}\n        callPurposes=\{callPurposes\}\n            setAuditLogs=\{setAuditLogs\}/g,
  `            setCallLogs={setCallLogs}
            setAuditLogs={setAuditLogs}`
);

fs.writeFileSync('src/App.tsx', appContent);
