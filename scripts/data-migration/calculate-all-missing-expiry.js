import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateAllMissingExpiryDates() {
  console.log('Calculating ALL missing expiry dates for training records...\n');

  try {
    // Get all courses first
    const { data: courses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');
    
    const courseMap = new Map(courses.map(c => [c.id, c.expiry_months]));
    console.log(`Loaded ${courses.length} courses\n`);

    let totalUpdated = 0;
    let pageSize = 1000;
    let offset = 0;

    // Process ALL training records (not just completed)
    while (true) {
      const { data: records, error: fetchError } = await supabase
        .from('staff_training_matrix')
        .select('id, course_id, completion_date, expiry_date')
        .not('completion_date', 'is', null)
        .is('expiry_date', null)
        .range(offset, offset + pageSize - 1);

      if (fetchError) throw fetchError;
      
      if (!records || records.length === 0) {
        console.log(`✅ Completed! No more records to process.`);
        break;
      }

      console.log(`Processing records ${offset + 1} to ${offset + records.length}...`);
      
      let pageUpdated = 0;

      for (const record of records) {
        const months = courseMap.get(record.course_id);
        
        // Only calculate if course has expiry_months
        if (months && record.completion_date) {
          const date = new Date(record.completion_date);
          date.setMonth(date.getMonth() + months);
          
          const { error: updateError } = await supabase
            .from('staff_training_matrix')
            .update({ expiry_date: date.toISOString().split('T')[0] })
            .eq('id', record.id);
          
          if (!updateError) {
            pageUpdated++;
          }
        }
      }

      totalUpdated += pageUpdated;
      console.log(`  Updated ${pageUpdated} records (${totalUpdated} total)`);
      
      offset += pageSize;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total expiry dates calculated and saved: ${totalUpdated}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

calculateAllMissingExpiryDates();
