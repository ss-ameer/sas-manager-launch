const fs = require('fs');
let content = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

content = content.replace(
  `      const validOutcomes = getOutcomesForStatus(callStatus);
      
      const normChan = currentChannel.toLowerCase();`,
  `      const baseValidOutcomes = getOutcomesForStatus(callStatus);
      const validOutcomes = callOutcomes && callOutcomes.length > 0 ? callOutcomes.map(o => o.name) : baseValidOutcomes;
      
      const normChan = currentChannel.toLowerCase();`
);

fs.writeFileSync('src/components/LiveExecutionModal.tsx', content);
