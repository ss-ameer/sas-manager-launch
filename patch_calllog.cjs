const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const t1 = `                                  await safeDeleteDoc('call_logs', item.id);`;
const r1 = `                                  await safeUpdateDoc('call_logs', item.id, {
                                    is_deleted: true,
                                    deleted_at: new Date().toISOString(),
                                    deleted_by_uid: user?.uid || null,
                                    deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                  });`;

const t2 = `                          await safeDeleteDoc('call_logs', id);`;
const r2 = `                          await safeUpdateDoc('call_logs', id, {
                            is_deleted: true,
                            deleted_at: new Date().toISOString(),
                            deleted_by_uid: user?.uid || null,
                            deleted_by_name: user?.full_name || user?.username || 'Unknown'
                          });`;

const t3 = `                                  await safeDeleteDoc('call_logs', log.id);`;
const r3 = `                                  await safeUpdateDoc('call_logs', log.id, {
                                    is_deleted: true,
                                    deleted_at: new Date().toISOString(),
                                    deleted_by_uid: user?.uid || null,
                                    deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                  });`;

const t4 = `                    await safeDeleteDoc('call_logs', id);`;
const r4 = `                    await safeUpdateDoc('call_logs', id, {
                      is_deleted: true,
                      deleted_at: new Date().toISOString(),
                      deleted_by_uid: user?.uid || null,
                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                    });`;

const t5 = `            await safeDeleteDoc('call_logs', id);`;
const r5 = `            await safeUpdateDoc('call_logs', id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });`;


code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
code = code.replace(t4, r4);
code = code.replace(t5, r5);

const ts1 = `          setCallLogs((prev) => prev.filter((l) => l.id !== item.id));`;
const rs1 = `          setCallLogs((prev) => prev.map((l) => l.id === item.id ? {
            ...l,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : l));`;

const ts2 = `          setCallLogs((prev) => prev.filter((c) => !idsToDelete.includes(c.id!)));`;
const rs2 = `          setCallLogs((prev) => prev.map((c) => idsToDelete.includes(c.id!) ? {
            ...c,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : c));`;

const ts3 = `          setCallLogs((prev) => prev.filter((l) => l.id !== log.id));`;
const rs3 = `          setCallLogs((prev) => prev.map((l) => l.id === log.id ? {
            ...l,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : l));`;

const ts4 = `          setCallLogs((prev) => prev.filter((c) => !ids.includes(c.id!)));`;
const rs4 = `          setCallLogs((prev) => prev.map((c) => ids.includes(c.id!) ? {
            ...c,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : c));`;

const ts5 = `          setCallLogs((prev) => prev.filter((l) => l.id !== id));`;
const rs5 = `          setCallLogs((prev) => prev.map((l) => l.id === id ? {
            ...l,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : l));`;

code = code.replace(ts1, rs1);
code = code.replace(ts2, rs2);
code = code.replace(ts3, rs3);
code = code.replace(ts4, rs4);
code = code.replace(ts5, rs5);


fs.writeFileSync('src/components/CallLogManager.tsx', code);
