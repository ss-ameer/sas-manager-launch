const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const oldBlockRegex = /paginatedLogs\.map\(\(log\) => \{[\s\S]*?\}\)\n            \) : \(/;

const newBlock = `paginatedLogs.map((log) => {
                const isSuppressed = isEntrySuppressedByDNC(log);
                const handledBy = getWorkspaceInitials(
                  log.handled_by_team_member_name || log.logged_by || log.sales_person,
                  salespersons,
                  user,
                  activeWorkspace
                );
                const type = (log.interaction_type || 'call').toLowerCase();
                const isSelected = !!(log.id && selectedLogIds.includes(log.id));

                const company = companies?.find(c => c.id === log.company_id);
                const temp = company?.temperature || 'Cold';
                let TempIcon = Snowflake;
                let tempColorClass = 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400';
                if (temp === 'Hot') {
                  TempIcon = Flame;
                  tempColorClass = 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400';
                } else if (temp === 'Warm') {
                  TempIcon = Sun;
                  tempColorClass = 'text-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400';
                }

                let ChannelIcon = Phone;
                if (type === 'email') ChannelIcon = Mail;
                else if (type === 'message') ChannelIcon = MessageSquare;

                return (
                  <div
                    key={log.id}
                    className={\`group p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 \${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-300 dark:bg-blue-950/20 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                    }\`}
                  >
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(chk) => {
                          if (!log.id) return;
                          if (chk.target.checked) {
                            setSelectedLogIds((prev) => [...prev, log.id!]);
                          } else {
                            setSelectedLogIds((prev) => prev.filter((id) => id !== log.id));
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span 
                            className={\`text-sm font-semibold truncate hover:text-blue-600 transition cursor-pointer \${log.company_name ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'}\`}
                            onClick={() => {
                              if (log.company_id && onOpen360) {
                                onOpen360(log.company_id);
                              }
                            }}
                          >
                            {getResolvedCompanyName(log) || 'Unlinked Account'}
                          </span>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {formatActivityDate(log.date || log.createdAt)}
                          </span>
                          {isSuppressed && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-2.5 h-2.5 mr-1" />
                              DNC
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-1">
                          <span className={\`truncate \${log.status === 'Invalid Number' ? 'line-through text-red-400' : ''}\`}>
                            {log.contact_name || log.contact_phone || 'No Contact Info'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={\`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border \${
                            isSuccessStatus(log.status)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }\`}>
                            {log.status}
                          </span>
                          {log.outcome && (
                            <span className="text-[10px] text-slate-500 font-medium">→ {log.outcome}</span>
                          )}
                        </div>
                      </div>
                    </div>
                      
                    <div className="flex items-center justify-end space-x-2 w-full md:w-auto">
                      {/* Visual Metadata Cluster */}
                      <div className="flex items-center space-x-1 mr-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold" title={\`Handled by \${handledBy}\`}>
                          {handledBy}
                        </div>
                        <div className={\`w-8 h-8 rounded-full flex items-center justify-center \${tempColorClass}\`} title={\`Temperature: \${temp}\`}>
                          <TempIcon className="w-4 h-4" />
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400" title={\`Channel: \${type}\`}>
                          <ChannelIcon className="w-4 h-4" />
                        </div>
                      </div>

                      {canUserClickRecord(user, log, salespersons, activeWorkspace?.id) ? (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              setSelectedEntry(log);
                              setShowLogModal(true);
                            }}
                            title="View Details"
                            className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
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
                            <Edit3 className="w-4 h-4" />
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
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                          Restricted View
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (`;

if (oldBlockRegex.test(code)) {
  code = code.replace(oldBlockRegex, newBlock);
  fs.writeFileSync('src/components/CallLogManager.tsx', code);
  console.log("Replaced successfully!");
} else {
  console.log("Could not find block");
}
