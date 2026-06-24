import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateMissingExpiryDates() {
  console.log('Calculating missing expiry dates using SQL...\n');

  try {
    // Use raw SQL to calculate and update expiry dates in one operation
    const { data, error } = await supabase.rpc('calculate_expiry_dates');

    if (error) {
      console.error('Error calling function:', error);
      console.log('\nAttempting alternative approach...');
      
      // Alternative: Fetch and update via application logic
      const { data: records, error: fetchError } = await supabase
        .from('staff_training_matrix')
        .select('id, course_id, completion_date')
        .eq('status', 'completed')
        .is('expiry_date', null)
        .not('completion_date', 'is', null)
        .limit(10);

      if (fetchError) throw fetchError;
      
      console.log(`Found ${records.length} records to process\n`);
      
      // Get courses
      const { data: courses } = await supabase
        .from('courses')
        .select('id, expiry_months');
      
      const courseMap = new Map(courses.map(c => [c.id, c.expiry_months]));
      let updated = 0;
      
      for (const record of records) {
        const months = courseMap.get(record.course_id);
        if (months && record.completion_date) {
          const date = new Date(record.completion_date);
          date.setMonth(date.getMonth() + months);
          
          const { error: updateError } = await supabase
            .from('staff_training_matrix')
            .update({ expiry_date: date.toISOString().split('T')[0] })
            .eq('id', record.id);
          
          if (!updateError) {
            updated++;
            console.log(`✅ Record ${record.id}: ${date.toISOString().split('T')[0]}`);
          }
        }
      }
      
      console.log(`\nUpdated: ${updated}`);
    } else {
      console.log('✅ Successfully calculated expiry dates');
      console.log(data);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

calculateMissingExpiryDates();
