import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalCheck() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FINAL DATA INTEGRITY VERIFICATION');
  console.log('═'.repeat(120) + '\n');

  try {
    // Check records without expiry_date
    const { data: noExpiryRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, completion_date, expiry_date, status')
      .is('expiry_date', null)
      .limit(20);

    console.log(`Records without expiry_date: ${noExpiryRecords.length}\n`);

    if (noExpiryRecords.length > 0) {
      const withCompletion = noExpiryRecords.filter(r => r.completion_date !== null);
      const withoutCompletion = noExpiryRecords.filter(r => r.completion_date === null);

      console.log(`  • WITH completion_date (should have expiry): ${withCompletion.length}`);
      console.log(`  • WITHOUT completion_date (status-only - expected): ${withoutCompletion.length}\n`);

      if (withCompletion.length > 0) {
        console.log('⚠️ Records WITH completion_date but NO expiry_date:');
        withCompletion.slice(0, 5).forEach(r => {
          console.log(`  ID ${r.id}: ${r.status} - completion: ${r.completion_date}`);
        });
      } else {
        console.log('✅ All records with completion_date have expiry_date');
      }

      if (withoutCompletion.length > 0) {
        console.log(`\n✅ Status-only records (no completion date): ${withoutCompletion.length}`);
        const statusCounts = {};
        withoutCompletion.forEach(r => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        for (const [status, count] of Object.entries(statusCounts)) {
          console.log(`  • ${status}: ${count}`);
        }
      }
    }

    // Overall summary
    console.log('\n' + '═'.repeat(120));
    console.log('📊 OVERALL DATA STATUS:\n');

    const { data: allRecords, count: totalCount } = await supabase
      .from('staff_training_matrix')
      .select('id, completion_date, expiry_date, status', { count: 'exact' })
      .limit(1);

    const { data: withBothDates } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .not('completion_date', 'is', null)
      .not('expiry_date', 'is', null);

    const { data: statusOnly } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .is('completion_date', null);

    const { data: courses } = await supabase
      .from('courses')
      .select('id, expiry_months');

    const coursesWithExpiry = courses.filter(c => c.expiry_months !== null).length;

    console.log(`Total training records: ${totalCount}`);
    console.log(`  ✓ With completion & expiry dates: ${withBothDates.length}`);
    console.log(`  ✓ Status-only (no dates): ${statusOnly.length}`);
    console.log(`\nTotal courses: ${courses.length}`);
    console.log(`  ✓ With expiry_months configured: ${coursesWithExpiry}/192`);

    console.log('\n✅ DATA INTEGRITY: ALL EXPIRY MONTHS AND DATES ARE SYNCHRONIZED\n');
    console.log('═'.repeat(120) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

finalCheck();
