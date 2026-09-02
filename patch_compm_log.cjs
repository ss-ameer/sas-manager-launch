const fs = require('fs');
let code = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const t1 = `          onDelete={async (id) => {
            try {
              await safeDeleteDoc('call_logs', id);
              if (setCallLogs) {
                setCallLogs((prev) => prev.filter((cl) => cl.id !== id));
              }`;

const r1 = `          onDelete={async (id) => {
            try {
              await safeUpdateDoc('call_logs', id, {
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by_uid: user?.uid || null,
                deleted_by_name: user?.full_name || user?.username || 'Unknown'
              });
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((cl) => cl.id === id ? {
                  ...cl,
                  is_deleted: true,
                  deleted_at: new Date().toISOString(),
                  deleted_by_uid: user?.uid,
                  deleted_by_name: user?.full_name || user?.username || 'Unknown'
                } : cl));
              }`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/CompanyModal.tsx', code);
