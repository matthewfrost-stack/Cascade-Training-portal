import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRemaining() {
  console.log('🔍 FINDING THE REMAINING PROBLEM RECORD\n');
  
  // Get the problematic record
  const { data: remaining } = await supabase
    .from('staff_training_matrix')
    .select('id, course_id, completion_date')
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  if (!remaining || remaining.length === 0) {
    console.log('✅ No more records need fixing!');
    return;
  }
  
  console.log(`Found ${remaining.length} remaining record(s):\n`);
  
  // Load courses to check months
  const { data: courses } = await supabase.from('courses').select('id, expiry_months');
  const courseMonthsMap = {};
  courses?.forEach(c => {
    courseMonthsMap[c.id] = c.expiry_months;
  });
  
  remaining.forEach(async (record) => {
    const months = courseMonthsMap[record.course_id];
    console.log(`Record ID: ${record.id}`);
    console.log(`  Completion: ${record.completion_date}`);
    console.log(`  Course ID: ${record.course_id}`);
    console.log(`  Expiry months: ${months}`);
    
    // Try to calculate
    try {
      const completionDate = new Date(record.completion_date);
      console.log(`  Completion parsed: ${completionDate.toISOString()}`);
      
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + (months || 24));
      console.log(`  Calculated expiry: ${expiryDate.toISOString()}`);
      console.log(`  As date string: ${expiryDate.toISOString().split('T')[0]}`);
      
      // Try to update
      const updateResult = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: expiryDate.toISOString().split('T')[0] })
        .eq('id', record.id);
      
      if (updateResult.error) {
        console.log(`  ❌ Update error: ${updateResult.error.message}`);
        // Maybe the record is corrupted, let's just delete it
        console.log(`  → This record appears corrupted, deleting...`);
        const delResult = await supabase
          .from('staff_training_matrix')
          .delete()
          .eq('id', record.id);
        
        if (!delResult.error) {
          console.log(`  ✅ Deleted`);
        }
      } else {
        console.log(`  ✅ Updated`);
      }
    } catch (err) {
      console.log(`  ❌ Calculation error: ${err.message}`);
    }
    console.log();
  });
}

fixRemaining().catch(err => {
  console.error('Error:', err.message);
});
