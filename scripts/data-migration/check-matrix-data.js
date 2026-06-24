require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
  // Get a sample location
  const { data: locations } = await supabase.from('locations').select('id, name').limit(1);
  const locId = locations[0].id;
  const locName = locations[0].name;
  
  console.log(`=== Checking ${locName} ===\n`);
  
  // 1. Check staff ordering
  console.log('--- STAFF ORDER CHECK ---');
  const { data: staffWithOrder } = await supabase
    .from('staff_locations')
    .select('display_order, profiles(full_name)')
    .eq('location_id', locId)
    .order('display_order', { ascending: true })
    .limit(15);
  
  console.log('First 15 staff by display_order:');
  staffWithOrder?.forEach((s, i) => {
    console.log(`  ${i+1}. [order: ${s.display_order}] ${s.profiles?.full_name}`);
  });
  
  // 2. Check dividers
  console.log('\n--- DIVIDERS CHECK ---');
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('name, display_order')
    .eq('location_id', locId)
    .order('display_order', { ascending: true });
  
  console.log('Dividers:');
  dividers?.forEach(d => {
    console.log(`  [order: ${d.display_order}] ${d.name}`);
  });
  
  // 3. Check training data
  console.log('\n--- TRAINING DATA CHECK ---');
  const { count: totalRecords } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('completed_at_location_id', locId);
  
  console.log(`Total training records for ${locName}: ${totalRecords}`);
  
  const { count: withDates } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('completed_at_location_id', locId)
    .not('completion_date', 'is', null);
  
  console.log(`Records with completion_date: ${withDates}`);
  
  const { count: withExpiry } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('completed_at_location_id', locId)
    .not('expiry_date', 'is', null);
  
  console.log(`Records with expiry_date: ${withExpiry}`);
  
  // 4. Check sample training records
  console.log('\n--- SAMPLE TRAINING RECORDS ---');
  const { data: sampleRecords } = await supabase
    .from('staff_training_matrix')
    .select('staff_id, course_id, completion_date, expiry_date, status, profiles(full_name), training_courses(name)')
    .eq('completed_at_location_id', locId)
    .not('completion_date', 'is', null)
    .limit(5);
  
  sampleRecords?.forEach(r => {
    console.log(`  ${r.profiles?.full_name} | ${r.training_courses?.name} | ${r.completion_date} | exp: ${r.expiry_date}`);
  });
  
  // 5. Check for records without dates
  console.log('\n--- RECORDS WITHOUT COMPLETION DATE ---');
  const { data: noDateRecords } = await supabase
    .from('staff_training_matrix')
    .select('staff_id, course_id, status, profiles(full_name), training_courses(name)')
    .eq('completed_at_location_id', locId)
    .is('completion_date', null)
    .limit(5);
  
  noDateRecords?.forEach(r => {
    console.log(`  ${r.profiles?.full_name} | ${r.training_courses?.name} | status: ${r.status}`);
  });
  
  // 6. Check courses assigned to location
  console.log('\n--- COURSES FOR LOCATION ---');
  const { count: courseCount } = await supabase
    .from('location_training_courses')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locId);
  
  console.log(`Courses assigned to ${locName}: ${courseCount}`);
}

checkData().catch(console.error);
