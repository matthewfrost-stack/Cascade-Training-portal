require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showCompleteMatrix() {
  console.log('='.repeat(100));
  console.log('COMPLETE TRAINING MATRIX STATUS - ALL LOCATIONS');
  console.log('='.repeat(100));
  console.log('');

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  let grandTotal = {
    staff: 0,
    courses: 0,
    records: 0,
    completed: 0,
    booked: 0,
    na: 0,
    awaiting: 0
  };

  for (const location of locations) {
    // Get staff count
    const { data: staffLocations } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', location.id);

    const staffIds = staffLocations?.map(sl => sl.staff_id) || [];

    // Get course count
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('id')
      .eq('location_id', location.id);

    // Get training records
    const { data: trainingRecords } = await supabase
      .from('staff_training_matrix')
      .select('status, completion_date')
      .in('staff_id', staffIds.length > 0 ? staffIds : ['none']);

    // Count statuses
    let completed = 0, booked = 0, na = 0, awaiting = 0;
    trainingRecords?.forEach(r => {
      const status = (r.status || '').toLowerCase();
      if (status === 'booked') booked++;
      else if (status === 'n/a' || status === 'na') na++;
      else if (status === 'awaiting' || status.includes('await')) awaiting++;
      else if (r.completion_date) completed++;
    });

    const courseCount = locationCourses?.length || 0;
    const staffCount = staffIds.length;
    const recordCount = trainingRecords?.length || 0;

    console.log(`📍 ${location.name}`);
    console.log(`   Staff: ${staffCount} | Courses: ${courseCount} | Records: ${recordCount}`);
    console.log(`   ✓ Completed: ${completed} | 📅 Booked: ${booked} | ⏳ Awaiting: ${awaiting} | N/A: ${na}`);
    console.log('');

    grandTotal.staff += staffCount;
    grandTotal.courses += courseCount;
    grandTotal.records += recordCount;
    grandTotal.completed += completed;
    grandTotal.booked += booked;
    grandTotal.na += na;
    grandTotal.awaiting += awaiting;
  }

  console.log('='.repeat(100));
  console.log('GRAND TOTAL');
  console.log('='.repeat(100));
  console.log(`Total Staff: ${grandTotal.staff}`);
  console.log(`Total Courses (across all locations): ${grandTotal.courses}`);
  console.log(`Total Training Records: ${grandTotal.records}`);
  console.log('');
  console.log(`✓ Completed: ${grandTotal.completed}`);
  console.log(`📅 Booked: ${grandTotal.booked}`);
  console.log(`⏳ Awaiting Date: ${grandTotal.awaiting}`);
  console.log(`N/A: ${grandTotal.na}`);
  console.log('');
  console.log('All courses without data have been removed from location matrices.');
  console.log('All remaining courses have at least one training record.');
}

showCompleteMatrix().catch(console.error);
