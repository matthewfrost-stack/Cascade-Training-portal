require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';
const files = [
  'Banks House School Training Matrix - Staff Matrix.csv', 
  'Felix House School Training Matrix - Staff Matrix.csv', 
  'Group Training Matrix - Staff Matrix.csv'
];

console.log('Detailed duplicate analysis:\n');

files.forEach(file => {
  const content = fs.readFileSync(path.join(CSV_DIR, file), 'utf-8');
  const rows = parse(content, { relax_column_count: true });
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < 10; i++) {
    if ((rows[i][0] || '').toString().trim().toLowerCase() === 'staff name') {
      headerRow = i;
      break;
    }
  }
  
  const courses = rows[headerRow].slice(1).filter(c => c && c.trim());
  
  // Track all occurrences
  const occurrences = new Map();
  courses.forEach((c, i) => {
    const raw = c.trim();
    const normalized = raw.replace(/\s+/g, ' ').toLowerCase();
    if (!occurrences.has(normalized)) {
      occurrences.set(normalized, []);
    }
    occurrences.get(normalized).push({ position: i + 1, raw });
  });
  
  // Find duplicates
  const dupes = [];
  for (const [normalized, entries] of occurrences) {
    if (entries.length > 1) {
      dupes.push({ normalized, entries });
    }
  }
  
  console.log('=' .repeat(80));
  console.log(file.replace(' Training Matrix - Staff Matrix.csv', ''));
  console.log('=' .repeat(80));
  
  if (dupes.length === 0) {
    console.log('No duplicates found');
  } else {
    dupes.forEach(d => {
      console.log(`\nDuplicate found (${d.entries.length} occurrences):`);
      console.log(`  Normalized: "${d.normalized}"`);
      d.entries.forEach((e, idx) => {
        console.log(`  Occurrence ${idx + 1} at position ${e.position}:`);
        console.log(`    Raw value: "${e.raw}"`);
        console.log(`    Char codes: [${[...e.raw].slice(0, 30).map(c => c.charCodeAt(0)).join(', ')}${e.raw.length > 30 ? '...' : ''}]`);
      });
      
      // Check if they're exactly identical or just normalized identical
      const rawValues = d.entries.map(e => e.raw);
      const allIdentical = rawValues.every(v => v === rawValues[0]);
      console.log(`  Exact match: ${allIdentical ? 'YES - 100% identical' : 'NO - only similar after whitespace normalization'}`);
      if (!allIdentical) {
        console.log(`  Differences:`);
        for (let i = 1; i < rawValues.length; i++) {
          if (rawValues[i] !== rawValues[0]) {
            console.log(`    "${rawValues[0]}" vs "${rawValues[i]}"`);
          }
        }
      }
    });
  }
  console.log('\n');
});
