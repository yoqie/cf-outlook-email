const fs = require('fs');
const acc = fs.readFileSync('src/routes/accounts.ts','utf8');
console.log('lines', acc.split(/\n/).length);
console.log(acc);
