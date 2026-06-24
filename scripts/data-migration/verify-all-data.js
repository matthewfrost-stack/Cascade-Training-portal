require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// CSV parsing helper
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
      if (c === '"') {
        inQ = !inQ;
      } else if (c === ',' && !inQ) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell.trim());
    return cells;
  });
}

// Known divider labels in CSVs
const DIVIDER_LABELS = [
  'team leaders', 'team leader', 'lead support', 'lead supports',
  'support workers', 'support staff', 'management', 'management and admin',
  'admin', 'health and wellbeing', 'waking night', 'waking nights',
  'teachers', 'teaching staff', 'education', 'senior', 'seniors',
  'deputy', 'deputies', 'registered manager', 'managers'
];

function isDividerLabel(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d);
}

// Check if a row looks like a staff row
function isStaffRow(row) {
  const firstCell = row[0]?.trim() || '';
  if (!firstCell) return false;
  if (firstCell.toLowerCase().includes('staff name')) return false;
  if (firstCell.toLowerCase().includes('notes')) return false;
  if (firstCell.toLowerCase().includes('date valid')) return false;
  if (firstCell.toLowerCase().includes('careskills')) return false;
  if (firstCell.toLowerCase().includes('phase')) return false;
  
  // Check if it's a divider row (recognized label with mostly empty cells after)
  if (isDividerLabel(firstCell)) {
    return true;
  }
  
  const hasDateOrStatus = row.slice(1, 10).some(cell => {
    const val = cell?.trim()?.toLowerCase() || '';
    return val.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/) || 
           val === 'n/a' || val === 'na' || 
           val === 'booked' || val.includes('awaiting');
  });
  
  const nameParts = firstCell.split(' ').filter(p => p.length > 1);
  return nameParts.length >= 2 || hasDateOrStatus;
}

const locationFiles = {
  'Armfield House': 'Armfield House Training Matrix - Staff Matrix.csv',
  'Banks House': 'Banks House Training Matrix - Staff Matrix.csv',
  'Bonetti House': 'Bonetti House Training Matrix - Staff Matrix.csv',
  'Charlton House': 'Charlton House Training Matrix - Staff Matrix.csv',
  'Cohen House': 'Cohen House Training Matrix - Staff Matrix.csv',
  'Felix House': 'Felix House Training Matrix - Staff Matrix.csv',
  'Hurst House': 'Hurst House Training Matrix - Staff Matrix.csv',
  'Moore House': 'Moore House Training Matrix - Staff Matrix.csv',
  'Peters House': 'Peters House Training Matrix - Staff Matrix.csv',
  'Stiles House': 'Stiles House Training Matrix - Staff Matrix.csv',
  'Banks House School': 'Banks House School Training Matrix - Staff Matrix.csv',
  'Felix House School': 'Felix House School Training Matrix - Staff Matrix.csv',
  'Group': 'Group Training Matrix - Staff Matrix.csv'
};

