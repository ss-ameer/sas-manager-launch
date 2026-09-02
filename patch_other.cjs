const fs = require('fs');

// 1. ContactModal.tsx
let codeContact = fs.readFileSync('src/components/ContactModal.tsx', 'utf8');

const t1 = `      if (setContacts) {
        setContacts((prev) => prev.filter((item) => item.id !== targetId));
      }

      await safeDeleteDoc('contacts', targetId);`;

const r1 = `      if (setContacts) {
        setContacts((prev) => prev.map((item) => item.id === targetId ? {
          ...item,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : item));
      }

      await safeUpdateDoc('contacts', targetId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });`;

codeContact = codeContact.replace(t1, r1);
fs.writeFileSync('src/components/ContactModal.tsx', codeContact);

// 2. Company360Modal.tsx
let code360 = fs.readFileSync('src/components/Company360Modal.tsx', 'utf8');

const t2 = `      if (setContacts) {
        setContacts((prev) => prev.filter((item) => item.id !== targetId));
      }
      await safeDeleteDoc('contacts', targetId);`;

const r2 = `      if (setContacts) {
        setContacts((prev) => prev.map((item) => item.id === targetId ? {
          ...item,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : item));
      }
      await safeUpdateDoc('contacts', targetId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });`;

// Wait, we need to import safeUpdateDoc in Company360Modal if not present
if (!code360.includes('safeUpdateDoc')) {
  code360 = code360.replace('import { safeDeleteDoc, safeSetDoc } from', 'import { safeDeleteDoc, safeSetDoc, safeUpdateDoc } from');
}

code360 = code360.replace(t2, r2);
fs.writeFileSync('src/components/Company360Modal.tsx', code360);

