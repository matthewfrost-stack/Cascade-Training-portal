import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMissingExpiry() {
  console.log('🔧 FIXING MISSING EXPIRY DATES (2,240 records)\n');
  
  // Load course lookup table
  console.log('Step 1: Loading course expiry_months...');
  const { data: courses } = await supabase.from('courses').select('id, expiry_months');
  const courseMonthsMap = {};
  courses?.forEach(c => {
    courseMonthsMap[c.id] = c.expiry_months || 24;
  });
  console.log(`✓ Loaded ${Object.keys(courseMonthsMap).length} courses\n`);
  
  // Get all records needing fix
  console.log('Step 2: Loading records with completion_date but NULL expiry_date...');
  let allRecords = [];
  const pageSize = 1000;
  let totalCount = 0;
  
  // First get count
  const { count: totalMissing } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  console.log(`Found ${totalMissing} records\n`);
  
  // Load all records
  for (let i = 0; i < totalMissing; i += pageSize) {
    const { data: batch } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date')
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .range(i, i + pageSize - 1);
    
    if (!batch || batch.length === 0) break;
    allRecords = allRecords.concat(batch);
    console.log(`  ✓ Loaded ${allRecords.length}/${totalMissing} records...`);
  }
  
  console.log(`✓ Loaded all ${allRecords.length} records\n`);
  
  // Calculate expiry dates
  console.log('Step 3: Calculating expiry dates...');
  const updates = [];
  let calculationErrors = 0;
  
  allRecords.forEach((record, index) => {
    try {
      const months = courseMonthsMap[record.course_id] || 24;
      const completionDate = new Date(record.completion_date);
      
      if (isNaN(completionDate.getTime())) {
        console.log(`⚠️  Invalid completion_date at record ${index}: ${record.completion_date}`);
        calculationErrors++;
        return;
      }
      
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + months);
      
      if (isNaN(expiryDate.getTime())) {
        console.log(`⚠️  Invalid calculated expiry_date at record ${index}: completion=${record.completion_date}, months=${months}`);
        calculationErrors++;
        return;
      }
      
      const expiryDateStr = expiryDate.toISOString().split('T')[0];
      
      updates.push({
        id: record.id,
        expiry_date: expiryDateStr
      });
    } catch (err) {
      console.log(`⚠️  Error calculating record ${index}: ${err.message}`);
      calculationErrors++;
    }
  });
  
  console.log(`✓ Calculated ${updates.length} expiry dates (${calculationErrors} errors)\n`);
  
  // Batch update using UPDATE instead of UPSERT
  console.log('Step 4: Updating database...');
  let fixed = 0;
  const batchSize = 100;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    // Update individually
    for (const update of batch) {
      const { error: indError } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: update.expiry_date })
        .eq('id', update.id);
      
      if (!indError) {
        fixed++;
      } else {
        console.log(`⚠️  Error updating record ${update.id}: ${indError.message}`);
      }
    }
    
    console.log(`  ✓ Processed ${Math.min(i + batchSize, updates.length)}/${updates.length} updates (${fixed} fixed)`);
  }
  
  // Verify
  console.log('\nStep 5: Verifying fix...');
  const { count: stillMissing } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  console.log(`\n📊 RESULTS:`);
  console.log(`  Total needed: ${totalMissing}`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Still missing: ${stillMissing}`);
  console.log(`  Success rate: ${stillMissing === 0 ? '✅ 100%' : `${((fixed / totalMissing) * 100).toFixed(2)}%`}`);
}

fixMissingExpiry().catch(err => {
  console.error('Fatal error:', err.message);
  console.error(err);
});
