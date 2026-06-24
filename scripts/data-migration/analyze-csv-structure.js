import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const csvDir = './csv-import';
const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

const firstFile = files[0];
const filePath = path.join(csvDir, firstFile);
const content = fs.readFileSync(filePath, 'utf-8');

const records = parse(content, {
  quote: '"',
  relax_column_count: true
});

console.log(`File: ${firstFile}\n`);
console.log(`Total rows: ${records.length}\n`);

// Print first 8 rows to see structure
console.log('=== FIRST 8 ROWS (showing first 80 chars of each) ===\n');
for (let i = 0; i < Math.min(8, records.length); i++) {
  const row = records[i];
  const preview = row.slice(0, 8).map(c => (c || '').substring(0, 15)).join(' | ');
  console.log(`Row ${i}: ${preview}`);
}

// Find where staff names start (looking for "Staff Name" or typical names)
console.log('\n=== Looking for Staff Name header ===\n');
for (let i = 0; i < records.length; i++) {
  if (records[i][0] && records[i][0].toLowerCase().includes('staff')) {
    console.log(`Row ${i}: ${records[i][0]}`);
    break;
  }
}

// Print a staff row to see what courses and dates look like
console.log('\n=== Sample staff row (first staff member) ===\n');
const staffStartRow = records.findIndex((r, i) => i > 0 && r[0] && r[0].length > 2 && !r[0].includes('Staff'));
if (staffStartRow >= 0) {
  const staffRow = records[staffStartRow];
  console.log(`Row ${staffStartRow}: ${staffRow[0]}`);
  console.log(`Columns 1-10: ${staffRow.slice(1, 11).map((c, i) => `${i}:${(c || '').substring(0, 10)}`).join(' | ')}`);
}
