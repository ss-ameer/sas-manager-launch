const fs = require('fs');
let lines = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8').split('\n');

let startQueueFix = lines.findIndex(l => l.includes('Execute Task'));
// Find the `})` for queueItems which was at 2011.
// And remove all the way to `</button>` for ChevronRight that was at 2133 or something.

let startDelete = -1;
let endDelete = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Execute Task')) {
    // skip down to `})`
    for (let j = i; j < i + 30; j++) {
      if (lines[j].trim() === '})') {
        startDelete = j;
        break;
      }
    }
  }
}

// Actually, let's just find `})` followed by `) : (` for the table
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '})' && lines[i+1].trim() === ') : (') {
    startDelete = i;
    for (let j = i; j < lines.length; j++) {
      // Find where we end the pagination injected code. The pagination code ends with `</div>`
      // But it replaced `{filteredHistoryLogs.length === 0 && (` block from the other place.
      // Wait, in my replacement:
      if (lines[j].includes('<ChevronRight className="w-4 h-4" />')) {
        endDelete = j + 4; // up to the closing `</div>`s
        break;
      }
    }
    break;
  }
}
console.log(startDelete, endDelete);

if (startDelete > -1 && endDelete > startDelete) {
  const replacement = `            })}
            {queueItems.length === 0 && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Queue is Clear!</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No scheduled calls are due today or overdue for this workspace. Use '+ Log / Schedule Call' to add new follow-ups.
                </p>
              </div>
            )}
          </div>
        </div>
      )}`;
  lines.splice(startDelete, endDelete - startDelete + 1, replacement);
  fs.writeFileSync('src/components/CallLogManager.tsx', lines.join('\n'));
} else {
  console.log('Failed to find chunk to remove.');
}

