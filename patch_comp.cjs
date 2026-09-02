const fs = require('fs');
let code = fs.readFileSync('src/components/CompanyModal.tsx', 'utf8');

const t1 = `      if (setContacts) {
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
      setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));

      await safeDeleteDoc('contacts', contactId);`;
const r1 = `      if (setContacts) {
        setContacts((prev) => prev.map((c) => c.id === contactId ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }
      setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));

      await safeUpdateDoc('contacts', contactId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });`;

const t2 = `      const idsToDelete = [...selectedContactIds];
      for (const id of idsToDelete) {
        await safeDeleteDoc('contacts', id);`;
const r2 = `      const idsToDelete = [...selectedContactIds];
      for (const id of idsToDelete) {
        await safeUpdateDoc('contacts', id, {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid || null,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        });`;

const t2b = `      if (setContacts) {
        setContacts((prev) => prev.filter((c) => !idsToDelete.includes(c.id!)));
      }`;
const r2b = `      if (setContacts) {
        setContacts((prev) => prev.map((c) => idsToDelete.includes(c.id!) ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }`;

const t3 = `        for (const ct of linkedContacts) {
          if (ct.id) {
            await safeDeleteDoc('contacts', ct.id);
          }
        }
        if (setContacts) {
          setContacts((prev) => prev.filter((ct) => ct.company_id !== id));
        }`;
const r3 = `        for (const ct of linkedContacts) {
          if (ct.id) {
            await safeUpdateDoc('contacts', ct.id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });
          }
        }
        if (setContacts) {
          setContacts((prev) => prev.map((ct) => ct.company_id === id ? {
            ...ct,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : ct));
        }`;

const t4 = `      if (setCompanies) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
      }

      // Delete company document
      await safeDeleteDoc('companies', id);`;
const r4 = `      if (setCompanies) {
        setCompanies((prev) => prev.map((c) => c.id === id ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }

      // Soft delete company document
      await safeUpdateDoc('companies', id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });`;

const t5 = `            if (setCallLogs) {
              setCallLogs((prev) => prev.filter((l) => l.id !== id));
            }
            try {
              await safeDeleteDoc('call_logs', id);`;
const r5 = `            if (setCallLogs) {
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

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t2b, r2b);
code = code.replace(t3, r3);
code = code.replace(t4, r4);
code = code.replace(t5, r5);

fs.writeFileSync('src/components/CompanyModal.tsx', code);
