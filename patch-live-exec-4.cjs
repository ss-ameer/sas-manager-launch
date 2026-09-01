const fs = require('fs');
let content = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

content = content.replace(
  `      } else if (callOutcome && !validOutcomes.includes(callOutcome)) {
        setCallOutcome('');
      }`,
  `      } else if (callOutcome && !isSuccessStatus(callStatus)) {
        setCallOutcome('');
      }`
);

fs.writeFileSync('src/components/LiveExecutionModal.tsx', content);
