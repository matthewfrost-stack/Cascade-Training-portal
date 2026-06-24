import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addMissingRecords() {
  console.log('\n' + '═'.repeat(120));
  console.log('  ADDING MISSING STAFF-COURSE RECORDS');
  console.log('═'.repeat(120) + '\n');

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  let totalInserted = 0;

  for (const loc of locations || []) {
    console.log(`Processing: ${loc.name}`);

    // Get all staff for this location
    const { data: staffLocations } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', loc.id);

    const staffIds = new Set(staffLocations?.map(sl => sl.staff_id) || []);

    // Get all unique courses that currently have records for this location
    const { data: existingRecords } = await supabase
      .from('staff_training_matrix')
      .select('staff_id, course_id, completion_date, expiry_date, status')
      .eq('completed_at_location_id', loc.id);

    const courseIds = new Set();
    const existingCombinations = new Set();

    existingRecords?.forEach(rec => {
      courseIds.add(rec.course_id);
      existingCombinations.add(`${rec.staff_id}|${rec.course_id}`);
    });

    console.log(`  Staff: ${staffIds.size}, Courses with data: ${courseIds.size}`);
    console.log(`  Expected records: ${staffIds.size * courseIds.size}, Existing: ${existingRecords?.length || 0}`);

    // Find missing combinations
    const missingRecords = [];

    for (const staffId of staffIds) {
      for (const courseId of courseIds) {
        const key = `${staffId}|${courseId}`;
        if (!existingCombinations.has(key)) {
          missingRecords.push({
            staff_id: staffId,
            course_id: courseId,
            completed_at_location_id: loc.id,
            completion_date: null,
            expiry_date: null,
            status: 'na'
          });
        }
      }
    }

    console.log(`  Missing records: ${missingRecords.length}`);

    if (missingRecords.length > 0) {
      // Insert in batches
      const batchSize = 100;
      let inserted = 0;

      for (let i = 0; i < missingRecords.length; i += batchSize) {
        const batch = missingRecords.slice(i, i + batchSize);
        const { error, data } = await supabase
          .from('staff_training_matrix')
          .insert(batch);

        if (!error) {
          inserted += batch.length;
        } else {
          console.error(`    Batch error: ${error.message}`);
        }
      }

      console.log(`  ✓ Inserted ${inserted} missing records`);
      totalInserted += inserted;
    }

    console.log('');
  }

  console.log('═'.repeat(120));
  console.log(`✅ DONE: Inserted ${totalInserted} missing records\n`);
  console.log('═'.repeat(120) + '\n');
}

addMissingRecords();
