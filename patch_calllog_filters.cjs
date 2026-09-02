const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const filterTarget = `        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by company, contact, phone, notes..."
                className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="all">All Statuses</option>
                {activeStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="all">All Outcomes</option>
                {activeOutcomes.map((oc) => (
                  <option key={oc} value={oc}>
                    {oc}
                  </option>
                ))}
              </select>
              <select
                value={geographyFilter}
                onChange={(e) => setGeographyFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-semibold"
              >
                <option value="all">All Locations</option>
                {(activeWorkspace.geography_options || []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {/* History Sort Order */}
              <select
                value={historySortOrder}
                onChange={(e) => setHistorySortOrder(e.target.value as 'newest' | 'oldest')}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-semibold cursor-pointer"
              >
                <option value="newest">Date: Newest First</option>
                <option value="oldest">Date: Oldest First</option>
              </select>
            </div>
          </div>`;

const filterReplacement = `        <div className="space-y-4">
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
          </div>`;

code = code.replace(filterTarget, filterReplacement);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
