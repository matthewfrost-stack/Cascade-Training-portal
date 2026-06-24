import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMissingExpiry() {
  console.log('🔧 FIXING MISSING EXPIRY DATES\n');
  console.log('Step 1: Loading all records with completion_date but NULL expiry_date');
  
  let processed = 0;
  let fixed = 0;
  let errors = [];
  let pageSize = 100;
  
  // Get count first
  const { count: totalMissing } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  console.log(`Found ${totalMissing} records needing expiry_date\n`);
  
  // Load course lookup table
  console.log('Step 2: Loading course expiry_months...');
  const { data: courses } = await supabase.from('courses').select('id, expiry_months');
  const courseMonthsMap = {};
  courses?.forEach(c => {
    courseMonthsMap[c.id] = c.expiry_months || 24; // Default to 24 if somehow null
  });
  console.log(`Loaded ${Object.keys(courseMonthsMap).length} courses\n`);
  
  // Process in batches
  console.log('Step 3: Processing records in batches...');
  for (let i = 0; i < totalMissing; i += pageSize) {
    const { data: batch } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date')
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .range(i, i + pageSize - 1);
    
    if (!batch || batch.length === 0) break;
    
    // Calculate expiry dates
    const updates = batch.map(record => {
      const months = courseMonthsMap[record.course_id] || 24;
      const completionDate = new Date(record.completion_date);
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + months);
      
      return {
        id: record.id,
        expiry_date: expiryDate.toISOString().split('T')[0]
      };
    });
    
    // Batch update
    const { error } = await supabase
      .from('staff_training_matrix')
      .upsert(updates, { onConflict: 'id' });
    
    if (error) {
      console.log(`❌ Error updating batch ${i}-${i + pageSize}: ${error.message}`);
      errors.push(`Batch ${i}: ${error.message}`);
    } else {
      fixed += updates.length;
      processed += batch.length;
      console.log(`  ✓ Processed ${processed}/${totalMissing} records, fixed ${fixed}`);
    }
  }
  
  // Verify fix
  console.log('\nStep 4: Verifying fix...');
  const { count: stillMissing } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  console.log(`\n📊 RESULTS:`);
  console.log(`  Total records needing fix: ${totalMissing}`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Still missing: ${stillMissing}`);
  console.log(`  Success rate: ${((fixed / totalMissing) * 100).toFixed(2)}%`);
  
  if (errors.length > 0) {
    console.log(`\nErrors encountered:`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
}

fixMissingExpiry().catch(err => {
  console.error('Fatal error:', err.message);
});
