const fs = require('fs');

// 1. ProductManager.tsx
let codeProd = fs.readFileSync('src/components/ProductManager.tsx', 'utf8');

const t1 = `          if (setProducts) {
            setProducts((prev) => prev.filter((prod) => prod.id !== targetId));
          }
          await safeDeleteDoc('products', targetId);`;

const r1 = `          if (setProducts) {
            setProducts((prev) => prev.map((prod) => prod.id === targetId ? {
              ...prod,
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            } : prod));
          }
          await safeUpdateDoc('products', targetId, {
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid || null,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          });`;

codeProd = codeProd.replace(t1, r1);
fs.writeFileSync('src/components/ProductManager.tsx', codeProd);

// 2. CompanyModal.tsx call_logs
let codeComp = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const t2 = `            if (setCallLogs) {
              setCallLogs((prev) => prev.filter((l) => l.id !== id));
            }
            try {
              await safeDeleteDoc('call_logs', id);`;

const r2 = `            if (setCallLogs) {
              setCallLogs((prev) => prev.map((l) => l.id === id ? {
                ...l,
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by_uid: user?.uid,
                deleted_by_name: user?.full_name || user?.username || 'Unknown'
              } : l));
            }
            try {
              await safeUpdateDoc('call_logs', id, {
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by_uid: user?.uid || null,
                deleted_by_name: user?.full_name || user?.username || 'Unknown'
              });`;

codeComp = codeComp.replace(t2, r2);
fs.writeFileSync('src/components/CompanyModal.tsx', codeComp);

