const fs = require('fs');
const s = fs.readFileSync('C:/Users/L/Documents/GitHub/cf-outlook-email/tools/resin-ui.js', 'utf8');
console.log('len', s.length);
const apis = [...s.matchAll(/["'`](\/api\/[a-zA-Z0-9_\/{}-]+)["'`]/g)].map(m => m[1]);
console.log('API paths:\n' + [...new Set(apis)].sort().join('\n'));
// find auth related
for (const k of ['Authorization', 'localStorage', 'adminToken', 'ADMIN_TOKEN', 'login', 'Bearer ', 'Basic ']) {
  let i = 0, c = 0;
  while ((i = s.indexOf(k, i)) >= 0 && c < 4) {
    console.log('\n---', k, i, '---');
    console.log(s.slice(Math.max(0, i - 100), i + 180).replace(/\n/g, ' '));
    i++; c++;
  }
}
