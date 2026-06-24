import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  AUDIT TEAM TEACH COURSES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all Team Teach courses
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .ilike('name', '%team teach%');

  if (courseError) {
    console.error('Error:', courseError);
    return;
  }

  console.log(`Found ${courses.length} Team Teach courses:\n`);
  courses.forEach(c => {
    console.log(`${c.name}`);
    console.log(`  Expiry Months: ${c.expiry_months}`);
    console.log(`  ID: ${c.id}`);
    console.log('');
  });

  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  TEAM TEACH STAFF RECORDS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get staff training matrix records for Team Teach courses
  const { data: staffRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      completion_date,
      expiry_date,
      courses(name, expiry_months),
      profiles(full_name)
    `)
    .ilike('courses.name', '%team teach%')
    .limit(20);

  if (staffRecords && staffRecords.length > 0) {
    console.log(`Found ${staffRecords.length} Team Teach staff records:\n`);
    staffRecords.forEach((record, idx) => {
      const months = record.courses?.expiry_months;
      const completion = record.completion_date;
      const expiry = record.expiry_date;
      const staff = record.profiles?.full_name;
      
      console.log(`${idx + 1}. ${staff} - ${record.courses?.name}`);
      console.log(`   Completion: ${completion}`);
      console.log(`   Expiry Months: ${months}`);
      console.log(`   Stored Expiry: ${expiry}`);
      
      // Calculate what it should be
      if (completion && months) {
        const date = new Date(completion);
        const result = new Date(date);
        result.setMonth(result.getMonth() + months);
        const year = result.getFullYear();
        const month = String(result.getMonth() + 1).padStart(2, '0');
        const day = String(result.getDate()).padStart(2, '0');
        const expected = `${year}-${month}-${day}`;
        
        const match = expected === expiry ? '✅' : '❌';
        console.log(`   Expected: ${expected} ${match}`);
      }
      console.log('');
    });
  }
}

main().catch(console.error);
