const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const t1 = `  const workspaceEnquiries = useMemo(() => {
    return enquiries.filter((e) => {
      const wId = e.workspace_id || (e as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [enquiries, activeWorkspace.id, isDefaultWorkspace]);`;

const r1 = `  const workspaceEnquiries = useMemo(() => {
    return enquiries.filter((e) => {
      if (e.is_deleted) return false;
      const wId = e.workspace_id || (e as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [enquiries, activeWorkspace.id, isDefaultWorkspace]);`;

const t2 = `  const workspaceCompanies = useMemo(() => {
    return companies.filter((c) => {
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [companies, activeWorkspace.id, isDefaultWorkspace]);`;

const r2 = `  const workspaceCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (c.is_deleted) return false;
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [companies, activeWorkspace.id, isDefaultWorkspace]);`;

const t3 = `  const workspaceContacts = useMemo(() => {
    return contacts.filter((c) => {
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [contacts, activeWorkspace.id, isDefaultWorkspace]);`;

const r3 = `  const workspaceContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (c.is_deleted) return false;
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [contacts, activeWorkspace.id, isDefaultWorkspace]);`;

const t4 = `  const workspaceProducts = useMemo(() => {
    return products.filter((p) => {
      const wId = p.workspace_id || (p as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [products, activeWorkspace.id, isDefaultWorkspace]);`;

const r4 = `  const workspaceProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.is_deleted) return false;
      const wId = p.workspace_id || (p as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [products, activeWorkspace.id, isDefaultWorkspace]);`;

const t5 = `  const workspaceCallLogs = useMemo(() => {
    return callLogs.filter((l) => {
      const wId = l.workspace_id;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [callLogs, activeWorkspace.id, isDefaultWorkspace]);`;

const r5 = `  const workspaceCallLogs = useMemo(() => {
    return callLogs.filter((l) => {
      if (l.is_deleted) return false;
      const wId = l.workspace_id;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [callLogs, activeWorkspace.id, isDefaultWorkspace]);`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
code = code.replace(t4, r4);
code = code.replace(t5, r5);
fs.writeFileSync('src/App.tsx', code);
