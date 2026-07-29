const fs=require('fs');
const s=fs.readFileSync('C:/Users/L/Documents/GitHub/cf-outlook-email/tools/resin-ui.js','utf8');
const apis=[...s.matchAll(/["'`](\/api\/v1\/[a-zA-Z0-9_\/{}-]+)["'`]/g)].map(m=>m[1]);
console.log([...new Set(apis)].sort().join('\n'));
// search proxy token related UI strings
for (const k of ['proxy_token','PROXY_TOKEN','access','接入','weak','security']) {
  let i=s.indexOf(k); console.log(k, i);
  if(i>=0) console.log(s.slice(i-50,i+150).replace(/\n/g,' '));
}
