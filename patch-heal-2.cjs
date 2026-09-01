const fs = require('fs');
let content = fs.readFileSync('src/utils/defaults.ts', 'utf8');

content = content.replace(
  `      if (existingByNameIndex !== -1) {
        const existingByName = list[existingByNameIndex];
        list[existingByNameIndex] = {
          ...existingByName,
          id: docId,
          color: existingByName.color || defColor
        };
        changed = true;
      } else {
        // Completely missing, append it!
        list.push({ id: docId, name: defName, color: defColor });
        changed = true;
      }`,
  `      if (existingByNameIndex !== -1) {
        const existingByName = list[existingByNameIndex];
        list[existingByNameIndex] = {
          ...existingByName,
          id: docId,
          color: existingByName.color || defColor,
          sentiment: existingByName.sentiment || defSentiment
        };
        changed = true;
      } else {
        // Completely missing, append it!
        list.push({
          id: docId,
          name: defName,
          ...(defColor ? { color: defColor } : {}),
          ...(defSentiment ? { sentiment: defSentiment } : {})
        });
        changed = true;
      }`
);

fs.writeFileSync('src/utils/defaults.ts', content);
