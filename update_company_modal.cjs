const fs = require('fs');
let code = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

// 1. Add List to lucide-react
code = code.replace(/LayoutGrid,/, 'LayoutGrid,\n  List,');

// 2. Replace the old search & filters block
const oldSearchBlockRegex = /\{\/\* Search & Filters \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
const newSearchBlock = `{/* Faceted Search & Filters */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                    <Filter className="w-4 h-4" />
                    <span>Faceted Search & Filters</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('cards')}
                      className={\`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition \${
                        companyViewStyle === 'cards' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }\`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('table')}
                      className={\`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition \${
                        companyViewStyle === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }\`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="relative md:col-span-8">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search companies by canonical name, city, aliases, numbers, emails..."
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <select
                      value={relationshipFilter}
                      onChange={(e) => setRelationshipFilter(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                    >
                      <option value="ALL">All Relationships</option>
                      {(companyRelationships || []).map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <select
                      value={temperatureFilter}
                      onChange={(e) => setTemperatureFilter(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                    >
                      <option value="ALL">All Temperatures</option>
                      {(companyTemperatures || []).map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>`;

code = code.replace(oldSearchBlockRegex, newSearchBlock);
fs.writeFileSync('src/components/CompanyModal.tsx', code);
