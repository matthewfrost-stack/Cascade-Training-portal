import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking records without expiry_date...\n');

  // Get records without expiry_date
  const { data: noExpiry, count } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, courses(name, expiry_months)', { count: 'exact' })
    .is('expiry_date', null)
    .limit(20);
  
  console.log(`Total records without expiry_date: ${count}\n`);
  
  // Categorize them
  const withCompletion = noExpiry.filter(r => r.completion_date !== null);
  const withoutCompletion = noExpiry.filter(r => r.completion_date === null);
  
  console.log(`Records WITH completion_date but NO expiry_date: ${withCompletion.length}`);
  console.log(`Records WITHOUT completion_date: ${withoutCompletion.length}\n`);
  
  if (withCompletion.length > 0) {
    console.log('Sample of records WITH completion_date but NO expiry_date:');
    withCompletion.slice(0, 5).forEach((r, i) => {
      console.log(`${i+1}. ID ${r.id}`);
      console.log(`   Course: ${r.courses.name}`);
      console.log(`   Completion: ${r.completion_date}`);
      console.log(`   Expiry Months: ${r.courses.expiry_months}`);
      console.log('');
    });
  }
  
  if (withoutCompletion.length > 0) {
    console.log('\nSample of records WITHOUT completion_date:');
    withoutCompletion.slice(0, 5).forEach((r, i) => {
      console.log(`${i+1}. ID ${r.id}`);
      console.log(`   Course: ${r.courses.name}`);
      console.log(`   Completion: ${r.completion_date || '(null)'}`);
      console.log('');
    });
  }
}

check();
