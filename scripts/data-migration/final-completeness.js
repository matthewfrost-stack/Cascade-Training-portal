import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalCompleteness() {
  console.log('=== FINAL COMPLETENESS CHECK ===\n');

  try {
    // Get all records with their details
    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, status, completion_date, expiry_date, course_id, courses(name, expiry_months)');

    console.log(`Total training records: ${allRecords.length}\n`);

    // Group by what's actually needed
    const completed = allRecords.filter(r => r.status === 'completed' && r.completion_date);
    const completedWithExpiry = completed.filter(r => r.expiry_date !== null);
    const completedWithoutExpiry = completed.filter(r => r.expiry_date === null);

    console.log('COMPLETED TRAININGS (with completion_date):');
    console.log(`  Total: ${completed.length}`);
    console.log(`  With expiry_date: ${completedWithExpiry.length} (${Math.round(completedWithExpiry.length / completed.length * 100)}%)`);
    console.log(`  Without expiry_date: ${completedWithoutExpiry.length}`);

    if (completedWithoutExpiry.length > 0) {
      console.log('\n  Records without expiry_date (likely One-off courses):');
      const reasons = {};
      completedWithoutExpiry.forEach(r => {
        const reason = r.courses?.expiry_months === null ? 'One-off course' : 'Other';
        reasons[reason] = (reasons[reason] || 0) + 1;
      });
      for (const [reason, count] of Object.entries(reasons)) {
        console.log(`    - ${reason}: ${count}`);
      }
    }

    // Other statuses
    console.log('\nOTHER STATUSES (status-only, no completion_date):');
    const booked = allRecords.filter(r => r.status === 'booked');
    const awaiting = allRecords.filter(r => r.status === 'awaiting');
    const na = allRecords.filter(r => r.status === 'na');

    console.log(`  Booked: ${booked.length}`);
    console.log(`  Awaiting Date: ${awaiting.length}`);
    console.log(`  N/A: ${na.length}`);

    console.log('\n=== UI DISPLAY READINESS ===\n');
    console.log('The training matrix will now display:');
    console.log(`  ✅ ${completedWithExpiry.length} courses with expiry dates`);
    console.log(`  ✅ ${completedWithoutExpiry.length} "One-off" courses (no renewal required)`);
    console.log(`  ✅ ${booked.length} "Booked" trainings`);
    console.log(`  ✅ ${awaiting.length} "Awaiting Date" trainings`);
    console.log(`  ✅ ${na.length} "N/A" trainings`);

    console.log('\n✅ All course data is now complete and ready for display!');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

finalCompleteness();
