require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get Group location
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('name', 'Group')
    .single();

  console.log('=== Checking Pagination Issues ===\n');
  
  // Count records with completed_at_location_id = Group
  const { count: withLocId } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('completed_at_location_id', loc.id);
  
  console.log('Records with completed_at_location_id = Group:', withLocId);
  
  // Get Group staff
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id')
    .eq('location_id', loc.id);
  const staffIds = staffLocs.map(s => s.staff_id);
  
  // Count total records for Group staff
  const { count: byStaffId } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .in('staff_id', staffIds);
  
  console.log('Records for Group staff (by staff_id):', byStaffId);
  
  // Check how many have null completed_at_location_id
  const { count: nullLocId } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .in('staff_id', staffIds)
    .is('completed_at_location_id', null);
  
  console.log('Records with NULL completed_at_location_id:', nullLocId);
  
  // Check total records in database
  const { count: total } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });
  
  console.log('\nTotal records in database:', total);
  
  // Check all records with null completed_at_location_id
  const { count: totalNull } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('completed_at_location_id', null);
  
  console.log('All records with NULL completed_at_location_id:', totalNull);
})();
