const fs = require('fs');
const acc = fs.readFileSync('src/routes/accounts.ts','utf8');
const lines = acc.split(/\r?\n/);
// print lines 150-420
console.log(lines.slice(149, 420).map((l,i)=>String(i+150).padStart(4)+'|'+l).join('\n'));
