const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

// 1. Fix the Eye icon bug in card view
code = code.replace(/setSelectedEntry\(log\);\s*setShowLogModal\(true\);/g, 'setSelectedDetailEntry(log);');

// 2. Fix the Activity Type Colors in card view
const oldChannelLogic = `                let ChannelIcon = Phone;
                if (type === 'email') ChannelIcon = Mail;
                else if (type === 'message') ChannelIcon = MessageSquare;`;

const newChannelLogic = `                let ChannelIcon = Phone;
                let channelColorClass = 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400';
                if (type === 'email') {
                  ChannelIcon = Mail;
                  channelColorClass = 'text-purple-500 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400';
                }
                else if (type === 'message' || type === 'whatsapp' || type === 'sms') {
                  ChannelIcon = MessageSquare;
                  channelColorClass = 'text-green-500 bg-green-50 dark:bg-green-900/30 dark:text-green-400';
                }
                else if (type === 'meeting' || type.includes('meet')) {
                  ChannelIcon = Users;
                  channelColorClass = 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400';
                }
                else if (type === 'site visit' || type.includes('site')) {
                  ChannelIcon = MapPin;
                  channelColorClass = 'text-teal-500 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400';
                }
                else if (type === 'internal task' || type === 'admin' || type.includes('task')) {
                  ChannelIcon = FileText;
                  channelColorClass = 'text-gray-500 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400';
                }`;
code = code.replace(oldChannelLogic, newChannelLogic);

// Replace the hardcoded indigo class
code = code.replace(/className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-500 dark:bg-indigo-900\/30 dark:text-indigo-400" title=\{`Channel: \$\{type\}`\}/g, 
                    'className={`w-8 h-8 rounded-full flex items-center justify-center ${channelColorClass}`} title={`Channel: ${type}`}');

// 3. Fix View Preference Memory
// Update the useState for viewMode
code = code.replace(/const \[viewMode, setViewMode\] = useState<'card' | 'table'>\('table'\);/g, 
                    "const [viewMode, setViewMode] = useState<'card' | 'table'>(() => (localStorage.getItem('callLogViewMode') as 'card' | 'table') || 'card');");

// Update the onClick for the card button
code = code.replace(/onClick=\{\(\) => setViewMode\('card'\)\}/g, 
                    "onClick={() => { setViewMode('card'); localStorage.setItem('callLogViewMode', 'card'); }}");

// Update the onClick for the table button
code = code.replace(/onClick=\{\(\) => setViewMode\('table'\)\}/g, 
                    "onClick={() => { setViewMode('table'); localStorage.setItem('callLogViewMode', 'table'); }}");

fs.writeFileSync('src/components/CallLogManager.tsx', code);
