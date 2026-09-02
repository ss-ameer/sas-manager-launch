const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const t1 = `{filteredHistoryLogs.map((log) => {`;
const r1 = `{viewMode === 'card' ? (
              paginatedLogs.map((log) => {`;

const t2 = `                  </div>
                </div>
              );
            })}
            {filteredHistoryLogs.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
                No call log entries match the search or filters.
              </div>
            )}`;

const r2 = `                  </div>
                </div>
              );
            })
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                  <thead className="bg-slate-50 dark:bg-slate-950/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Status / Outcome</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {paginatedLogs.map((log) => {
                      const isSelected = !!(log.id && selectedLogIds.includes(log.id));
                      const handledBy = getWorkspaceInitials(log.handled_by_team_member_name || log.logged_by || log.sales_person, salespersons, user, activeWorkspace);
                      
                      return (
                        <tr key={log.id} className={\`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition \${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}\`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(chk) => {
                                if (!log.id) return;
                                if (chk.target.checked) setSelectedLogIds(prev => [...prev, log.id!]);
                                else setSelectedLogIds(prev => prev.filter(id => id !== log.id));
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            {formatActivityDate(log.date || log.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                            {getResolvedCompanyName(log) || 'Unlinked'}
                          </td>
                          <td className="px-4 py-3">
                            {log.contact_name || log.contact_phone || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{log.status}</span>
                              <span className="text-[10px] text-slate-500">{log.outcome || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {handledBy}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
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
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {filteredHistoryLogs.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
                No call log entries match the search or filters.
              </div>
            )}
            
            {paginatedLogs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl mt-4 gap-4">
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}</span> to{' '}
                  <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}</span> of{' '}
                  <span className="font-bold text-slate-950 dark:text-slate-100">{totalItems}</span> logs
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemsPerPage(val === 'All' ? 'All' : Number(val));
                        setCurrentPage(1);
                      }}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value="All">All</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                    </button>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-[3rem] text-center">
                      {currentPage} / {itemsPerPage === 'All' ? 1 : Math.ceil(totalItems / itemsPerPage) || 1}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={itemsPerPage === 'All' || currentPage >= Math.ceil(totalItems / itemsPerPage)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
