const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `      // 1. Immediately update local state and local cache for instant UI feedback
      setEnquiries((prev) => {
        const next = prev.filter((e) => e.id !== cleanId);
        setLocalCache('omni_enquiries', next);
        return next;
      });

      if (selectedEnquiryId === cleanId) {
        setSelectedEnquiryId(null);
      }

      // 2. Perform Firestore document deletion
      const success = await safeDeleteDoc('enquiries', cleanId);
      if (!success) {
        console.warn(\`[handleDeleteEnquiry] Firestore delete returned false for enquiry \${cleanId}. Local state already purged.\`);
      }`;

const replacement1 = `      // 1. Immediately update local state and local cache for instant UI feedback
      setEnquiries((prev) => {
        const next = prev.map((e) => e.id === cleanId ? {
          ...e,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : e);
        setLocalCache('omni_enquiries', next);
        return next;
      });

      if (selectedEnquiryId === cleanId) {
        setSelectedEnquiryId(null);
      }

      // 2. Perform Firestore document soft deletion
      const success = await safeUpdateDoc('enquiries', cleanId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });
      if (!success) {
        console.warn(\`[handleDeleteEnquiry] Firestore soft delete returned false for enquiry \${cleanId}.\`);
      }`;

code = code.replace(target1, replacement1);

const target2 = `      // 1. Immediately update local state & local cache
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
            const ref = doc(db, 'enquiries', id);
            batch.delete(ref);
          }
        });
        await batch.commit();
      } catch (batchErr) {
        console.warn('[handleBulkDeleteEnquiries] Batch delete failed, falling back to safeDeleteDoc loop:', batchErr);
        for (const id of validIds) {
          await safeDeleteDoc('enquiries', id);
        }
      }`;

const replacement2 = `      // 1. Immediately update local state & local cache
      setEnquiries((prev) => {
        const next = prev.map((e) => validIds.includes(e.id as string) ? {
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

      // 2. Perform Firestore deletes
      try {
        const batch = writeBatch(db);
        validIds.forEach((id) => {
          if (!id.startsWith('local_') && !id.startsWith('temp_')) {
            const ref = doc(db, 'enquiries', id);
            batch.update(ref, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });
          }
        });
        await batch.commit();
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

code = code.replace(target2, replacement2);

fs.writeFileSync('src/App.tsx', code);
