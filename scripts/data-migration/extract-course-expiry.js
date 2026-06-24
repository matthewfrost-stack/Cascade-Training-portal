import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const csvDir = './csv-import';

// Get all CSV files
const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

console.log('Parsing CSV files to extract course expiry information...\n');

const courseExpiryMap = new Map(); // Map to track {courseName: {location: expiryMonths}}

files.forEach(file => {
  const filePath = path.join(csvDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Parse CSV with proper quoted field handling
  const records = parse(content, {
    quote: '"',
    relax_column_count: true
  });

  // Extract location name from filename (remove " Training Matrix - Staff Matrix.csv")
  const locationName = file.replace(' Training Matrix - Staff Matrix.csv', '').trim();
  console.log(`Processing: ${locationName}`);

  // Look for course headers in rows 1-2 and expiry info in rows 3-4
  // The structure appears to be: courses in row 2, with expiry info below
  if (records.length > 4) {
    // Row 2 typically has course names (row index 1 is header)
    const courseRow = records[1];
    const expiryRow = records[2]; // Row with expiry info
    
    if (courseRow && expiryRow) {
      console.log(`  Course row length: ${courseRow.filter(c => c).length}`);
      console.log(`  Expiry row length: ${expiryRow.filter(c => c).length}`);
      
      // Sample first few non-empty entries
      const sampleCourses = courseRow.filter(c => c).slice(0, 5);
      const sampleExpiry = expiryRow.filter(c => c).slice(0, 5);
      
      console.log(`  Sample courses: ${sampleCourses.join(', ')}`);
      console.log(`  Sample expiry: ${sampleExpiry.join(', ')}\n`);
    }
  }
});
