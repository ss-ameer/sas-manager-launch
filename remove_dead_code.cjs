const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const deadCode = `  const openNewLogModal = () => {
    setDrawerMode('create');
    setEditingLog(null);
    if (onOpenActivityDrawer) {
      onOpenActivityDrawer({ channel: 'Call', drawerMode: 'create' });
    }
  };`;

code = code.replace(deadCode, '');

fs.writeFileSync('src/components/CallLogManager.tsx', code);
