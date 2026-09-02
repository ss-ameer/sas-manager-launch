const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const inlineDeleteLogic = `
                                const confirmDelete = await askConfirm('Delete Interaction Log', 'Are you sure you want to delete this interaction log? It will be moved to the Trash Bin.', true, 'Delete', 'Cancel');
                                if (confirmDelete) {
                                  try {
                                    await safeUpdateDoc('call_logs', log.id!, {
                                      is_deleted: true,
                                      deleted_at: new Date().toISOString(),
                                      deleted_by_uid: user?.uid || null,
                                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                    });
                                    if (setCallLogs) {
                                      setCallLogs(prev => prev.filter(l => l.id !== log.id));
                                    }
                                    triggerToast('Log entry deleted successfully', 'success');
                                  } catch (err) {
                                    triggerToast('Failed to delete log entry', 'error');
                                  }
                                }
`;

code = code.replace(/if \(onDelete\) \{\s*onDelete\(log\.id!\);\s*\}/g, inlineDeleteLogic);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
