const fs = require('fs');
let content = fs.readFileSync('src/components/DropdownSettingsManager.tsx', 'utf8');

// For editing form
const editSentimentHTML = `
                          {activeSubTab === 'outcomes' && (
                            <div className="flex items-center space-x-2 pt-1 border-t border-slate-200">
                              <span className="text-[10px] text-slate-400 font-mono">Sentiment:</span>
                              <select 
                                value={editingSentiment} 
                                onChange={(e) => setEditingSentiment(e.target.value as any)}
                                className="bg-white border border-slate-300 rounded text-[10px] text-slate-800 focus:outline-none p-1"
                              >
                                <option value="positive">Positive (🟢)</option>
                                <option value="neutral">Neutral (🟡)</option>
                                <option value="negative">Negative (🔴)</option>
                              </select>
                            </div>
                          )}`;

content = content.replace(
  `                          {showColorPicker && (`,
  editSentimentHTML + `\n                          {showColorPicker && (`
);

// For new option form
const addSentimentHTML = `
            {activeSubTab === 'outcomes' && (
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Sentiment Category
                </label>
                <select
                  disabled={!isAdmin}
                  value={newOptionSentiment}
                  onChange={(e) => setNewOptionSentiment(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none font-mono cursor-pointer"
                >
                  <option value="positive">Positive (🟢 Wins / Advancements)</option>
                  <option value="neutral">Neutral (🟡 In-Progress / Ongoing)</option>
                  <option value="negative">Negative (🔴 Losses / Objections)</option>
                </select>
              </div>
            )}`;

content = content.replace(
  `            {showColorPicker && (`,
  addSentimentHTML + `\n\n            {showColorPicker && (`
);

fs.writeFileSync('src/components/DropdownSettingsManager.tsx', content);
