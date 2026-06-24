require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const {parse} = require('csv-parse/sync');

const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';
const files = [
  'Banks House School Training Matrix - Staff Matrix.csv', 
  'Felix House School Training Matrix - Staff Matrix.csv', 
  'Group Training Matrix - Staff Matrix.csv'
];

console.log('Checking for duplicate courses in problematic CSV files:\n');

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
  const seen = new Map();
  const dupes = [];
  
  courses.forEach((c, i) => {
    const name = c.trim().replace(/\s+/g, ' ');
    if (seen.has(name.toLowerCase())) {
      dupes.push({ name, positions: [seen.get(name.toLowerCase()) + 1, i + 1] });
    } else {
      seen.set(name.toLowerCase(), i);
    }
  });
  
  console.log(file.replace(' Training Matrix - Staff Matrix.csv', '') + ':');
  console.log('  Total courses:', courses.length);
  console.log('  Unique courses:', seen.size);
  console.log('  Duplicates:', dupes.length);
  if (dupes.length > 0) {
    dupes.forEach(d => console.log('    -', d.name.substring(0, 50), 'at positions', d.positions));
  }
  console.log('');
});