(async () => {
  console.log('=== COMPREHENSIVE VERIFICATION ===\n');
  
  const { data: locations } = await supabase.from('locations').select('id, name');
  const locMap = new Map(locations.map(l => [l.name, l.id]));
  
  const issues = [];
  const summaries = [];
  
  for (const [locName, csvFile] of Object.entries(locationFiles)) {
    const locId = locMap.get(locName);
    if (!locId) {
      issues.push(`${locName}: Location not found in DB`);
      continue;
    }
    
    const csvPath = path.join(__dirname, 'csv-import', csvFile);
    if (!fs.existsSync(csvPath)) {
      issues.push(`${locName}: CSV file not found`);
      continue;
    }
    
    console.log(`\n=== ${locName} ===`);
    
    // Use simple line-by-line parsing for accuracy
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    
    const csvStaff = [];
    const csvDividers = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const name = cells[0]?.trim();
      if (!name) continue;
      
      if (isDividerLabel(name)) {
        csvDividers.push({ name, rowIndex: i });
      } else {
        // Check if it's a staff row (has dates/statuses)
        const hasDate = cells.slice(1, 15).some(c => c && c.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/));
        const hasStatus = cells.slice(1, 15).some(c => {
          const v = (c || '').toLowerCase().trim();
          return v === 'n/a' || v === 'na' || v === 'booked' || v.includes('awaiting');
        });
        if (hasDate || hasStatus) {
          csvStaff.push({ name, rowIndex: i });
        }
      }
    }
    
    const { data: dbStaffLocs } = await supabase
      .from('staff_locations')
      .select('staff_id, display_order, profiles(id, full_name)')
      .eq('location_id', locId)
      .order('display_order', { ascending: true });
    
    const dbStaff = dbStaffLocs
      .filter(sl => sl.profiles && !sl.profiles.full_name?.includes('[DELETED'))
      .map(sl => ({ name: sl.profiles.full_name, staffId: sl.staff_id, order: sl.display_order }));
    
    let staffMatches = 0;
    let staffMismatches = [];
    for (let i = 0; i < Math.min(csvStaff.length, dbStaff.length); i++) {
      const csvFirstName = csvStaff[i].name.split(' ')[0].toLowerCase().trim();
      const dbFirstName = dbStaff[i]?.name?.split(' ')[0]?.toLowerCase().trim() || '';
      
      if (csvFirstName === dbFirstName) {
        staffMatches++;
      } else {
        staffMismatches.push({ pos: i + 1, csv: csvStaff[i].name, db: dbStaff[i]?.name || 'MISSING' });
      }
    }
    
    const staffMatchPct = Math.round((staffMatches / csvStaff.length) * 100);
    if (staffMatchPct >= 90) {
      console.log(`  ✅ Staff order: ${staffMatches}/${csvStaff.length} (${staffMatchPct}%) match`);
    } else {
      console.log(`  ❌ Staff order: ${staffMatches}/${csvStaff.length} (${staffMatchPct}%) match`);
      staffMismatches.slice(0, 3).forEach(m => {
        console.log(`     Position ${m.pos}: CSV="${m.csv}" vs DB="${m.db}"`);
      });
      issues.push(`${locName}: Staff order ${staffMatchPct}%`);
    }
    
    const { data: dbDividers } = await supabase
      .from('location_matrix_dividers')
      .select('*')
      .eq('location_id', locId)
      .order('display_order');
    
    if (csvDividers.length > 0) {
      if (dbDividers && dbDividers.length >= csvDividers.length) {
        console.log(`  ✅ Dividers: ${dbDividers.length} in DB (CSV has ${csvDividers.length})`);
      } else {
        console.log(`  ⚠️ Dividers: DB has ${dbDividers?.length || 0}, CSV has ${csvDividers.length}`);
      }
    } else {
      console.log(`  ⚪ Dividers: None in CSV`);
    }
    
    const { data: dbLocCourses } = await supabase
      .from('location_courses')
      .select('course_id')
      .eq('location_id', locId);
    
    console.log(`  📚 Courses: ${dbLocCourses?.length || 0} linked to location`);
    
    const staffIds = dbStaff.map(s => s.staffId);
    const { count: recordCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .in('staff_id', staffIds);
    
    const expectedRecords = dbStaff.length * (dbLocCourses?.length || 0);
    const recordPct = expectedRecords > 0 ? Math.round((recordCount / expectedRecords) * 100) : 0;
    
    if (recordPct >= 100) {
      console.log(`  ✅ Records: ${recordCount} (${recordPct}% of expected)`);
    } else {
      console.log(`  ⚠️ Records: ${recordCount} (${recordPct}% of expected ${expectedRecords})`);
    }
    
    summaries.push({
      location: locName,
      csvStaff: csvStaff.length,
      dbStaff: dbStaff.length,
      staffMatch: staffMatchPct,
      dividers: dbDividers?.length || 0,
      courses: dbLocCourses?.length || 0,
      records: recordCount,
      recordPct
    });
  }
  
  console.log('\n\n=== SUMMARY TABLE ===');
  console.log('Location                  | CSV Staff | DB Staff | Match% | Dividers | Courses | Records');
  console.log('-'.repeat(95));
  for (const s of summaries) {
    const loc = s.location.padEnd(25);
    const csv = String(s.csvStaff).padStart(9);
    const db = String(s.dbStaff).padStart(8);
    const match = (s.staffMatch + '%').padStart(6);
    const div = String(s.dividers).padStart(8);
    const courses = String(s.courses).padStart(7);
    const rec = String(s.records).padStart(7);
    console.log(`${loc} | ${csv} | ${db} | ${match} | ${div} | ${courses} | ${rec}`);
  }
  
  if (issues.length > 0) {
    console.log(`\n⚠️ ${issues.length} issues to review`);
  } else {
    console.log('\n✅ All locations look good!');
  }
})();
