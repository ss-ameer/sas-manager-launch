const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const t1 = `  const validStatuses = useMemo(() => {
    return getStatusesForChannel(currentChannel);
  }, [currentChannel]);`;

const r1 = `  const validStatuses = useMemo(() => {
    const isCall = currentChannel === 'Call' || currentChannel === 'Phone Call';
    return (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(currentChannel);
  }, [currentChannel, callStatuses]);`;

const t2 = `      const validStatuses = getStatusesForChannel(taskChan);`;
const r2 = `      const isCall = taskChan === 'Call' || taskChan === 'Phone Call';
      const validStatusesForDefault = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(taskChan);`;

const t3 = `      const defaultStatus = validStatuses.find((s) => isSuccessStatus(s)) || validStatuses[0] || 'Completed / Connected';`;
const r3 = `      const defaultStatus = validStatusesForDefault.find((s) => isSuccessStatus(s)) || validStatusesForDefault[0] || 'Completed / Connected';`;

const t4 = `    const newStatuses = getStatusesForChannel(newChan);`;
const r4 = `    const isCall = newChan === 'Call' || newChan === 'Phone Call';
    const newStatuses = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(newChan);`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
code = code.replace(t4, r4);
fs.writeFileSync('src/components/LiveExecutionModal.tsx', code);
