const fs = require('fs');
let content = fs.readFileSync('src/utils/defaults.ts', 'utf8');

content = content.replace(
  `export function healDropdownOptions(
  currentList: DropdownOption[],
  defaults: string[],
  prefix: string,
  defaultColors?: Record<string, string>
): { mergedList: DropdownOption[]; changed: boolean } {
  const list = currentList ? [...currentList] : [];
  let changed = false;

  defaults.forEach((defName, i) => {
    const docId = prefix + '_' + i;
    const normDef = normalizeOptionName(defName);
    const defColor = defaultColors ? defaultColors[defName] : undefined;`,
  `export function healDropdownOptions(
  currentList: DropdownOption[],
  defaults: any[],
  prefix: string,
  defaultColors?: Record<string, string>
): { mergedList: DropdownOption[]; changed: boolean } {
  const list = currentList ? [...currentList] : [];
  let changed = false;

  defaults.forEach((defItem, i) => {
    const isObject = typeof defItem === 'object' && defItem !== null;
    const defName = isObject ? (defItem.label || defItem.name) : defItem;
    const docId = isObject ? (defItem.id || prefix + '_' + i) : prefix + '_' + i;
    const normDef = normalizeOptionName(defName);
    const defColor = defaultColors ? defaultColors[defName] : undefined;
    const defSentiment = isObject ? defItem.sentiment : undefined;`
);

content = content.replace(
  `      if (defColor && !existingById.color) {
        updatedItem.color = defColor;
        itemChanged = true;
      }

      if (itemChanged) {`,
  `      if (defColor && !existingById.color) {
        updatedItem.color = defColor;
        itemChanged = true;
      }
      if (defSentiment && existingById.sentiment !== defSentiment) {
        updatedItem.sentiment = defSentiment;
        itemChanged = true;
      }

      if (itemChanged) {`
);

content = content.replace(
  `      } else {
        list.push({
          id: docId,
          name: defName,
          ...(defColor ? { color: defColor } : {})
        });
        changed = true;
      }
    }
  });

  return { mergedList: list, changed };
}`,
  `      } else {
        list.push({
          id: docId,
          name: defName,
          ...(defColor ? { color: defColor } : {}),
          ...(defSentiment ? { sentiment: defSentiment } : {})
        });
        changed = true;
      }
    }
  });

  return { mergedList: list, changed };
}`
);

fs.writeFileSync('src/utils/defaults.ts', content);
