const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findMissingExpiryDates() {
  console.log('\n' + '═'.repeat(120));
  console.log('  CHECK REMAINING MISSING EXPIRY DATES');
  console.log('═'.repeat(120) + '\n');

  // Get Armfield House location ID
  const { data: locations } = await supabase.from('locations').select('id, name');
  const armfieldId = locations.find(l => l.name === 'Armfield House')?.id;

  // Get records without expiry dates
  const { data: records } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
    .eq('completed_at_location_id', armfieldId)
    .eq('status', 'completed')
    .is('expiry_date', null);

  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
  const { data: profiles } = await supabase.from('profiles').select('id, full_name');

  const courseMap = {};
  courses.forEach(c => {
    courseMap[c.id] = { name: c.name, expiry_months: c.expiry_months };
  });

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.id] = p.full_name;
  });

  console.log(`Found ${records.length} records without expiry dates:\n`);

  for (const record of records) {
    const course = courseMap[record.course_id];
    console.log(`Record ${record.id}:`);
    console.log(`  Staff: ${profileMap[record.staff_id]}`);
    console.log(`  Course: ${course?.name || 'Unknown'}`);
    console.log(`  Completion date: ${record.completion_date || 'MISSING'}`);
    console.log(`  Status: ${record.status}\n`);
  }

  console.log('═'.repeat(120) + '\n');
}

findMissingExpiryDates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
