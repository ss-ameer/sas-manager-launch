const fs = require('fs');
let content = fs.readFileSync('src/utils/defaults.ts', 'utf8');

const replacement = `export const SYSTEM_CALL_OUTCOMES: any[] = [
  { id: 'co_pos_1', name: 'Lead Qualified', sentiment: 'positive' },
  { id: 'co_pos_2', name: 'Meeting Booked', sentiment: 'positive' },
  { id: 'co_pos_3', name: 'Quote Requested', sentiment: 'positive' },
  { id: 'co_pos_4', name: 'Deal Won', sentiment: 'positive' },
  
  { id: 'co_neu_1', name: 'Info Requested', sentiment: 'neutral' },
  { id: 'co_neu_2', name: 'Pending Review', sentiment: 'neutral' },
  { id: 'co_neu_3', name: 'Active Negotiation', sentiment: 'neutral' },
  { id: 'co_neu_4', name: 'Requested Call Back', sentiment: 'neutral' },
  { id: 'co_neu_5', name: 'Status Update', sentiment: 'neutral' },
  { id: 'co_neu_6', name: 'Gathered Info', sentiment: 'neutral' },
  
  { id: 'co_neg_1', name: 'Not Interested', sentiment: 'negative' },
  { id: 'co_neg_2', name: 'Lost to Competitor', sentiment: 'negative' },
  { id: 'co_neg_3', name: 'Pricing / Timing Issue', sentiment: 'negative' },
  { id: 'co_neg_4', name: 'Not Qualified', sentiment: 'negative' },
];`;

content = content.replace(
  /export const SYSTEM_CALL_OUTCOMES = \[[^\]]*\];/m,
  replacement
);

fs.writeFileSync('src/utils/defaults.ts', content);
