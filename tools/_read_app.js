const fs = require('fs');
const app = fs.readFileSync('public/assets/app.js','utf8');
// key sections
const markers = [
  'async function renderAccounts',
  'async function exportAccounts',
  'function exportEmailsOnly',
  'function exportSelected',
  'function downloadExport',
  'async function batchAction',
  'async function deleteErrorAccounts',
  'async function oneClickTestAccounts',
  'async function batchTestAccounts',
  'async function testAccount',
];
for (const m of markers) {
  const i = app.indexOf(m);
  console.log('\n====', m, 'at', i, '====');
  if (i < 0) continue;
  console.log(app.slice(i, i + 900));
}
