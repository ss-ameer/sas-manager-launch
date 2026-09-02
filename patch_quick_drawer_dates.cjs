const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const target1 = `                <input
                  type="datetime-local"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  max={
                    status === 'Scheduled' || status === 'Scheduled / Planned' || status === 'Scheduled / Draft'
                      ? undefined
                      : getLocalDateTimeString()
                  }
                  style={{ colorScheme: 'dark' }}`;

const replacement1 = `                <input
                  type="datetime-local"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  max={getLocalDateTimeString()}
                  style={{ colorScheme: 'dark' }}`;

const target2 = `              {(() => {
                const isFollowupEncouraged =
                  status === 'No Answer' ||
                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||
                  outcome === 'Follow-Up Scheduled';
                const isFollowupMissing = isFollowupEncouraged && !followupDate;`;

const replacement2 = `              {(() => {
                const isCurScheduled = status === 'Scheduled' || status === 'Scheduled / Planned' || status === 'Scheduled / Draft';
                const isFollowupEncouraged =
                  isCurScheduled ||
                  status === 'No Answer' ||
                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||
                  outcome === 'Follow-Up Scheduled';
                const isFollowupMissing = isFollowupEncouraged && !followupDate;`;

const target3 = `                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Next Follow-up Date
                        </label>`;

const replacement3 = `                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {isCurScheduled ? 'Scheduled Date & Time *' : 'Next Follow-up Date'}
                        </label>`;

const target4 = `                            <span>Required for {status === 'Busy' || status === 'No Answer' ? status : outcome || 'this disposition'}</span>`;

const replacement4 = `                            <span>Required for {isCurScheduled ? 'Scheduled tasks' : status === 'Busy' || status === 'No Answer' ? status : outcome || 'this disposition'}</span>`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
code = code.replace(target3, replacement3);
code = code.replace(target4, replacement4);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
