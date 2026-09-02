const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t1 = `                  status === 'Busy' ||
                  status === 'Scheduled' ||
                  outcome === 'Call Back Later' ||`;

const r1 = `                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||`;

const t2 = `                <input
                  type="datetime-local"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}`;

const r2 = `                <input
                  type="datetime-local"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  max={
                    status === 'Scheduled' || status === 'Scheduled / Planned' || status === 'Scheduled / Draft'
                      ? undefined
                      : getLocalDateTimeString()
                  }`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
