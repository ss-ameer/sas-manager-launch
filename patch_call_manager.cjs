const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const t1 = `  const allScheduledQueueItems = useMemo(() => {
    return workspaceCallLogs
      .filter((entry) => {
        if (entry.status !== 'Scheduled' && entry.status !== 'Scheduled / Planned') return false;`;

const r1 = `  const allScheduledQueueItems = useMemo(() => {
    return workspaceCallLogs
      .filter((entry) => {
        if (!['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(entry.status)) return false;`;

const t2 = `                  <input
                    type="date"
                    required
                    value={logFormDate}
                    onChange={(e) => setLogFormDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}`;

const r2 = `                  <input
                    type="date"
                    required
                    value={logFormDate}
                    onChange={(e) => setLogFormDate(e.target.value)}
                    max={
                      ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus)
                        ? undefined
                        : todayStr
                    }
                    style={{ colorScheme: 'dark' }}`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
