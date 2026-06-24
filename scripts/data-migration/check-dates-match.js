require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDates() {
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Peters House').single();
  
  // Get the first course (CYP Safeguarding)
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name')
    .ilike('name', '%CYP Safeguarding%')
    .limit(1);
  
  const course = courses?.[0];
  console.log('Course:', course?.name);
  
  // Get staff with display_order
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id, display_order, profiles(id, full_name)')
    .eq('location_id', loc.id)
    .not('display_order', 'is', null)
    .order('display_order', { ascending: true })
    .limit(10);
  
  console.log('\nFirst 10 staff with their CYP Safeguarding dates:');
  console.log('Order | Name                      | DB Date       | CSV Date');
  console.log('------+---------------------------+---------------+---------------');
  
  // Parse CSV for comparison
  const content = fs.readFileSync('/Users/matthewfrost/training-portal/csv-import/Peters House Training Matrix - Staff Matrix.csv', 'utf-8');
  const lines = content.split('\n');
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < 60; i++) {
    if (lines[i]?.toLowerCase().includes('staff name')) {
      headerRow = i;
      break;
    }
  }
  
  // Build CSV lookup by name
  const csvDates = {};
  for (let i = headerRow + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const name = cols[0];
    if (name && name.length > 2) {
      csvDates[name.toLowerCase()] = cols[1]; // CYP Safeguarding is column 1
    }
  }
  
  for (const sl of staffLocs) {
    const staffName = sl.profiles.full_name;
    
    // Get training record for this staff and course
    const { data: training } = await supabase
      .from('staff_training_matrix')
      .select('completion_date, status')
      .eq('staff_id', sl.staff_id)
      .eq('course_id', course.id)
      .single();
    
    let dbDate = '(none)';
    if (training?.completion_date) {
      dbDate = new Date(training.completion_date).toLocaleDateString('en-GB');
    } else if (training?.status) {
      dbDate = training.status;
    }
    
    const csvDate = csvDates[staffName.toLowerCase()] || '(not in CSV)';
    
    const orderStr = sl.display_order.toString().padStart(5);
    const nameStr = staffName.padEnd(25);
    
    console.log(`${orderStr} | ${nameStr} | ${dbDate.padEnd(13)} | ${csvDate}`);
  }
}

checkDates().catch(console.error);
