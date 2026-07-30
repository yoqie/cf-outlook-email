const fs = require('fs');
const css = fs.readFileSync('public/assets/style.css','utf8');
const i = css.lastIndexOf('Accounts table');
console.log('last accounts', i, i>=0 ? css.slice(i, i+350) : 'none');
// also search text-align center for accounts
let p = 0;
while ((p = css.indexOf('accounts-table', p)) >= 0) {
  console.log('at', p, css.slice(p, p+200));
  p++;
}
const app = fs.readFileSync('public/assets/app.js','utf8');
// full row end
const r = app.indexOf('function renderAccountRows');
console.log(app.slice(r, r+1600));
