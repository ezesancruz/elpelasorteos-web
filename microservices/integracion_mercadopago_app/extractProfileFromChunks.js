const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node extractProfileFromChunks.js <chunksDir>');
  process.exit(1);
}
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
for (const file of files) {
  const fullPath = path.join(dir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const marker = '"profileInfoDocument"';
  const idx = content.indexOf(marker);
  if (idx === -1) continue;
  let start = idx + marker.length;
  while (content[start] !== ':') start++;
  start++;
  while (content[start] === ' ') start++;
  if (content[start] !== '{') continue;
  let braceCount = 0;
  let end = start;
  for (; end < content.length; end++) {
    const ch = content[end];
    if (ch === '{') braceCount++;
    else if (ch === '}') {
      braceCount--;
      if (braceCount === 0) {
        end++;
        break;
      }
    }
  }
  const slice = content.slice(start, end);
  const jsonText = slice.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  try {
    const data = JSON.parse(jsonText);
    const outPath = path.join(path.dirname(dir), 'profileInfoDocument.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log('Profile data written to', outPath, 'from', file);
    process.exit(0);
  } catch (err) {
    console.error('Failed to parse in', file, err.message);
  }
}
console.error('profileInfoDocument not found in any chunks');
process.exit(1);
