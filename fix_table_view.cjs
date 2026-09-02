const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const oldTableAction = `                            <button
                              onClick={() => {
                                setEditingLog(log);
                                setDrawerMode('edit');
                                if (onOpenActivityDrawer) {
                                  onOpenActivityDrawer({ channel: log.channel || 'Call', drawerMode: 'edit' });
                                } else {
                                  openNewLogModal();
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>`;

const newTableAction = `                          {canUserClickRecord(user, log, salespersons, activeWorkspace?.id) ? (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={() => {
                                    setSelectedEntry(log);
                                    setShowLogModal(true);
                                  }}
                                  title="View Details"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingLog(log);
                                    setDrawerMode('edit');
                                    if (onOpenActivityDrawer) {
                                      onOpenActivityDrawer({ 
                                        channel: log.channel || 'Call', 
                                        drawerMode: 'edit',
                                        existingLog: log,
                                        logToEdit: log,
                                        companyId: log.company_id
                                      });
                                    } else {
                                      openNewLogModal();
                                    }
                                  }}
                                  title="Edit"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {canEditOrDeleteRecord(user, log, activeWorkspace?.id) && (
                                  <button
                                    onClick={() => {
                                      if (onDelete) {
                                        onDelete(log.id!);
                                      }
                                    }}
                                    title="Delete"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 transition bg-slate-50 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">Restricted</span>
                            )}`;

if (code.includes(oldTableAction)) {
  code = code.replace(oldTableAction, newTableAction);
  fs.writeFileSync('src/components/CallLogManager.tsx', code);
  console.log("Table action replaced successfully!");
} else {
  console.log("Could not find table action block");
}
