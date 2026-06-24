import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySyncResults() {
  try {
    // Check total record count
    const { count: totalCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true });

    console.log(`Total records in database: ${totalCount}`);

    // Check records with completion dates
    const { data: withDates, count: datesCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact' })
      .not('completion_date', 'is', null)
      .limit(5);

    console.log(`Records with completion_date: ${datesCount}`);
    if (withDates?.length > 0) {
      console.log('Sample records with dates:');
      withDates.forEach(rec => {
        console.log(`  - ${rec.staff_name} @ ${rec.location_name}: ${rec.course_name} (${rec.completion_date})`);
      });
    }

    // Check records without completion dates (status-only)
    const { data: noDates, count: noDatesCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact' })
      .is('completion_date', null)
      .limit(5);

    console.log(`Records WITHOUT completion_date: ${noDatesCount}`);
    if (noDates?.length > 0) {
      console.log('Sample status-only records:');
      noDates.forEach(rec => {
        console.log(`  - ${rec.staff_name} @ ${rec.location_name}: ${rec.course_name} (${rec.status})`);
      });
    }

    // Check per location
    console.log('\nRecords by location:');
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    for (const loc of locations || []) {
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', loc.id);
      
      console.log(`  - ${loc.name}: ${count} records`);
    }

    // Check courses per location
    console.log('\nCourses with data by location sample (first 3 locations):');
    const { data: locData } = await supabase
      .from('locations')
      .select('id, name')
      .order('name')
      .limit(3);

    for (const loc of locData || []) {
      const { data: courses } = await supabase
        .from('staff_training_matrix')
        .select('course_id, course_name')
        .eq('location_id', loc.id)
        .not('completion_date', 'is', null)
        .distinct();

      const uniqueCourses = [...new Set((courses || []).map(c => c.course_name))];
      console.log(`  ${loc.name}: ${uniqueCourses.length} courses with completion dates`);
    }

  } catch (error) {
    console.error('Error verifying sync:', error.message);
  }
}

verifySyncResults();
