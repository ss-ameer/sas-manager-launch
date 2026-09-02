const fs = require('fs');
let code = fs.readFileSync('src/components/TrashBinModal.tsx', 'utf8');

const t1 = `  callLogs: CallLogEntry[];
  onRefreshData: () => void;
}`;

const r1 = `  callLogs: CallLogEntry[];
  onRefreshData: () => void;
  activeWorkspaceId?: string;
}`;

const t2 = `  products,
  callLogs,
  onRefreshData
}) => {`;

const r2 = `  products,
  callLogs,
  onRefreshData,
  activeWorkspaceId
}) => {`;

const t3 = `  // Extract soft-deleted items
  const deletedEnquiries = enquiries.filter((e) => e.is_deleted);
  const deletedCompanies = companies.filter((c) => c.is_deleted);
  const deletedContacts = contacts.filter((c) => c.is_deleted);
  const deletedProducts = products.filter((p) => p.is_deleted);
  const deletedCallLogs = callLogs.filter((l) => l.is_deleted);`;

const r3 = `  // Helper to check workspace boundary
  const isWsMatch = (wsId: string | undefined) => {
    if (!activeWorkspaceId) return true;
    const itemWs = wsId || 'ws_default';
    const currentWs = activeWorkspaceId || 'ws_default';
    return itemWs === currentWs;
  };

  // Extract soft-deleted items (filtered by workspace)
  const deletedEnquiries = enquiries.filter((e) => e.is_deleted && isWsMatch(e.workspace_id || (e as any).workspaceId));
  const deletedCompanies = companies.filter((c) => c.is_deleted && isWsMatch(c.workspace_id || (c as any).workspaceId));
  const deletedContacts = contacts.filter((c) => c.is_deleted && isWsMatch(c.workspace_id || (c as any).workspaceId));
  const deletedProducts = products.filter((p) => p.is_deleted && isWsMatch(p.workspace_id || (p as any).workspaceId));
  const deletedCallLogs = callLogs.filter((l) => l.is_deleted && isWsMatch(l.workspace_id));`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
fs.writeFileSync('src/components/TrashBinModal.tsx', code);
