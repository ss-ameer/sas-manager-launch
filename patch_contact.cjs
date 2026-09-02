const fs = require('fs');
let code = fs.readFileSync('src/components/ContactModal.tsx', 'utf8');

const t1 = `      if (setContacts) {
        setContacts((prev) => prev.filter((c) => c.id !== targetId));
      }

      await safeDeleteDoc('contacts', targetId);`;

const r1 = `      if (setContacts) {
        setContacts((prev) => prev.map((c) => c.id === targetId ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }

      await safeUpdateDoc('contacts', targetId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });`;

code = code.replace(t1, r1);
fs.writeFileSync('src/components/ContactModal.tsx', code);
