require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fullSummary() {
  console.log('=== FULL LOCATION VERIFICATION SUMMARY ===\n');

  const { data: locations } = await supabase.from('locations').select('id, name').order('name');

  for (const loc of locations) {
    console.log(`\n--- ${loc.name} ---`);
    
    // Count courses linked
    const { count: courseCount } = await supabase
      .from('location_training_courses')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    // Count staff with display_order
    const { count: staffCount } = await supabase
      .from('staff_locations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id)
      .not('display_order', 'is', null);
    
    // Count dividers
    const { count: dividerCount } = await supabase
      .from('location_matrix_dividers')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    // Count training records
    const { count: recordCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id);
    
    // Count records with dates
    const { count: withDates } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id)
      .not('completion_date', 'is', null);
    
    console.log(`  Courses linked: ${courseCount}`);
    console.log(`  Staff ordered: ${staffCount}`);
    console.log(`  Dividers: ${dividerCount}`);
    console.log(`  Training records: ${recordCount} (${withDates} with dates)`);
  }

  // Overall totals
  console.log('\n=== OVERALL TOTALS ===');
  
  const { count: totalCourses } = await supabase
    .from('training_courses')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalStaff } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false);
  
  const { count: totalRecords } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalWithDates } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null);
  
  console.log(`Total courses in system: ${totalCourses}`);
  console.log(`Total active staff: ${totalStaff}`);
  console.log(`Total training records: ${totalRecords}`);
  console.log(`Records with completion dates: ${totalWithDates} (${Math.round(totalWithDates/totalRecords*100)}%)`);
}

fullSummary().catch(console.error);
