const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `  const validStatuses = useMemo(() => {
    return getStatusesForChannel(currentChannel).filter(s => s !== 'Scheduled' && s !== 'Scheduled / Planned');
  }, [currentChannel]);`;

const r1 = `  const validStatuses = useMemo(() => {
    return getStatusesForChannel(currentChannel);
  }, [currentChannel]);`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
