const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const t1 = `      // 1. Immediately update local state & local cache
      setEnquiries((prev) => {
        const next = prev.filter((e) => e.id && !validIds.includes(e.id));
        setLocalCache('omni_enquiries', next);
        return next;
      });
      setSelectedEnquiryId(null);

      // 2. Perform Firestore deletes
      try {
        const batch = writeBatch(db);
        validIds.forEach((id) => {
          if (!id.startsWith('local_') && !id.startsWith('temp_')) {
            batch.delete(doc(db, 'enquiries', id));
          }
        });
        await batch.commit();
        console.log(\`[handleBulkDeleteEnquiries] Successfully committed batch delete for \${validIds.length} enquiries\`);
      } catch (batchErr) {
        console.warn('[handleBulkDeleteEnquiries] Batch delete failed, falling back to safeDeleteDoc loop:', batchErr);
        for (const id of validIds) {
          await safeDeleteDoc('enquiries', id);
        }
      }`;

const r1 = `      // 1. Immediately update local state & local cache
      setEnquiries((prev) => {
        const next = prev.map((e) => validIds.includes(e.id) ? {
          ...e,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : e);
        setLocalCache('omni_enquiries', next);
        return next;
      });
      setSelectedEnquiryId(null);

      // 2. Perform Firestore soft deletes
      try {
        const batch = writeBatch(db);
        validIds.forEach((id) => {
          if (!id.startsWith('local_') && !id.startsWith('temp_')) {
            batch.update(doc(db, 'enquiries', id), {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });
          }
        });
        await batch.commit();
        console.log(\`[handleBulkDeleteEnquiries] Successfully committed batch soft delete for \${validIds.length} enquiries\`);
      } catch (batchErr) {
        console.warn('[handleBulkDeleteEnquiries] Batch soft-delete failed, falling back to safeUpdateDoc loop:', batchErr);
        for (const id of validIds) {
          await safeUpdateDoc('enquiries', id, {
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid || null,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          });
        }
      }`;

code = code.replace(t1, r1);
fs.writeFileSync('src/App.tsx', code);
