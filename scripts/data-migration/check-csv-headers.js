const fs = require('fs');

// Read Peters House CSV
const content = fs.readFileSync('/Users/matthewfrost/training-portal/csv-import/Peters House Training Matrix - Staff Matrix.csv', 'utf-8');

// Find the Staff Name line
const lines = content.split('\n');
let headerLineNum = -1;
for (let i = 0; i < 60; i++) {
  if (lines[i] && lines[i].includes('Staff Name')) {
    headerLineNum = i;
    break;
  }
}

console.log('Header line number:', headerLineNum);

// Get the raw header line
const rawHeader = lines[headerLineNum];
console.log('\nRaw header length:', rawHeader.length);
console.log('\nFirst 500 chars of header:');
console.log(rawHeader.substring(0, 500));

// Count columns by simple comma split
const simpleSplit = rawHeader.split(',');
console.log('\nSimple comma split gives', simpleSplit.length, 'columns');

// Show columns around position 30-35
console.log('\nColumns 28-40 (simple split):');
for (let i = 28; i < Math.min(40, simpleSplit.length); i++) {
  console.log(`  [${i}]: ${JSON.stringify(simpleSplit[i].substring(0, 50))}`);
}
