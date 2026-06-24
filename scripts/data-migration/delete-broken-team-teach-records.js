import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  DELETE BROKEN TEAM TEACH RECORDS (NULL COURSE REFERENCES)');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all invalid course_ids for Team Teach (those that don't exist in courses table)
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      course_id,
      courses(id)
    `)
    .ilike('courses.name', '%positive behaviour%level 2%');

  // Find the invalid ones
  const invalidIds = allRecords
    .filter(r => !r.courses)
    .map(r => r.id);

  console.log(`Found ${invalidIds.length} records with broken course references`);
  console.log('');

  if (invalidIds.length === 0) {
    console.log('✅ No broken records to delete');
    return;
  }

  console.log(`Will delete: ${invalidIds.length} broken Team Teach records`);
  console.log('');
  console.log('Starting deletion...');

  // Delete in batches of 50
  let deleted = 0;
  for (let i = 0; i < invalidIds.length; i += 50) {
    const batch = invalidIds.slice(i, i + 50);
    const { error } = await supabase
      .from('staff_training_matrix')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`❌ Error deleting batch ${i / 50 + 1}: ${error.message}`);
    } else {
      deleted += batch.length;
      console.log(`  Deleted ${deleted}/${invalidIds.length}...`);
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`✅ DELETED: ${deleted} broken records`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
