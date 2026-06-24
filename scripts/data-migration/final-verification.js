import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalVerification() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FINAL VERIFICATION - ALL RECORDS');
  console.log('═'.repeat(120) + '\n');

  // Get total count
  const { count: totalRecords } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });

  console.log(`Total records in database: ${totalRecords}\n`);

  // Check each status
  const statuses = ['completed', 'booked', 'awaiting', 'na'];
  let totalWithDates = 0;
  let totalWithoutDates = 0;

  console.log('STATUS BREAKDOWN:\n');

  for (const status of statuses) {
    const { count: statusCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    const { count: withDatesCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .not('completion_date', 'is', null)
      .not('expiry_date', 'is', null);

    const withoutDates = (statusCount || 0) - (withDatesCount || 0);
    totalWithDates += (withDatesCount || 0);
    totalWithoutDates += withoutDates;

    const percentage = statusCount > 0 ? ((withDatesCount || 0) / statusCount * 100).toFixed(1) : 0;

    console.log(`${status.toUpperCase()}:`);
    console.log(`  Total: ${statusCount}`);
    console.log(`  With both dates: ${withDatesCount || 0} (${percentage}%)`);
    console.log(`  Without dates: ${withoutDates}\n`);
  }

  console.log('═'.repeat(120));
  console.log('FINAL SUMMARY:\n');
  console.log(`Total records: ${totalRecords}`);
  console.log(`Records with both dates: ${totalWithDates} (${(totalWithDates / totalRecords * 100).toFixed(1)}%)`);
  console.log(`Records without dates: ${totalWithoutDates}`);

  if (totalWithoutDates === 0) {
    console.log('\n✅ ALL RECORDS NOW HAVE COMPLETION AND EXPIRY DATES\n');
  } else {
    console.log(`\n⚠️ ${totalWithoutDates} records still missing dates\n`);
  }

  console.log('═'.repeat(120) + '\n');
}

finalVerification();
