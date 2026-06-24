import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FIX: DELETE DUPLICATE BROKEN TEAM TEACH RECORDS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all Team Teach records with broken course_ids
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      course_id,
      staff_id,
      courses(id)
    `)
    .ilike('courses.name', '%positive behaviour%level 2%');

  // Find the invalid ones
  const invalidRecords = allRecords.filter(r => !r.courses);

  console.log(`Found ${invalidRecords.length} Team Teach records with broken course_ids`);
  console.log('These are duplicates - deleting them...');
  console.log('');

  if (invalidRecords.length === 0) {
    console.log('✅ No broken records to delete');
    return;
  }

  const invalidIds = invalidRecords.map(r => r.id);

  console.log('Starting deletion...');
  
  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < invalidIds.length; i += 100) {
    const batch = invalidIds.slice(i, i + 100);
    const { error } = await supabase
      .from('staff_training_matrix')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`❌ Error deleting batch ${i / 100 + 1}: ${error.message}`);
    } else {
      deleted += batch.length;
      console.log(`  Deleted ${deleted}/${invalidIds.length}...`);
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`✅ DELETED: ${deleted} duplicate broken records`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
