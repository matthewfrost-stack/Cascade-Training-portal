import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectTableStructure() {
  console.log('\n🔍 INSPECTING staff_training_matrix TABLE\n');

  // Get one record to see structure
  const { data: sample } = await supabase
    .from('staff_training_matrix')
    .select('*')
    .limit(1);

  if (sample && sample.length > 0) {
    const rec = sample[0];
    console.log('Sample record fields:');
    Object.keys(rec).forEach(key => {
      console.log(`  - ${key}: ${rec[key]}`);
    });
  }

  // Count records for first location
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .limit(1);

  const loc = locations[0];
  
  // Get records - check different column combinations
  const { data: recs1 } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completed_at_location_id')
    .eq('completed_at_location_id', loc.id)
    .limit(1);

  console.log(`\n${loc.name} - Sample record with IDs:`);
  if (recs1 && recs1.length > 0) {
    console.log(`  staff_id: ${recs1[0].staff_id}`);
    console.log(`  course_id: ${recs1[0].course_id}`);
    console.log(`  completed_at_location_id: ${recs1[0].completed_at_location_id}`);
  }

  // Check if there are unique constraints
  console.log(`\nChecking record combinations:`);
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('staff_id, course_id, completed_at_location_id')
    .eq('completed_at_location_id', loc.id);

  // Check for duplicates
  const seen = new Set();
  let duplicates = 0;
  
  allRecords?.forEach(rec => {
    const key = `${rec.staff_id}|${rec.course_id}`;
    if (seen.has(key)) {
      duplicates++;
    }
    seen.add(key);
  });

  console.log(`  Total records: ${allRecords?.length || 0}`);
  console.log(`  Unique staff-course combinations: ${seen.size}`);
  console.log(`  Duplicates: ${duplicates}`);
}

inspectTableStructure();
