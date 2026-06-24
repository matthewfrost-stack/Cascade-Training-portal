import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  WHAT USERS ACTUALLY SEE - TEAM TEACH EXPIRY DATES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get Team Teach records with all their data
  const { data: staffRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      staff_id,
      course_id,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .ilike('courses.name', '%positive behaviour%level 2%')
    .limit(50);

  console.log(`Found ${staffRecords.length} Team Teach Positive Behaviour Level 2 records\n`);

  // Group by course_id to see if both course IDs are represented
  const byCourseId = {};
  staffRecords.forEach(record => {
    const cid = record.course_id;
    if (!byCourseId[cid]) {
      byCourseId[cid] = {
        course_id: cid,
        course_name: record.courses?.name,
        course_expiry_months: record.courses?.expiry_months,
        records: []
      };
    }
    byCourseId[cid].records.push({
      id: record.id,
      staff_id: record.staff_id,
      completion_date: record.completion_date,
      expiry_date: record.expiry_date
    });
  });

  console.log('BREAKDOWN BY COURSE_ID:\n');
  Object.entries(byCourseId).forEach(([cid, data]) => {
    console.log(`Course ID: ${cid}`);
    console.log(`Course Name: ${data.course_name}`);
    console.log(`Course Expiry Months: ${data.course_expiry_months}`);
    console.log(`Number of staff: ${data.records.length}`);
    
    // Show sample
    console.log(`Sample records:`);
    data.records.slice(0, 3).forEach((rec, idx) => {
      console.log(`  ${idx + 1}. Completion: ${rec.completion_date}, Expiry: ${rec.expiry_date}`);
      
      // Verify the calculation
      if (rec.completion_date && data.course_expiry_months) {
        const date = new Date(rec.completion_date);
        const result = new Date(date);
        result.setMonth(result.getMonth() + data.course_expiry_months);
        const year = result.getFullYear();
        const month = String(result.getMonth() + 1).padStart(2, '0');
        const day = String(result.getDate()).padStart(2, '0');
        const expected = `${year}-${month}-${day}`;
        const match = expected === rec.expiry_date ? '✅' : '❌';
        console.log(`     Expected: ${expected} (${data.course_expiry_months} months from ${rec.completion_date}) ${match}`);
      }
    });
    console.log('');
  });
}

main().catch(console.error);
