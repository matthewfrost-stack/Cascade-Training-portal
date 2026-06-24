import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 CHECKING FULL DATA INTEGRITY\n');
  
  // Get a record with completion_date and check expiry calculation
  const { data: records } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      staff_id,
      course_id,
      completion_date,
      expiry_date,
      courses!inner(id, name, expiry_months)
    `)
    .not('completion_date', 'is', null)
    .not('expiry_date', 'is', null)
    .limit(20);
  
  console.log(`Found ${records?.length} records with both completion_date and expiry_date\n`);
  
  let correct = 0;
  let incorrect = 0;
  const examples = [];
  
  records?.forEach(r => {
    const courseName = r.courses[0]?.name;
    const expiryMonths = r.courses[0]?.expiry_months;
    const completionDate = new Date(r.completion_date);
    
    const expectedExpiry = new Date(completionDate);
    expectedExpiry.setMonth(expectedExpiry.getMonth() + expiryMonths);
    
    const storedExpiry = new Date(r.expiry_date);
    
    const diffDays = Math.abs((storedExpiry - expectedExpiry) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) {
      correct++;
    } else {
      incorrect++;
      if (examples.length < 10) {
        examples.push({
          course: courseName,
          completion: r.completion_date,
          months: expiryMonths,
          expected: expectedExpiry.toISOString().split('T')[0],
          actual: r.expiry_date,
          diff: diffDays.toFixed(1)
        });
      }
    }
  });
  
  console.log(`✅ Correct: ${correct}`);
  console.log(`❌ Incorrect: ${incorrect}\n`);
  
  if (examples.length > 0) {
    console.log('Examples of incorrect calculations:');
    examples.forEach(ex => {
      console.log(`  - ${ex.course}`);
      console.log(`    Completion: ${ex.completion}, Months: ${ex.months}`);
      console.log(`    Expected: ${ex.expected}, Actual: ${ex.actual} (diff: ${ex.diff} days)`);
    });
  }
  
  // Now check records with NULL expiry_date but valid completion_date
  console.log('\n\n🔍 CHECKING NULL EXPIRY_DATE RECORDS:\n');
  
  const { data: nullExpiry } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      staff_id,
      course_id,
      completion_date,
      expiry_date,
      courses!inner(id, name, expiry_months)
    `)
    .not('completion_date', 'is', null)
    .is('expiry_date', null)
    .limit(20);
  
  console.log(`Found ${nullExpiry?.length} records with completion_date but NULL expiry_date\n`);
  
  if (nullExpiry && nullExpiry.length > 0) {
    console.log('Examples:');
    nullExpiry.slice(0, 5).forEach(r => {
      const courseName = r.courses[0]?.name;
      const expiryMonths = r.courses[0]?.expiry_months;
      
      const completionDate = new Date(r.completion_date);
      const expectedExpiry = new Date(completionDate);
      expectedExpiry.setMonth(expectedExpiry.getMonth() + expiryMonths);
      
      console.log(`  - ${courseName}`);
      console.log(`    Completion: ${r.completion_date}`);
      console.log(`    Months: ${expiryMonths}`);
      console.log(`    Should be: ${expectedExpiry.toISOString().split('T')[0]}`);
      console.log(`    Currently: NULL`);
    });
  }
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
