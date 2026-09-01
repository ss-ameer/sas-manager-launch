const fs = require('fs');

// 1. Update activityLogic.ts
let content = fs.readFileSync('src/utils/activityLogic.ts', 'utf8');

content = content.replace(
  /export function getStatusesForChannel[\s\S]*?return \[\n\s*'Completed \/ Connected'[\s\S]*?\];\n\}/,
  `export function getStatusesForChannel(channel?: string): string[] {
  const norm = (channel || 'Phone Call').toLowerCase().trim();

  // Email / Message / WhatsApp / SMS
  if (
    norm.includes('email') ||
    norm.includes('message') ||
    norm.includes('whatsapp') ||
    norm.includes('sms')
  ) {
    return ['Sent / Completed', 'Scheduled / Draft', 'Failed / Bounced'];
  }

  // Meeting / Site Visit
  if (
    norm.includes('meeting') ||
    norm.includes('site visit') ||
    norm.includes('visit')
  ) {
    return ['Completed', 'Scheduled / Planned', 'Cancelled', 'Rescheduled'];
  }

  // Internal Task / Admin
  if (
    norm.includes('internal') ||
    norm.includes('task') ||
    norm.includes('admin')
  ) {
    return ['Completed', 'In Progress', 'Scheduled / Planned'];
  }

  // Default: Phone Call
  return [
    'Completed',
    'Scheduled / Planned',
    'No Answer',
    'Busy',
    'Invalid Number'
  ];
}`
);

fs.writeFileSync('src/utils/activityLogic.ts', content);

// 2. Update QuickActivityDrawer.tsx to use callStatuses only for Phone Calls
let qad = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

qad = qad.replace(
  `const available = callStatuses?.length ? callStatuses.map(s => s.name) : getStatusesForChannel(newChannel);`,
  `const isCall = newChannel === 'Call' || newChannel === 'Phone Call';
    const available = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(newChannel);`
);

qad = qad.replace(
  `const available = callStatuses?.length ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel);`,
  `const isCall = interactionChannel === 'Call' || interactionChannel === 'Phone Call';
    const available = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel);`
);

qad = qad.replace(
  /\{\(callStatuses\?\.length \? callStatuses\.map\(s => s\.name\) : getStatusesForChannel\(interactionChannel\)\)/g,
  `{((interactionChannel === 'Call' || interactionChannel === 'Phone Call') && callStatuses?.length ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel))`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', qad);
