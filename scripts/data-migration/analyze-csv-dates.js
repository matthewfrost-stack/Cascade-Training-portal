const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const csvPath = '/Users/matthewfrost/training-portal/csv-import/Armfield House Training Matrix - Staff Matrix.csv';

const content = fs.readFileSync(csvPath, 'utf-8');
const records = parse(content);

let headerIdx = -1;
for (let i = 0; i < Math.min(10, records.length); i++) {
  if (records[i][0] === 'Staff Name') {
    headerIdx = i;
    break;
  }
}

console.log('Header row index:', headerIdx);
console.log('Header columns (first 10):', records[headerIdx].slice(0, 10));

// Find first real staff member
let staffIdx = headerIdx + 1;
while (staffIdx < records.length) {
  const staffName = records[staffIdx][0];
  if (staffName && staffName.trim() && !['Notes', 'Date valid for', 'Management', 'Team Leaders', 'Lead Support', 'Staff Team', 'Staff on Probation', 'Inactive'].includes(staffName.trim())) {
    break;
  }
  staffIdx++;
}

console.log('\nFirst staff member row index:', staffIdx);
console.log('Staff name:', records[staffIdx][0]);
console.log('First 5 training values:', records[staffIdx].slice(1, 6));

// Count how many staff have dates
let staffWithDates = 0;
let totalStaff = 0;
for (let i = staffIdx; i < records.length; i++) {
  const row = records[i];
  if (!row[0] || !row[0].trim()) break;
  
  const staffName = row[0].trim();
  if (!['Notes', 'Date valid for', 'Management', 'Team Leaders', 'Lead Support', 'Staff Team', 'Staff on Probation', 'Inactive'].includes(staffName)) {
    totalStaff++;
    const hasDates = row.slice(1).some(cell => cell && cell.toString().includes('/'));
    if (hasDates) staffWithDates++;
  }
}

console.log(`\nTotal staff in CSV: ${totalStaff}`);
console.log(`Staff with dates: ${staffWithDates}`);

// Show sample of values with dates
console.log('\nSample of values with dates:');
for (let i = staffIdx; i < Math.min(staffIdx + 5, records.length); i++) {
  const row = records[i];
  const staffName = row[0];
  const values = row.slice(1).filter(v => v && v.toString().includes('/'));
  if (values.length > 0) {
    console.log(`${staffName}: ${values.slice(0, 3).join(', ')}`);
  }
}
