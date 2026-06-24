import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get all Team Teach Positive Behaviour Level 2 records including course details
  const { data: staffRecords, error } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      course_id,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .ilike('courses.name', '%positive behaviour%level 2%');

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log('Team Teach Positive Behaviour Level 2 Analysis:');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Analyze the data
  const byCourseName = {};
  const byCourseId = {};

  staffRecords.forEach(record => {
    const name = record.courses?.name || 'NULL COURSE';
    const cid = record.course_id;
    const expiry = record.courses?.expiry_months;

    if (!byCourseName[name]) {
      byCourseName[name] = [];
    }
    byCourseName[name].push({ cid, expiry, ...record });

    if (!byCourseId[cid]) {
      byCourseId[cid] = {
        course_name: name,
        course_expiry_months: expiry,
        count: 0,
        samples: []
      };
    }
    byCourseId[cid].count++;
    if (byCourseId[cid].samples.length < 2) {
      byCourseId[cid].samples.push({
        completion: record.completion_date,
        expiry: record.expiry_date
      });
    }
  });

  console.log('UNIQUE COURSE NAMES:');
  Object.entries(byCourseName).forEach(([name, records]) => {
    console.log(`\n"${name}"`);
    console.log(`  Count: ${records.length}`);
    const courseIds = [...new Set(records.map(r => r.cid))];
    console.log(`  Course IDs: ${courseIds.join(', ')}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('\nUNIQUE COURSE IDs AND THEIR SETTINGS:\n');
  
  Object.entries(byCourseId).forEach(([cid, data]) => {
    console.log(`Course ID: ${cid}`);
    console.log(`  Name: "${data.course_name}"`);
    console.log(`  Expiry Months: ${data.course_expiry_months}`);
    console.log(`  Staff Count: ${data.count}`);
    console.log(`  Samples:`);
    data.samples.forEach(s => {
      console.log(`    Completion: ${s.completion} → Expiry: ${s.expiry}`);
    });
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nTOTAL RECORDS: ${staffRecords.length}`);
}

main().catch(console.error);
