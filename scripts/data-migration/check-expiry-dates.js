const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkExpiryDates() {
  try {
    console.log('Checking expiration date status...\n');

    // Get sample records with all details
    const { data: samples } = await supabase
      .from('staff_training_matrix')
      .select('status, completion_date, expiry_date')
      .limit(20);
    
    console.log('Sample records (first 20):');
    samples?.forEach((r, i) => {
      console.log(`  ${i+1}. Status: ${r.status}, Completion: ${r.completion_date}, Expiry: ${r.expiry_date}`);
    });
    
    // Count records with completion and expiry dates
    const { count: totalRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true });
    
    const { data: completedRecords } = await supabase
      .from('staff_training_matrix')
      .select('id')
      .eq('status', 'completed')
      .limit(100000);
    
    const { data: completedWithExpiry } = await supabase
      .from('staff_training_matrix')
      .select('id')
      .eq('status', 'completed')
      .not('expiry_date', 'is', null)
      .limit(100000);
    
    console.log(`\n=== EXPIRY DATE STATUS ===`);
    console.log(`Total records: ${totalRecords}`);
    console.log(`Completed records: ${completedRecords?.length || 0}`);
    console.log(`Completed with expiry_date: ${completedWithExpiry?.length || 0}`);
    
    if (completedRecords?.length && completedWithExpiry?.length) {
      const pct = Math.round((completedWithExpiry.length / completedRecords.length) * 100);
      console.log(`Coverage: ${pct}%`);
    }
    
    // Check by location
    console.log(`\n=== BY LOCATION ===`);
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name');
    
    for (const loc of locations || []) {
      const { data: staffAtLoc } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .eq('location_id', loc.id)
        .limit(1000);
      
      if (!staffAtLoc?.length) continue;
      
      const staffIds = staffAtLoc.map(s => s.staff_id);
      
      const { data: trainingAtLoc } = await supabase
        .from('staff_training_matrix')
        .select('id, status, expiry_date')
        .in('staff_id', staffIds)
        .limit(100000);
      
      const completedAtLoc = trainingAtLoc?.filter(t => t.status === 'completed').length || 0;
      const withExpiryAtLoc = trainingAtLoc?.filter(t => t.status === 'completed' && t.expiry_date).length || 0;
      
      if (completedAtLoc > 0) {
        const pct = Math.round((withExpiryAtLoc / completedAtLoc) * 100);
        console.log(`${loc.name}: ${withExpiryAtLoc}/${completedAtLoc} completed have expiry (${pct}%)`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkExpiryDates();
