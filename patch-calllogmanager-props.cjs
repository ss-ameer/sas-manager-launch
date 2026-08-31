const fs = require('fs');
let content = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

// Interface
content = content.replace(
  `  companyRelationships?: DropdownOption[];`,
  `  companyRelationships?: DropdownOption[];\n  industryTypes?: DropdownOption[];`
);

// Destructuring
content = content.replace(
  `  companyRelationships = [],`,
  `  companyRelationships = [],\n  industryTypes = [],`
);

// Passing to QuickActivityDrawer
content = content.replace(
  `        callStatuses={callStatuses}\n        callOutcomes={callOutcomes}\n        callPurposes={callPurposes}`,
  `        callStatuses={callStatuses}\n        callOutcomes={callOutcomes}\n        callPurposes={callPurposes}\n        industryTypes={industryTypes}`
);

// And wait, what about the main modal one at the bottom?
content = content.replace(
  `        callStatuses={callStatuses}\n        callOutcomes={callOutcomes}\n        callPurposes={callPurposes}`,
  `        callStatuses={callStatuses}\n        callOutcomes={callOutcomes}\n        callPurposes={callPurposes}\n        industryTypes={industryTypes}`
);

fs.writeFileSync('src/components/CallLogManager.tsx', content);
