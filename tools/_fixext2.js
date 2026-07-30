const fs = require('fs');
const ext = fs.readFileSync('src/routes/external.ts','utf8');
const i = ext.indexOf('resolveAccountToken');
console.log(ext.slice(i, i + 900));
console.log('==== usages ====');
let p = 0, c = 0;
while ((p = ext.indexOf('resolveAccountToken', p)) >= 0 && c < 8) {
  console.log('---', ext.slice(p, p + 200).replace(/\n/g,' '));
  p++; c++;
}
