const fs = require('fs');
const chunk = fs.readFileSync('flight-5.txt', 'utf8');
const key = '\\"profileInfoDocument\\"';
const start = chunk.indexOf(key);
if (start === -1) {
  console.error('not found');
  process.exit(1);
}
let idx = start + key.length;
while (chunk[idx] !== ':') idx++;
idx++;
while (chunk[idx] === ' ') idx++;
if (chunk[idx] !== '{') {
  console.error('expected { but got', chunk[idx]);
  process.exit(1);
}
let braceCount = 0;
let end = idx;
for (; end < chunk.length; end++) {
  const ch = chunk[end];
  if (ch === '{') braceCount++;
  else if (ch === '}') {
    braceCount--;
    if (braceCount === 0) {
      end++;
      break;
    }
  }
}
const objStrEscaped = chunk.slice(idx, end);
const jsonCompatible = '"' + objStrEscaped
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\r/g, '')
  .replace(/\n/g, '\\n') + '"';
const dataStr = JSON.parse(jsonCompatible);
const data = JSON.parse(dataStr);
fs.writeFileSync('profileInfoDocument.json', JSON.stringify(data, null, 2));
console.log('Parsed keys:', Object.keys(data));
