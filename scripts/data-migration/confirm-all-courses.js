import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// For making API calls, we need to use the service role key or similar
// Instead, let's directly update the courses in the database
// which should trigger the same recalculation

async function confirmAllCourses() {
  console.log('Confirming/saving all courses to trigger expiry date calculations...\n');

  try {
    // Get all courses
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id, name, expiry_months, never_expires');

    if (fetchError) throw fetchError;

    console.log(`Found ${courses.length} courses to confirm\n`);

    let confirmedCount = 0;
    let skippedCount = 0;

    // Update each course - even if no changes, this will trigger any triggers/calculations
    for (const course of courses) {
      // Update the course with its current values (forces a save/trigger)
      const { error: updateError } = await supabase
        .from('courses')
        .update({
          expiry_months: course.expiry_months,
          never_expires: course.never_expires || false,
          // Adding updated_at might help trigger calculations if there's a trigger
          updated_at: new Date().toISOString(),
        })
        .eq('id', course.id);

      if (updateError) {
        console.error(`❌ ${course.name}: ${updateError.message}`);
        skippedCount++;
      } else {
        console.log(`✅ Confirmed: ${course.name}`);
        confirmedCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`\n=== RESULTS ===`);
    console.log(`Confirmed: ${confirmedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`\nNow checking if expiry dates have been calculated...`);

    // Check the results
    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, expiry_date, courses(name, expiry_months)', { count: 'exact' });

    const withExpiry = allRecords.filter(r => r.expiry_date !== null).length;
    const total = allRecords.length;

    console.log(`\nTraining records with expiry_date: ${withExpiry}/${total} (${Math.round(withExpiry / total * 100)}%)`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

confirmAllCourses();
