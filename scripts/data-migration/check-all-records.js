require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  try {
    console.log('='.repeat(80));
    console.log('CHECKING ALL TRAINING RECORDS ACROSS ALL LOCATIONS');
    console.log('='.repeat(80) + '\n');

    // Total records
    const { data: allRecs } = await supabase.from('staff_training_matrix').select('id');
    console.log(`\n📊 TOTAL training records in database: ${allRecs.length}\n`);

    // By location
    console.log('Breakdown by location:');
    const { data: locs } = await supabase.from('locations').select('id, name').order('name');
    
    let totalByLoc = 0;
    for (const loc of locs) {
      const { data: recs } = await supabase.from('staff_training_matrix').select('id').eq('completed_at_location_id', loc.id);
      const count = recs?.length || 0;
      totalByLoc += count;
      console.log(`  ${loc.name}: ${count} records`);
    }

    console.log(`\nTotal accounted for: ${totalByLoc}`);
    console.log(`Grand total: ${allRecs.length}`);

    // Check fields
    const { data: withComp } = await supabase.from('staff_training_matrix').select('id').not('completion_date', 'is', null);
    const { data: withExp } = await supabase.from('staff_training_matrix').select('id').not('expiry_date', 'is', null);
    
    console.log(`\nRecords with completion_date: ${withComp?.length || 0}`);
    console.log(`Records with expiry_date: ${withExp?.length || 0}`);
    
    console.log('\n' + '='.repeat(80));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
