const fs = require('fs');
const content = fs.readFileSync('/Users/matthewfrost/training-portal/csv-import/Armfield House Training Matrix - Staff Matrix.csv', 'utf-8');

const lines = content.split('\n');

const DIVIDER_LABELS = ['team leaders', 'team leader', 'lead support', 'management', 'support workers'];

function isDividerRow(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d);
}

let staffCount = 0;
let dividerCount = 0;

for (let i = 40; i < 90 && i < lines.length; i++) {
  const cells = lines[i].split(',');
  const first = cells[0] ? cells[0].trim() : '';
  
  if (!first) continue;
  
  const hasDate = cells.slice(1, 10).some(c => c && c.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/));
  
  if (isDividerRow(first)) {
    console.log('DIVIDER at line', i+1, ':', first);
    dividerCount++;
  } else if (hasDate || first.split(' ').length >= 2) {
    staffCount++;
  }
}

console.log('\nFound', dividerCount, 'dividers');
console.log('Found', staffCount, 'staff rows');

console.log('\n');
