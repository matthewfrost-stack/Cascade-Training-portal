require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== Fixing Missing completed_at_location_id ===\n');
  
  // Get all locations
  const { data: locations } = await supabase.from('locations').select('id, name');
  
  let totalFixed = 0;
  
  for (const loc of locations) {
    // Get staff at this location
    const { data: staffLocs } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', loc.id);
    
    if (!staffLocs || staffLocs.length === 0) continue;
    
    const staffIds = staffLocs.map(s => s.staff_id);
    
    // Count records with null completed_at_location_id for these staff
    const { count: nullCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .in('staff_id', staffIds)
      .is('completed_at_location_id', null);
    
    if (nullCount > 0) {
      console.log(`${loc.name}: ${nullCount} records need fixing`);
      
      // Update in batches
      for (const staffId of staffIds) {
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ completed_at_location_id: loc.id })
          .eq('staff_id', staffId)
          .is('completed_at_location_id', null);
        
        if (error) {
          console.log(`  Error for staff ${staffId}: ${error.message}`);
        }
      }
      
      totalFixed += nullCount;
    }
  }
  
  console.log(`\nTotal fixed: ${totalFixed}`);
  
  // Verify
  const { count: remaining } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('completed_at_location_id', null);
  
  console.log(`Records still missing completed_at_location_id: ${remaining}`);
})();
