const fs = require('fs');
const ext = fs.readFileSync('src/routes/external.ts','utf8');
const i = ext.indexOf('ensureAccessToken');
console.log(ext.slice(i - 200, i + 400));
// find resolveAccount or similar function signature
const j = ext.indexOf('async function');
let p = 0, c = 0;
while ((p = ext.indexOf('function', p)) >= 0 && c < 10) {
  console.log(c, ext.slice(p, p + 120).replace(/\n/g, ' '));
  p++; c++;
}
