const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const t = `            )}
          </div>
        </div>
      )}
            )}
            )}
          </div>
        </div>
      )}`;

const r = `            )}
          </div>
        </div>
      )}

      {/* VIEW 2: FULL CALL LOG HISTORY & SEARCH */}
      {subTab === 'log' && (
        <div className="space-y-4">
          {/* Faceted Search & Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                <Filter className="w-4 h-4" />
                <span>Faceted Search & Filters</span>
              </div>
              <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={\`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition \${
                    viewMode === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }\`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={\`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition \${
                    viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }\`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="relative md:col-span-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by company, contact, phone, notes..."
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              
              <div className="md:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  {activeStatuses.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-2">
                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Outcomes</option>
                  {activeOutcomes.map((oc) => (
                    <option key={oc} value={oc}>{oc}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={geographyFilter}
                  onChange={(e) => setGeographyFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Locations</option>
                  {(activeWorkspace.geography_options || []).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={historySortOrder}
                  onChange={(e) => setHistorySortOrder(e.target.value as 'newest' | 'oldest')}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Select All & Batch Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-500">
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      filteredHistoryLogs.length > 0 &&
                      filteredHistoryLogs.every((l) => l.id && selectedLogIds.includes(l.id))
                    }
                    onChange={(e) => {
                      const allIds = filteredHistoryLogs.map((l) => l.id!).filter(Boolean);
                      if (e.target.checked) {
                        setSelectedLogIds((prev) => Array.from(new Set([...prev, ...allIds])));
                      } else {
                        setSelectedLogIds((prev) => prev.filter((id) => !allIds.includes(id)));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Select All ({filteredHistoryLogs.length})</span>
                </label>
                {selectedLogIds.length > 0 && (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full font-mono">
                    {selectedLogIds.length} Selected
                  </span>
                )}
              </div>
              {selectedLogIds.length > 0 ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mr-1">Batch Actions:</span>
                  
                  <button
                    type="button"
                    onClick={() => {
                      console.log('Batch Reassign clicked for logs:', selectedLogIds);
                      triggerToast(\`Batch Reassign queued for \${selectedLogIds.length} logs\`, 'info');
                    }}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Users2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Reassign ({selectedLogIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (getUserWorkspaceRole(user, activeWorkspace?.id, activeWorkspace) === 'Viewer') {
                        triggerToast('Read-only viewers cannot delete records.', 'error');
                        return;
                      }
                      const confirmDelete = await askConfirm(
                        'Batch Delete Logs',
                        \`Are you sure you want to permanently delete \${selectedLogIds.length} log(s)? This action cannot be undone.\`,
                        true,
                        'Delete Logs',
                        'Cancel'
                      );
                      if (!confirmDelete) return;

                      try {
                        for (const id of selectedLogIds) {
                          await safeUpdateDoc('call_logs', id, {
                            is_deleted: true,
                            deleted_at: new Date().toISOString(),
                            deleted_by_uid: user?.uid || null,
                            deleted_by_name: user?.full_name || user?.username || 'Unknown'
                          });
                        }
                        if (setCallLogs) {
                          setCallLogs((prev) => prev.filter((l) => !selectedLogIds.includes(l.id!)));
                        }
                        triggerToast(\`Successfully deleted \${selectedLogIds.length} interaction log(s)\`, 'success');
                        setSelectedLogIds([]);
                      } catch (err: any) {
                        console.error('Error in batch delete:', err);
                        triggerToast('Failed to delete selected logs: ' + (err?.message || err), 'error');
                      }
                    }}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ({selectedLogIds.length})</span>
                  </button>
                </div>
              ) : (
                <span>Showing {filteredHistoryLogs.length} interaction logs</span>
              )}
            </div>
            
            {viewMode === 'card' ? (
              paginatedLogs.map((log) => {
                const isSuppressed = isEntrySuppressedByDNC(log);
                const handledBy = getWorkspaceInitials(
                  log.handled_by_team_member_name || log.logged_by || log.sales_person,
                  salespersons,
                  user,
                  activeWorkspace
                );
                const type = (log.interaction_type || 'call').toLowerCase();
                const isSelected = !!(log.id && selectedLogIds.includes(log.id));

                return (
                  <div
                    key={log.id}
                    className={\`group p-2 md:p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 \${
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
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
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
                          <span className="truncate">{log.contact_name || log.contact_phone || 'No Contact Info'}</span>
                          <span>•</span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {type === 'email' ? 'Email' : type === 'message' ? 'Message' : 'Call'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-1.5">
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {handledBy}
                      </span>
                      {canUserClickRecord(user, activeWorkspace?.id, activeWorkspace) ? (
                        <>
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
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                          Restricted View
                        </span>
                      )}
                    </div>
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
            
            {paginatedLogs.length === 0 && (
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
            )}
          </div>
        </div>
      )}`;

code = code.replace(t, r);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
