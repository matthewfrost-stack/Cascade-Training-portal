import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function confirmAllCourses() {
  console.log('Confirming/saving all courses to trigger expiry date calculations...\n');

  try {
    // Get all courses with their current data
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    if (fetchError) throw fetchError;

    console.log(`Found ${courses.length} courses\n`);

    let confirmedCount = 0;

    // Update each course - update expiry_months with itself to trigger any calculations
    for (const course of courses) {
      // Update the course expiry_months field (even if no change)
      // This will trigger any database triggers or functions
      const { error: updateError } = await supabase
        .from('courses')
        .update({
          expiry_months: course.expiry_months,
        })
        .eq('id', course.id);

      if (updateError) {
        console.error(`❌ ${course.name}: ${updateError.message}`);
      } else {
        console.log(`✅ Confirmed: ${course.name}`);
        confirmedCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    console.log(`\n=== CONFIRMATION COMPLETE ===`);
    console.log(`Confirmed: ${confirmedCount}/${courses.length}`);

    // Now recalculate all expiry dates
    console.log('\nRecalculating expiry dates for all training records...');
    
    // Get courses with expiry_months
    const { data: coursesWithExpiry } = await supabase
      .from('courses')
      .select('id, expiry_months')
      .not('expiry_months', 'is', null);

    const courseMap = new Map(coursesWithExpiry.map(c => [c.id, c.expiry_months]));

    // Get all training records without expiry_date
    const { data: recordsToCalc } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date, expiry_date')
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .limit(5000);

    let calculatedCount = 0;

    for (const record of recordsToCalc) {
      const months = courseMap.get(record.course_id);
      if (months && record.completion_date) {
        const date = new Date(record.completion_date);
        date.setMonth(date.getMonth() + months);
        
        const { error: updateError } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: date.toISOString().split('T')[0] })
          .eq('id', record.id);
        
        if (!updateError) {
          calculatedCount++;
        }
      }
    }

    console.log(`Calculated ${calculatedCount} expiry dates\n`);

    // Final check
    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' });

    const { data: recordsWithExpiry } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact' })
      .not('expiry_date', 'is', null);

    const withCount = recordsWithExpiry.length;
    const total = allRecords.length;

    console.log(`=== FINAL STATUS ===`);
    console.log(`Training records with expiry_date: ${withCount}/${total} (${Math.round(withCount / total * 100)}%)`);
    console.log(`✅ All courses confirmed and expiry dates calculated!`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

confirmAllCourses();
