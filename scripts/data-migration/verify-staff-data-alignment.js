require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

async function main() {
  // Test with Peters House first
  const { data: loc } = await supabase.from('locations').select('id, name').eq('name', 'Peters House').single();
  console.log('=== Checking:', loc.name, '===\n');
  
  // Get staff from CSV
  const csvPath = path.join(CSV_DIR, `${loc.name} Training Matrix - Staff Matrix.csv`);
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  // Find header row to get course names - search more lines due to multi-line cells
  let headerRow = -1;
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    if (lines[i] && lines[i].toLowerCase().includes('staff name')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('Could not find header row');
    return;
  }
  
  console.log('Found header at row:', headerRow);
  const headers = lines[headerRow].split(',').map(h => h.replace(/"/g, '').trim());
  console.log('CSV Headers (first 5 courses):', headers.slice(1, 6));
  
  // Find first staff member with data - skip all header-like rows
  let firstStaffRow = -1;
  const skipPatterns = [
    /^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training Advanced)/i,
    /^(Training Level|Modules|Notes|->|Date Valid|Mandatory|Core|Manager|Phase|Careskills)/i,
    /^(PREVENT|Fire Safety|Emergency|NVQ|Supervision|GDPR|Safeguard)/i,
    /^\s*$/
  ];
  
  for (let i = headerRow + 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[0].replace(/"/g, '').trim();
    
    // Skip if matches any header pattern or is too short
    if (!name || name.length < 3) continue;
    let isHeader = false;
    for (const pattern of skipPatterns) {
      if (pattern.test(name)) {
        isHeader = true;
        break;
      }
    }
    if (isHeader) continue;
    
    // Looks like a real name - should have multiple words or proper capitalization
    if (name.includes(' ') || /^[A-Z][a-z]+$/.test(name)) {
      firstStaffRow = i;
      break;
    }
  }

  if (firstStaffRow === -1) {
    console.log('Could not find first staff row');
    return;
  }
  
  console.log('First staff row:', firstStaffRow, '- Content:', lines[firstStaffRow].substring(0, 50));
  
  // Get first 5 actual staff from CSV with their dates
  console.log('\n--- First 5 Staff Members from CSV ---');
  let staffChecked = 0;
  
  const staffSkipPatterns = [
    /^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training Advanced)/i,
    /^(Training Level|Modules|Notes|->|Date Valid|Mandatory|Core|Manager|Phase|Careskills)/i,
    /^(PREVENT|Fire Safety|Emergency|NVQ|Supervision|GDPR|Safeguard|Sickness|Currently Inactive)/i,
    /^\s*$/
  ];
  
  for (let i = firstStaffRow; i < lines.length && staffChecked < 5; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const name = cols[0];
    
    if (!name || name.length < 3) continue;
    let isHeader = false;
    for (const pattern of staffSkipPatterns) {
      if (pattern.test(name)) {
        isHeader = true;
        break;
      }
    }
    if (isHeader) continue;
    
    // Should look like a person's name
    if (!name.includes(' ') && !/^[A-Z][a-z]+$/.test(name)) continue;
    
    staffChecked++;
    console.log(`\n${staffChecked}. CSV: "${name}"`);
    console.log(`   CSV dates (cols 1-5): ${cols.slice(1, 6).join(' | ')}`);
    
    // Find this staff member in the database
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', name)
      .single();
    
    if (!profile) {
      console.log(`   ❌ NOT FOUND in database`);
      continue;
    }
    
    console.log(`   DB: "${profile.full_name}" (${profile.id.substring(0, 8)}...)`);
    
    // Get display_order from staff_locations
    const { data: staffLoc } = await supabase
      .from('staff_locations')
      .select('display_order')
      .eq('staff_id', profile.id)
      .eq('location_id', loc.id)
      .single();
    
    console.log(`   Display Order: ${staffLoc?.display_order || 'NULL'}`);
    
    // Get training records for this staff
    const { data: training, error: trainErr } = await supabase
      .from('staff_training_matrix')
      .select('training_courses(name), completion_date, expiry_date, status')
      .eq('staff_id', profile.id)
      .limit(5);
    
    console.log(`   DB Training Records (first 5):`);
    if (trainErr) {
      console.log(`      Error: ${trainErr.message}`);
    } else if (!training || training.length === 0) {
      console.log(`      (no records found)`);
    } else {
      training.forEach(t => {
        const dateStr = t.completion_date 
          ? new Date(t.completion_date).toLocaleDateString('en-GB') 
          : (t.status || 'no data');
        console.log(`      - ${t.training_courses?.name}: ${dateStr}`);
      });
    }
  }
  
  // Now check if the training matrix page query would return correct data
  console.log('\n\n--- Verifying Matrix Data Query ---');
  
  // Get staff with display_order for this location (what the UI does)
  const { data: staffList, error: staffErr } = await supabase
    .from('staff_locations')
    .select(`
      staff_id,
      display_order,
      profiles!inner(id, full_name)
    `)
    .eq('location_id', loc.id)
    .eq('profiles.is_deleted', false)
    .not('display_order', 'is', null)
    .order('display_order', { ascending: true })
    .limit(5);
  
  if (staffErr) {
    console.log('Error fetching staff:', staffErr);
    return;
  }
  
  console.log('\nUI would display these staff (by display_order):');
  for (const sl of staffList) {
    console.log(`  ${sl.display_order}. ${sl.profiles.full_name}`);
  }
  
  // Get dividers
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('name, display_order')
    .eq('location_id', loc.id)
    .order('display_order', { ascending: true });
  
  console.log('\nDividers:');
  dividers.forEach(d => console.log(`  ${d.display_order}. [DIVIDER: ${d.name}]`));
}

main().catch(console.error);
