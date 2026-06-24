require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('Investigating training records and location assignments...\n');

  try {
    // Get sample records with their locations
    const { data: sample } = await supabase
      .from('staff_training_matrix')
      .select('id, staff_id, course_id, completed_at_location_id')
      .limit(10);

    console.log('Sample 10 records:');
    sample.forEach(r => {
      console.log(`  Record ID ${r.id}: location_id=${r.completed_at_location_id}`);
    });

    // Check for NULL location_ids
    const { data: nullLoc } = await supabase
      .from('staff_training_matrix')
      .select('id')
      .is('completed_at_location_id', null);

    console.log(`\nRecords with NULL location_id: ${nullLoc?.length || 0}`);

    // Get actual location assignment counts
    const { data: locs } = await supabase.from('locations').select('id, name');
    
    console.log('\nActual location assignments:');
    for (const loc of locs) {
      const { data: recs } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact' })
        .eq('completed_at_location_id', loc.id);
      
      const count = recs?.length || 0;
      if (count > 0) {
        console.log(`  ${loc.name} (ID: ${loc.id}): ${count} records`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

investigate();
