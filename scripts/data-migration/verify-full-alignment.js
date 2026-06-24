require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

async function verifyLocation(locationName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`VERIFYING: ${locationName}`);
  console.log(`${'='.repeat(60)}\n`);

  // Get location
  const { data: loc, error: locError } = await supabase
    .from('locations')
    .select('id, name')
    .eq('name', locationName)
    .single();

  if (locError || !loc) {
    console.error('Location not found:', locationName, locError);
    return;
  }

  // Get staff_locations with display_order
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id, display_order, profiles(id, full_name)')
    .eq('location_id', loc.id)
    .order('display_order', { ascending: true, nullsFirst: false });

  // Get dividers
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('id, name, display_order')
    .eq('location_id', loc.id)
    .order('display_order', { ascending: true });

  // Combine and sort like the UI does
  const staffWithOrder = staffLocs
    .filter(sl => sl.profiles && sl.display_order !== null)
    .map(sl => ({
      type: 'staff',
      name: sl.profiles.full_name,
      staff_id: sl.staff_id,
      display_order: sl.display_order || 9999
    }));

  const dividerItems = dividers.map(d => ({
    type: 'divider',
    name: d.name,
    display_order: d.display_order
  }));

  const combined = [...staffWithOrder, ...dividerItems]
    .sort((a, b) => a.display_order - b.display_order);

  console.log('Database staff/divider order:');
  combined.slice(0, 20).forEach((item, i) => {
    const prefix = item.type === 'divider' ? '📌 [DIVIDER]' : '   ';
    console.log(`  ${item.display_order}. ${prefix} ${item.name}`);
  });

  // Parse CSV to compare
  const csvPath = path.join(CSV_DIR, `${locationName} Training Matrix - Staff Matrix.csv`);
  if (!fs.existsSync(csvPath)) {
    console.log('\n⚠️  No CSV file found for comparison');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');

  // Find "Staff Name" row
  let headerRow = -1;
  for (let i = 0; i < Math.min(60, lines.length); i++) {
    if (lines[i] && lines[i].toLowerCase().includes('staff name')) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    console.log('\n⚠️  Could not find Staff Name header in CSV');
    return;
  }

  const headers = lines[headerRow].split(',').map(h => h.replace(/"/g, '').trim());
  console.log('\nCSV Courses (first 5):', headers.slice(1, 6).join(', '));

  // Extract CSV order
  console.log('\nCSV order (first 20 rows):');
  let csvOrder = [];
  for (let i = headerRow + 1; i < Math.min(headerRow + 60, lines.length); i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const name = cols[0];
    if (!name || name.length < 2) continue;
    if (name.toLowerCase().includes('date valid')) continue;
    if (name.includes('->')) continue;
    if (name.toLowerCase().includes('notes')) continue;
    if (name.toLowerCase().includes('mandatory')) continue;
    if (name.toLowerCase().includes('training level')) continue;
    if (name.toLowerCase().includes('modules')) continue;
    if (name.toLowerCase().includes('phase')) continue;
    if (name.toLowerCase().includes('core')) continue;
    
    csvOrder.push({
      name,
      date1: cols[1] || '',
      date2: cols[2] || ''
    });
  }

  csvOrder.slice(0, 20).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.name} (${item.date1}, ${item.date2})`);
  });

  // Compare CSV staff with DB
  console.log('\n--- Comparison ---');
  let matchCount = 0;
  let mismatchCount = 0;

  for (let i = 0; i < Math.min(10, csvOrder.length); i++) {
    const csvItem = csvOrder[i];
    const dbItem = combined[i];

    if (!dbItem) {
      console.log(`❌ CSV[${i}]: "${csvItem.name}" - No matching DB entry`);
      mismatchCount++;
      continue;
    }

    if (csvItem.name.toLowerCase() === dbItem.name.toLowerCase() ||
        (csvItem.name.toLowerCase().includes(dbItem.name.toLowerCase().split(' ')[0]))) {
      console.log(`✅ Position ${i + 1}: CSV="${csvItem.name}" DB="${dbItem.name}"`);
      matchCount++;
    } else {
      console.log(`❌ Position ${i + 1}: CSV="${csvItem.name}" vs DB="${dbItem.name}"`);
      mismatchCount++;
    }
  }

  console.log(`\nResult: ${matchCount} matches, ${mismatchCount} mismatches in first 10 positions`);

  // Sample a staff member's training data
  if (staffWithOrder.length > 0) {
    const sampleStaff = staffWithOrder[0];
    console.log(`\n--- Sample training data for ${sampleStaff.name} ---`);
    
    const { data: training } = await supabase
      .from('staff_training_matrix')
      .select('training_courses(name), completion_date, expiry_date, status')
      .eq('staff_id', sampleStaff.staff_id)
      .eq('completed_at_location_id', loc.id)
      .limit(5);

    if (training && training.length > 0) {
      training.forEach(t => {
        const date = t.completion_date 
          ? new Date(t.completion_date).toLocaleDateString('en-GB')
          : (t.status || 'no data');
        console.log(`  - ${t.training_courses?.name}: ${date}`);
      });
    } else {
      console.log('  (no training records found)');
    }
  }
}

async function main() {
  // Verify multiple locations
  const locations = ['Peters House', 'Armfield House', 'Banks House'];
  
  for (const loc of locations) {
    await verifyLocation(loc);
  }
}

main().catch(console.error);
