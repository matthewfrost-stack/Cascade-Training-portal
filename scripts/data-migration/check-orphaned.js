import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 CHECKING CORRUPTED RECORDS\n');
  
  // Check NULL staff_id
  const { data: nullStaff, count: nullStaffCount } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date', { count: 'exact' })
    .is('staff_id', null)
    .limit(10);
  
  console.log(`Records with NULL staff_id: ${nullStaffCount}`);
  if (nullStaff && nullStaff.length > 0) {
    console.log('\nExamples:');
    nullStaff.forEach(r => {
      console.log(`  - id: ${r.id}, course_id: ${r.course_id}, completion: ${r.completion_date}`);
    });
  }
  
  // Get the date overflow record
  console.log('\n\nLooking for date overflow issue:');
  const { data: withComp } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date')
    .not('completion_date', 'is', null)
    .is('expiry_date', null)
    .range(1400, 1410);
  
  if (withComp && withComp.length > 0) {
    console.log('\nSuspicious records (batch 1400):');
    withComp.forEach(r => {
      console.log(`  - id: ${r.id}`);
      console.log(`    staff_id: ${r.staff_id}`);
      console.log(`    course_id: ${r.course_id}`);
      console.log(`    completion: ${r.completion_date}`);
      
      // Try to parse the date
      const date = new Date(r.completion_date);
      console.log(`    date valid: ${!isNaN(date.getTime())}`);
      console.log(`    parsed year: ${date.getFullYear()}`);
    });
  }
  
  // Count records by status
  console.log('\n\n📊 Breakdown by data quality:');
  const { count: validRecords } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('staff_id', 'is', null)
    .not('completion_date', 'is', null);
  
  const { count: orphaned } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('staff_id', null);
  
  console.log(`  Valid (staff_id + completion): ${validRecords}`);
  console.log(`  Orphaned (NULL staff_id): ${orphaned}`);
  console.log(`  Total: ${28128}`);
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
