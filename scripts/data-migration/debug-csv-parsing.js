require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const DIVIDER_LABELS = [
  'team leaders', 'team leader', 'lead support', 'lead supports',
  'support workers', 'support staff', 'management', 'management and admin',
  'admin', 'health and wellbeing', 'waking night', 'waking nights',
  'teachers', 'teaching staff', 'education', 'senior', 'seniors',
  'deputy', 'deputies', 'registered manager', 'managers',
  'operations', 'compliance', 'adult education', 'it', 'finance',
  'maintenance', 'volunteers', 'hr', 'human resources',
  'staff', 'probation', 'inactive', 'maternity leave', 'maternity', 'sick'
];

function isDividerRow(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d || lower.startsWith(d + ' ') || lower.includes(d));
}

function isStaffRow(row) {
  const firstCell = row[0]?.trim() || '';
  if (!firstCell) return false;
  if (firstCell.toLowerCase().includes('staff name')) return false;
  if (firstCell.toLowerCase().includes('notes')) return false;
  if (firstCell.toLowerCase().includes('date valid')) return false;
  if (firstCell.toLowerCase().includes('careskills')) return false;
  if (firstCell.toLowerCase().includes('phase')) return false;
  
  if (isDividerRow(firstCell)) return true;
  
  const hasDateOrStatus = row.slice(1, 10).some(cell => {
    const val = cell?.trim()?.toLowerCase() || '';
    return val.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/) || 
           val === 'n/a' || val === 'na' || 
           val === 'booked' || val.includes('awaiting');
  });
  
  const nameParts = firstCell.split(' ').filter(p => p.length > 1);
  return nameParts.length >= 2 || hasDateOrStatus;
}

// Simple CSV parser
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) lines.push(current);
  
  return lines.map(line => {
    const cells = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cells.push(cell.replace(/^"|"$/g, '').trim()); cell = ''; }
      else { cell += c; }
    }
    cells.push(cell.replace(/^"|"$/g, '').trim());
    return cells;
  });
}

const csvPath = '/Users/matthewfrost/training-portal/csv-import/Armfield House Training Matrix - Staff Matrix.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const rows = parseCSV(content);

console.log('=== DEBUG CSV PARSING ===\n');

let position = 0;
for (let i = 0; i < rows.length && position < 30; i++) {
  const row = rows[i];
  const firstCell = row[0]?.trim() || '';
  const isStaff = isStaffRow(row);
  const isDivider = isDividerRow(firstCell);
  
  if (isStaff) {
    position++;
    console.log(`Row ${i+1} -> Position ${position}: "${firstCell}" ${isDivider ? '[DIVIDER]' : ''}`);
  } else if (firstCell) {
    console.log(`Row ${i+1} -> SKIPPED: "${firstCell.substring(0, 40)}..."`);
  }
}
