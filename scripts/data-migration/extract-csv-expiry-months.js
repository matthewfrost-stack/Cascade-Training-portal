import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

// Get all CSV files
const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv'));

console.log(`Processing ${csvFiles.length} CSV files...\n`);

const courseMonths = {};

csvFiles.forEach(file => {
  const filePath = path.join(CSV_FOLDER, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Headers are in first 2 rows
  // Third row has the months
  if (lines.length >= 3) {
    const headerLine = lines[0];
    const monthLine = lines[2];
    
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    const months = monthLine.split(',').map(m => m.trim().replace(/"/g, ''));
    
    headers.forEach((header, idx) => {
      if (header && header.length > 0) {
        const month = months[idx];
        const monthNum = month ? parseInt(month) : null;
        
        if (!courseMonths[header]) {
          courseMonths[header] = monthNum;
        } else if (monthNum && courseMonths[header] !== monthNum) {
          console.warn(`⚠️  INCONSISTENCY: ${header} has ${courseMonths[header]} in one file and ${monthNum} in another`);
        }
      }
    });
  }
});

// Sort and display
const sorted = Object.entries(courseMonths).sort((a, b) => a[0].localeCompare(b[0]));

console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
console.log('  COURSES AND EXPIRY MONTHS FROM CSV FILES');
console.log('════════════════════════════════════════════════════════════════════════════════════════\n');

sorted.forEach(([course, months]) => {
  const display = months ? `${months} months` : 'NOT SET/BLANK';
  console.log(`${course}`);
  console.log(`  → ${display}\n`);
});

console.log(`\nTotal courses found in CSV: ${sorted.length}`);
