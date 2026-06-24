import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCompletedRecords() {
  console.log('\n' + '═'.repeat(120));
  console.log('  VERIFYING ALL RECORDS WITH COMPLETION DATES');
  console.log('═'.repeat(120) + '\n');

  // Get ALL records with completion dates (paginated)
  const pageSize = 1000;
  const allRecords = [];
  let page = 0;
  let hasMore = true;

  console.log(`Fetching all records with completion_date in batches of ${pageSize}...\n`);

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: records, error } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        status,
        completion_date,
        expiry_date,
        courses(id, name, expiry_months)
      `)
      .not('completion_date', 'is', null)
      .range(from, to);

    if (error) {
      console.error(`Error fetching batch ${page}:`, error.message);
      break;
    }

    if (records.length === 0) {
      hasMore = false;
    } else {
      allRecords.push(...records);
      console.log(`✓ Fetched batch ${page + 1} (${records.length} records, total: ${allRecords.length})`);
      page++;
    }
  }

  console.log(`\n✓ Total records with completion_date: ${allRecords.length}\n`);

  // Verify calculations
  let correct = 0;
  let wrong = 0;
  const wrongExamples = [];

  allRecords.forEach(record => {
    if (record.completion_date && record.expiry_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const calcExpiryDate = new Date(completionDate);
      calcExpiryDate.setMonth(calcExpiryDate.getMonth() + record.courses.expiry_months);
      const calcExpiryStr = calcExpiryDate.toISOString().split('T')[0];

      if (calcExpiryStr === record.expiry_date) {
        correct++;
      } else {
        wrong++;
        if (wrongExamples.length < 10) {
          wrongExamples.push({
            id: record.id,
            course: record.courses.name,
            completion: record.completion_date,
            months: record.courses.expiry_months,
            expected: calcExpiryStr,
            actual: record.expiry_date
          });
        }
      }
    }
  });

  console.log('═'.repeat(120));
  console.log('VERIFICATION RESULTS:\n');
  console.log(`✓ Correct expiry calculations: ${correct}`);
  console.log(`⚠️ Wrong expiry calculations: ${wrong}`);

  if (wrongExamples.length > 0) {
    console.log('\nExamples of wrong calculations:\n');
    wrongExamples.forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec.course}`);
      console.log(`   Completion: ${rec.completion} + ${rec.months} months`);
      console.log(`   Expected expiry: ${rec.expected}`);
      console.log(`   Actual expiry: ${rec.actual}`);
      const expectedDate = new Date(rec.expected);
      const actualDate = new Date(rec.actual);
      const diffDays = Math.round((actualDate - expectedDate) / (1000 * 60 * 60 * 24));
      console.log(`   Difference: ${diffDays} days (${Math.round(diffDays / 365)} years)\n`);
    });
  }

  console.log('═'.repeat(120));
  if (wrong === 0) {
    console.log('✅ ALL RECORDS WITH COMPLETION DATES ARE CORRECT\n');
  } else {
    console.log(`⚠️ ${wrong} RECORDS HAVE WRONG EXPIRY DATES\n`);
  }

  console.log('═'.repeat(120) + '\n');
}

verifyCompletedRecords();
