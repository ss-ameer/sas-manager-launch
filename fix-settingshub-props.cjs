const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// The duplicate props are:
// setEnquirySources={setEnquirySources}
// setUnits={setUnits}
// setProductCategories={setProductCategories}
// setEnquirySources={setEnquirySources}
// setUnits={setUnits}
// setUnits={setUnits}
appContent = appContent.replace(
  /            setEnquirySources=\{setEnquirySources\}\n          setUnits=\{setUnits\}\n            setProductCategories=\{setProductCategories\}\n          setEnquirySources=\{setEnquirySources\}\n          setUnits=\{setUnits\}\n            setUnits=\{setUnits\}/g,
  `            setEnquirySources={setEnquirySources}
            setProductCategories={setProductCategories}
            setUnits={setUnits}`
);

fs.writeFileSync('src/App.tsx', appContent);

let settingsContent = fs.readFileSync('src/components/SettingsHub.tsx', 'utf8');
settingsContent = settingsContent.replace(
  /            callPurposes=\{callPurposes\}\n            callPurposes=\{callPurposes\}/g,
  `            callPurposes={callPurposes}`
);
fs.writeFileSync('src/components/SettingsHub.tsx', settingsContent);
