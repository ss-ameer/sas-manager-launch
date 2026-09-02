const fs = require('fs');
let code = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

const t2 = `              {(() => {
                const isFollowupEncouraged =
                  status === 'No Answer' ||
                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||
                  outcome === 'Line Busy' ||
                  outcome === 'No Answer' ||
                  outcome === 'Follow-Up Scheduled';`;

const r2 = `              {(() => {
                const isCurScheduled = status === 'Scheduled' || status === 'Scheduled / Planned' || status === 'Scheduled / Draft';
                const isFollowupEncouraged =
                  isCurScheduled ||
                  status === 'No Answer' ||
                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||
                  outcome === 'Line Busy' ||
                  outcome === 'No Answer' ||
                  outcome === 'Follow-Up Scheduled';`;

code = code.replace(t2, r2);
fs.writeFileSync('src/components/QuickActivityDrawer.tsx', code);
