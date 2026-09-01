const fs = require('fs');
let content = fs.readFileSync('src/components/DropdownSettingsManager.tsx', 'utf8');

// State Additions
content = content.replace(
  "  const [newOptionColor, setNewOptionColor] = useState('#64748b');",
  "  const [newOptionColor, setNewOptionColor] = useState('#64748b');\n  const [newOptionSentiment, setNewOptionSentiment] = useState<'positive' | 'neutral' | 'negative'>('neutral');"
);

content = content.replace(
  "  const [editingColor, setEditingColor] = useState('#64748b');",
  "  const [editingColor, setEditingColor] = useState('#64748b');\n  const [editingSentiment, setEditingSentiment] = useState<'positive' | 'neutral' | 'negative'>('neutral');"
);

// handleAddOption
content = content.replace(
  "      const res = await safeAddDoc(collectionName, { name: trimmed, color: newOptionColor });\n      const newId = res?.id || (prefix + '_' + Date.now());\n      const newOpt = { id: newId, name: trimmed, color: newOptionColor };",
  `      const payload: any = { name: trimmed, color: newOptionColor };
      if (activeSubTab === 'outcomes') payload.sentiment = newOptionSentiment;
      const res = await safeAddDoc(collectionName, payload);
      const newId = res?.id || (prefix + '_' + Date.now());
      const newOpt: any = { id: newId, name: trimmed, color: newOptionColor };
      if (activeSubTab === 'outcomes') newOpt.sentiment = newOptionSentiment;`
);

content = content.replace(
  "      setNewOptionColor('#64748b');",
  "      setNewOptionColor('#64748b');\n      setNewOptionSentiment('neutral');"
);

// edit mode initialization
content = content.replace(
  "                        setEditingName(opt.name);\n                        setEditingColor(opt.color || '#64748b');",
  "                        setEditingName(opt.name);\n                        setEditingColor(opt.color || '#64748b');\n                        setEditingSentiment(opt.sentiment || 'neutral');"
);

// handleSaveEdit
content = content.replace(
  "    const isColorChanged = editingColor !== opt.color;",
  "    const isColorChanged = editingColor !== opt.color;\n    const isSentimentChanged = activeSubTab === 'outcomes' && editingSentiment !== opt.sentiment;"
);

content = content.replace(
  "    if (!isNameChanged && !isColorChanged) {",
  "    if (!isNameChanged && !isColorChanged && !isSentimentChanged) {"
);

content = content.replace(
  "          batch.set(optionRef, { name: trimmedNewName, color: editingColor }, { merge: true });",
  `          const updatePayload: any = { name: trimmedNewName, color: editingColor };
          if (activeSubTab === 'outcomes') updatePayload.sentiment = editingSentiment;
          batch.set(optionRef, updatePayload, { merge: true });`
);

content = content.replace(
  "        } else if (activeSubTab === 'outcomes' && setCallOutcomes) {\n          setCallOutcomes((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));",
  "        } else if (activeSubTab === 'outcomes' && setCallOutcomes) {\n          setCallOutcomes((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor, sentiment: editingSentiment } : o)));"
);

fs.writeFileSync('src/components/DropdownSettingsManager.tsx', content);
