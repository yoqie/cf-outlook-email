const fs = require('fs');

// Fix cron import
let cron = fs.readFileSync('src/cron.ts', 'utf8');
const cnl = cron.includes('\r\n') ? '\r\n' : '\n';
if (!cron.includes("from './accountToken'")) {
  cron = cron.replace(
    "import { fetchEmails } from './graph';",
    "import { fetchEmails } from './graph';" + cnl + "import { ensureAccessToken } from './accountToken';"
  );
  fs.writeFileSync('src/cron.ts', cron);
  console.log('cron import fixed');
} else console.log('cron import ok');

// app.js status label
let app = fs.readFileSync('public/assets/app.js', 'utf8');
const anl = app.includes('\r\n') ? '\r\n' : '\n';
if (!app.includes('function accountStatusLabel')) {
  const helper = [
    'function accountStatusLabel(status) {',
    "  if (status === 'active') return t('活跃');",
    "  if (status === 'disabled') return t('停用');",
    "  if (status === 'error') return t('异常');",
    "  return status || '';",
    '}',
    '',
    '',
  ].join(anl);
  const ai = app.indexOf('function formatImportDate');
  const fd = app.indexOf('function formatDate');
  const at = ai >= 0 ? ai : fd;
  if (at < 0) throw new Error('no format anchor');
  app = app.slice(0, at) + helper + app.slice(at);
  app = app.replace(
    'class="badge badge-${a.status}">${a.status}</span>',
    'class="badge badge-${a.status}">${accountStatusLabel(a.status)}</span>'
  );
  fs.writeFileSync('public/assets/app.js', app);
  console.log('status label ok');
} else {
  console.log('status label exists');
}

// Clean junk tools
const junk = [
  'tools/resin-ui.js','tools/parse-resin-ui.js','tools/parse2.js',
  'tools/_optimize.js','tools/_read_acc.js','tools/_read_acc2.js','tools/_read_app.js',
  'tools/_audit.js','tools/_a2.js','tools/_a3.js','tools/_a4.js','tools/_a5.js','tools/_a6.js',
  'tools/_a7.js','tools/_a8.js','tools/_opt_all.js','tools/_opt1.js','tools/_opt2.js',
];
for (const j of junk) {
  try { fs.unlinkSync(j); console.log('del', j); } catch {}
}

// Verify accounts batch-test uses ensureAccessToken
const acc = fs.readFileSync('src/routes/accounts.ts','utf8');
const bt = acc.indexOf("accounts.post('/batch-test'");
console.log('batch-test body sample:\n', acc.slice(bt, bt + 1200).slice(800));
