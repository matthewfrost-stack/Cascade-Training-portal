import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 CHECKING DATA\n');
  
  // Get a record with both dates
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
    .limit(10);
  
  console.log(`Sample records with completion_date:\n`);
  records?.forEach(r => {
    const courseName = r.courses[0]?.name || 'N/A';
    const expiryMonths = r.courses[0]?.expiry_months || 'NULL';
    console.log(`  Course: ${courseName}`);
    console.log(`  Completion: ${r.completion_date}`);
    console.log(`  Expiry: ${r.expiry_date}`);
    console.log(`  Months: ${expiryMonths}\n`);
  });
  
  // Check NULL expiry_date
  console.log('\n\n🔍 Records with NULL expiry_date but valid completion_date:\n');
  
  const { data: nullExpiry, count: nullCount } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      staff_id,
      course_id,
      completion_date,
      expiry_date,
      courses!inner(id, name, expiry_months)
    `, { count: 'exact' })
    .not('completion_date', 'is', null)
    .is('expiry_date', null)
    .limit(10);
  
  console.log(`Found: ${nullCount} records\n`);
  
  if (nullExpiry && nullExpiry.length > 0) {
    console.log('Examples:');
    nullExpiry.slice(0, 5).forEach(r => {
      const courseName = r.courses[0]?.name || 'N/A';
      const expiryMonths = r.courses[0]?.expiry_months || 'NULL';
      console.log(`  - ${courseName}`);
      console.log(`    Completion: ${r.completion_date}, Months: ${expiryMonths}`);
    });
  }
  
  // Summary
  const { count: totalWithCompletion } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null);
  
  const { count: totalWithExpiry } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('expiry_date', 'is', null);
  
  const { count: bothDates } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .not('expiry_date', 'is', null);
  
  const { count: missingExpiry } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .not('completion_date', 'is', null)
    .is('expiry_date', null);
  
  console.log(`\n\n📊 SUMMARY:`);
  console.log(`  Records with completion_date: ${totalWithCompletion}`);
  console.log(`  Records with expiry_date: ${totalWithExpiry}`);
  console.log(`  Records with BOTH dates: ${bothDates}`);
  console.log(`  Records with completion but NO expiry: ${missingExpiry}`);
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
