const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const t1 = `      const success = await safeUpdateDoc('enquiries', cleanId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });
      if (!success) {
        console.warn(\`[handleDeleteEnquiry] Firestore soft delete returned false for enquiry \${cleanId}.\`);
      }`;

const r1 = `      try {
        await safeUpdateDoc('enquiries', cleanId, {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        });
      } catch (err) {
        console.warn(\`[handleDeleteEnquiry] Firestore soft delete returned false for enquiry \${cleanId}.\`);
      }`;

code = code.replace(t1, r1);
fs.writeFileSync('src/App.tsx', code);
