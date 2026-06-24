import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateMissingExpiryDates() {
  console.log('Calculating missing expiry dates...\n');

  try {
    // First, get all completed records that are missing expiry_date
    const { data: records, error: fetchError } = await supabase
      .from('staff_training_matrix')
      .select('id, staff_id, course_id, completion_date, expiry_date')
      .eq('status', 'completed')
      .is('expiry_date', null)
      .not('completion_date', 'is', null);

    if (fetchError) throw fetchError;

    console.log(`Found ${records.length} completed records missing expiry_date\n`);

    if (records.length === 0) {
      console.log('✅ All completed records have expiry dates!');
      return;
    }

    // Get all courses with their expiry_months
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    if (courseError) throw courseError;

    const courseMap = new Map(courses.map(c => [c.id, c]));

    // Batch update records with calculated expiry dates
    let updatedCount = 0;
    let skippedCount = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const updates = [];

      for (const record of batch) {
        if (!record.course_id || !record.completion_date) {
          skippedCount++;
          continue;
        }

        const course = courseMap.get(record.course_id);
        if (!course || !course.expiry_months) {
          skippedCount++;
          continue;
        }

        // Calculate expiry_date: completion_date + expiry_months
        const completionDate = new Date(record.completion_date);
        const expiryDate = new Date(completionDate);
        expiryDate.setMonth(expiryDate.getMonth() + course.expiry_months);

        updates.push({
          id: record.id,
          expiry_date: expiryDate.toISOString().split('T')[0]
        });
      }

      if (updates.length > 0) {
        // Update only the expiry_date field for these specific records
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('staff_training_matrix')
            .update({ expiry_date: update.expiry_date })
            .eq('id', update.id);

          if (updateError) {
            console.error(`❌ Error updating record ${update.id}:`, updateError.message);
          } else {
            updatedCount++;
          }
        }
        
        console.log(`✅ Updated ${updatedCount}/${records.length - skippedCount} records...`);
      }
    }

    console.log(`\n=== RESULTS ===`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (no expiry_months): ${skippedCount}`);
    console.log(`Total processed: ${updatedCount + skippedCount}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

calculateMissingExpiryDates();
