const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const t1 = `      <TrashBinModal
        isOpen={showTrashBinModal}
        onClose={() => setShowTrashBinModal(false)}
        currentUser={user}
        enquiries={enquiries}
        companies={companies}
        contacts={contacts}
        products={products}
        callLogs={callLogs}
        onRefreshData={async () => {`;

const r1 = `      <TrashBinModal
        isOpen={showTrashBinModal}
        onClose={() => setShowTrashBinModal(false)}
        currentUser={user}
        enquiries={enquiries}
        companies={companies}
        contacts={contacts}
        products={products}
        callLogs={callLogs}
        activeWorkspaceId={activeWorkspace?.id}
        onRefreshData={async () => {`;

code = code.replace(t1, r1);
fs.writeFileSync('src/App.tsx', code);
