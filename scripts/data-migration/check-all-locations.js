require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAllLocations() {
  console.log('=== CHECKING ALL LOCATIONS ===\n');
  
  const { data: locations } = await supabase.from('locations').select('id, name').order('name');
  
  let totalRecords = 0;
  let totalWithDates = 0;
  let totalWithExpiry = 0;
  
  for (const loc of locations) {
    // Get staff count
    const { count: staffCount } = await supabase
      .from('staff_locations')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    // Get staff with display_order
    const { count: staffWithOrder } = await supabase
      .from('staff_locations')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', loc.id)
      .not('display_order', 'is', null);
    
    // Get divider count
    const { count: dividerCount } = await supabase
      .from('location_matrix_dividers')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    // Get training record counts
    const { count: records } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id);
    
    const { count: withDates } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id)
      .not('completion_date', 'is', null);
    
    const { count: withExpiry } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id)
      .not('expiry_date', 'is', null);
    
    const pctWithDates = records > 0 ? Math.round((withDates / records) * 100) : 0;
    
    console.log(`📍 ${loc.name}`);
    console.log(`   Staff: ${staffCount} (${staffWithOrder} with order), Dividers: ${dividerCount}`);
    console.log(`   Training: ${records} total, ${withDates} with dates (${pctWithDates}%), ${withExpiry} with expiry`);
    console.log('');
    
    totalRecords += records || 0;
    totalWithDates += withDates || 0;
    totalWithExpiry += withExpiry || 0;
  }
  
  console.log('=== TOTALS ===');
  console.log(`Total records: ${totalRecords}`);
  console.log(`With completion_date: ${totalWithDates} (${Math.round((totalWithDates / totalRecords) * 100)}%)`);
  console.log(`With expiry_date: ${totalWithExpiry} (${Math.round((totalWithExpiry / totalRecords) * 100)}%)`);
}

checkAllLocations().catch(console.error);
