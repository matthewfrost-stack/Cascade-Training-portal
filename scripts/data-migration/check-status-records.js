import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStatusOnlyRecords() {
  console.log('\n' + '═'.repeat(120));
  console.log('  CHECKING STATUS-ONLY RECORDS (BOOKED, AWAITING, N/A)');
  console.log('═'.repeat(120) + '\n');

  const statuses = ['booked', 'awaiting', 'na'];

  for (const status of statuses) {
    console.log(`${status.toUpperCase()}:`);
    console.log('─'.repeat(120));

    // Get count of this status
    const { count: totalCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    // Get count with dates
    const { count: withDatesCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .not('completion_date', 'is', null)
      .not('expiry_date', 'is', null);

    const withoutDates = totalCount - (withDatesCount || 0);

    console.log(`  Total records: ${totalCount}`);
    console.log(`  With dates: ${withDatesCount || 0} (${((withDatesCount || 0) / totalCount * 100).toFixed(1)}%)`);
    console.log(`  Without dates: ${withoutDates}`);

    if (withoutDates > 0) {
      // Get some examples of records without dates
      const { data: examples } = await supabase
        .from('staff_training_matrix')
        .select(`
          id,
          status,
          completion_date,
          expiry_date,
          courses(name)
        `)
        .eq('status', status)
        .is('completion_date', null)
        .limit(5);

      if (examples.length > 0) {
        console.log(`\n  Examples without dates:`);
        examples.forEach(rec => {
          console.log(`    • ${rec.courses?.name || 'Unknown course'}`);
        });
      }
    }

    console.log('');
  }

  console.log('═'.repeat(120));
  
  // Summary
  const { count: bookedWithDates } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'booked')
    .not('completion_date', 'is', null);

  const { count: awaitingWithDates } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'awaiting')
    .not('completion_date', 'is', null);

  const { count: naWithDates } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'na')
    .not('completion_date', 'is', null);

  const totalStatusOnly = (bookedWithDates || 0) + (awaitingWithDates || 0) + (naWithDates || 0);

  console.log('SUMMARY:\n');
  console.log(`Total status-only records with dates: ${totalStatusOnly}`);

  if (withoutDates === 0) {
    console.log('\n✅ ALL BOOKED, AWAITING, AND N/A RECORDS HAVE DATES\n');
  } else {
    console.log(`\n⚠️ Some records still missing dates\n`);
  }

  console.log('═'.repeat(120) + '\n');
}

checkStatusOnlyRecords();
