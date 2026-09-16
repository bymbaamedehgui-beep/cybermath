// index.html ба worksheets.html-ийн inline <script> блокуудыг синтаксаар шалгана (ажиллуулахгүй).
// Ажиллуулах: node tests/html-inline-parse.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WT = path.resolve(__dirname, '..');
let bad = 0;
function checkFile(rel, mustHave, mustNot) {
  const html = fs.readFileSync(path.join(WT, rel), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc=/.test(attrs) || /type=["'](?!text\/javascript|module)/i.test(attrs)) continue;
    if (/type=["']module/i.test(attrs)) continue;
    n++;
    try { new vm.Script(m[2], { filename: rel + '#inline' + n }); }
    catch (e) { bad++; console.log('PARSE FAIL', rel, 'inline#' + n, e.message); }
  }
  (mustHave || []).forEach(s => { if (html.indexOf(s) < 0) { bad++; console.log('MISSING', rel, JSON.stringify(s)); } });
  (mustNot || []).forEach(s => { if (html.indexOf(s) >= 0) { bad++; console.log('SHOULD NOT CONTAIN', rel, JSON.stringify(s)); } });
  console.log(rel, 'inline scripts:', n);
}

checkFile('index.html',
  ['id="reg-phone"', 'function _smsTargetText(masked)', 'showVerifyModal(d.email, plan, d.masked)', 'resendVerifyCode()', 'Утсанд SMS-ээр ирсэн 6 оронтой код'],
  ['И-мэйлд ирсэн 6 оронтой код', "resendVerifyCode(\\'' + email", 'хаягт 6 оронтой код илгээлээ', 'Spam / Junk / Хог']);
checkFile('worksheets.html',
  ['id="rgPhone"', 'function setVPhone(masked)', 'id="vPhone"', "api('ws_verify',{email:curEmail,code:code,pass:pass})", 'id="vPass"', 'function askPass(msg)'],
  ['Имэйлдээ ирсэн кодыг', 'Имэйл ирээгүй бол']);
console.log('bad:', bad);
process.exit(bad ? 1 : 0);
