import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getExactCounts() {
  console.log('\n' + '═'.repeat(120));
  console.log('  GETTING EXACT RECORD COUNTS');
  console.log('═'.repeat(120) + '\n');

  // Get total count
  const { count: totalCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });

  console.log(`Total records: ${totalCount}\n`);

  // Get counts by status
  const statuses = ['completed', 'booked', 'awaiting', 'na'];

  for (const status of statuses) {
    const { count: statusCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    console.log(`${status}: ${statusCount}`);
  }

  console.log('\n');

  // Get records with wrong expiry
  const { data: allWithCompletion } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, courses(expiry_months)')
    .not('completion_date', 'is', null);

  console.log(`Records with completion_date: ${allWithCompletion.length}`);

  let wrongCount = 0;
  const wrongRecords = [];

  for (const record of allWithCompletion) {
    if (record.expiry_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const calcExpiryDate = new Date(completionDate);
      calcExpiryDate.setMonth(calcExpiryDate.getMonth() + record.courses.expiry_months);
      const calcExpiryStr = calcExpiryDate.toISOString().split('T')[0];

      if (calcExpiryStr !== record.expiry_date) {
        wrongCount++;
        if (wrongRecords.length < 5) {
          wrongRecords.push({
            id: record.id,
            completion: record.completion_date,
            expected: calcExpiryStr,
            actual: record.expiry_date,
            months: record.courses.expiry_months
          });
        }
      }
    }
  }

  console.log(`Records with wrong expiry dates: ${wrongCount}\n`);

  if (wrongRecords.length > 0) {
    console.log('Examples of wrong calculations:\n');
    wrongRecords.forEach((rec, idx) => {
      console.log(`${idx + 1}. ID: ${rec.id}`);
      console.log(`   Completion: ${rec.completion} + ${rec.months}mo`);
      console.log(`   Expected: ${rec.expected}`);
      console.log(`   Actual: ${rec.actual}\n`);
    });
  }

  console.log('═'.repeat(120) + '\n');
}

getExactCounts();
