import { writeBatch } from 'firebase/firestore';
import { safeAddDoc, safeUpdateDoc, safeGetDocs, db } from '../firebase';
import { Product, Enquiry, DropdownOption, normalizeAttributes } from '../types';
import { STANDARD_CATALOG_SEED } from '../data/standardCatalog';

let isSeedingRunning = false;
let isMigrationRunning = false;
let isBackfillRunning = false;

/**
 * Queries 'companies', 'contacts', 'enquiries', and 'call_logs' collections in Firestore.
 * For any document where workspace_id is missing, undefined, or empty, updates it to set workspace_id: 'ws_default'.
 */
export async function backfillMissingWorkspaceIds() {
  if (isBackfillRunning) return;
  isBackfillRunning = true;

  const collectionsToBackfill = ['companies', 'contacts', 'enquiries', 'call_logs'];

  try {
    for (const colName of collectionsToBackfill) {
      const snapshot = await safeGetDocs(colName);
      if (!snapshot || snapshot.empty) continue;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const wsId = data.workspace_id || data.workspaceId;
        if (!wsId || typeof wsId !== 'string' || wsId.trim() === '') {
          await safeUpdateDoc(colName, docSnap.id, {
            workspace_id: 'ws_default'
          });
        }
      }
    }
  } catch (err) {
    console.warn('Error backfilling missing workspace IDs:', err);
  } finally {
    isBackfillRunning = false;
  }
}

/**
 * Seeds STANDARD_CATALOG_SEED items into the Firestore 'products' collection if they do not exist yet.
 */
export async function seedStandardProductsIfNeeded(existingProducts: Product[]) {
  if (isSeedingRunning) return;
  isSeedingRunning = true;

  try {
    const existingNames = new Set((existingProducts || []).map(p => (p.name || '').trim().toLowerCase()));
    
    for (const seedItem of STANDARD_CATALOG_SEED) {
      if (!existingNames.has(seedItem.name.trim().toLowerCase())) {
        await safeAddDoc('products', {
          name: seedItem.name,
          product_type: seedItem.product_type,
          description: seedItem.description,
          unit: seedItem.unit,
          unit_price: seedItem.unit_price,
          attributes: seedItem.attributes,
          createdAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.warn('Error seeding standard catalog products:', err);
  } finally {
    isSeedingRunning = false;
  }
}

/**
 * Auto-migrates legacy Firestore records:
 * 1. Renames category 'Sand Media' -> 'Filter Media' in dropdown_product_categories, products, and enquiry line_items.
 * 2. Converts any legacy Record<string, string> attributes to ProductAttribute[] array format.
 */
export async function migrateExistingData(
  products: Product[],
  categories: DropdownOption[],
  enquiries: Enquiry[]
) {
  if (isMigrationRunning) return;
  isMigrationRunning = true;

  try {
    // 1. Migrate Category dropdown documents
    for (const cat of categories || []) {
      if (cat.name === 'Sand Media') {
        await safeUpdateDoc('dropdown_product_categories', cat.id, { name: 'Filter Media' });
      }
    }

    // 2. Migrate Product collection
    for (const p of products || []) {
      let needsUpdate = false;
      let newProductType = p.product_type;
      if (p.product_type === 'Sand Media') {
        newProductType = 'Filter Media';
        needsUpdate = true;
      }

      const normalizedAttrs = normalizeAttributes(p.attributes);
      // Check if attributes changed format (was not an array or contained raw record)
      if (!Array.isArray(p.attributes) || JSON.stringify(p.attributes) !== JSON.stringify(normalizedAttrs)) {
        needsUpdate = true;
      }

      if (needsUpdate && p.id) {
        await safeUpdateDoc('products', p.id, {
          product_type: newProductType,
          attributes: normalizedAttrs
        });
      }
    }

    // 3. Migrate Enquiries collection line items
    for (const e of enquiries || []) {
      if (!e.line_items || !Array.isArray(e.line_items) || !e.id) continue;

      let enquiryNeedsUpdate = false;
      const updatedLineItems = e.line_items.map(item => {
        let itemType = item.product_type;
        let itemNeedsUpdate = false;

        if (item.product_type === 'Sand Media') {
          itemType = 'Filter Media';
          itemNeedsUpdate = true;
        }

        const normalizedAttrs = normalizeAttributes(item.attributes);
        if (!Array.isArray(item.attributes) || JSON.stringify(item.attributes) !== JSON.stringify(normalizedAttrs)) {
          itemNeedsUpdate = true;
        }

        if (itemNeedsUpdate) {
          enquiryNeedsUpdate = true;
          return {
            ...item,
            product_type: itemType,
            attributes: normalizedAttrs
          };
        }
        return item;
      });

      if (enquiryNeedsUpdate) {
        await safeUpdateDoc('enquiries', e.id, {
          line_items: updatedLineItems
        });
      }
    }
  } catch (err) {
    console.warn('Error during background data migration:', err);
  } finally {
    isMigrationRunning = false;
  }
}

/**
 * Queries records across 'companies', 'contacts', 'enquiries', and 'call_logs'.
 * Any record whose workspace_id is present but NOT in validWorkspaceIds is considered orphaned and batch-deleted.
 */
export async function scanAndPurgeOrphanedRecords(validWorkspaceIds: string[]) {
  if (!validWorkspaceIds || validWorkspaceIds.length === 0) return;
  const validSet = new Set(validWorkspaceIds);

  const collectionsToCheck = ['companies', 'contacts', 'enquiries', 'call_logs'];

  try {
    for (const colName of collectionsToCheck) {
      const snapshot = await safeGetDocs(colName);
      if (!snapshot || snapshot.empty) continue;

      const docsToDelete: any[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const wsId = data.workspace_id || data.workspaceId;
        if (wsId && typeof wsId === 'string' && wsId.trim() !== '' && !validSet.has(wsId)) {
          docsToDelete.push(docSnap);
        }
      }

      if (docsToDelete.length > 0) {
        let batch = writeBatch(db);
        let count = 0;
        for (const docSnap of docsToDelete) {
          batch.delete(docSnap.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }
    }
  } catch (err) {
    console.warn('Error purging orphaned records:', err);
  }
}
