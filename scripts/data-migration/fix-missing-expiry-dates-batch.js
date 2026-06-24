const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMissingExpiryDates() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIX MISSING EXPIRY DATES');
  console.log('═'.repeat(120) + '\n');

  // Get all completed records without expiry_date
  const { data: records, error: selectError } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status')
    .eq('status', 'completed')
    .is('expiry_date', null);

  if (selectError) {
    console.error('Error fetching records:', selectError);
    process.exit(1);
  }

  console.log(`Found ${records.length} completed records without expiry dates\n`);

  // Get all courses with their expiry_months
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, expiry_months');

  const courseMap = {};
  courses.forEach(c => {
    courseMap[c.id] = { name: c.name, expiry_months: c.expiry_months };
  });

  // Calculate and fix missing expiry dates
  let fixed = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const course = courseMap[record.course_id];
      if (!course) {
        console.log(`  ⚠️  Course not found for record ${record.id}`);
        errors++;
        continue;
      }

      if (!record.completion_date) {
        console.log(`  ⚠️  No completion_date for record ${record.id}`);
        errors++;
        continue;
      }

      const completionDate = new Date(record.completion_date);
      const expiryMonths = course.expiry_months || 12;
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);

      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const { error: updateError } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: expiryDateStr })
        .eq('id', record.id);

      if (updateError) {
        console.log(`  ❌ Error updating record ${record.id}: ${updateError.message}`);
        errors++;
      } else {
        console.log(`  ✅ Fixed record ${record.id}: ${record.completion_date} + ${expiryMonths} months = ${expiryDateStr}`);
        fixed++;
      }
    } catch (err) {
      console.log(`  ❌ Exception for record ${record.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${'═'.repeat(120)}`);
  console.log(`Results: ${fixed} fixed, ${errors} errors\n`);

  if (fixed > 0) {
    console.log('✅ All missing expiry dates have been calculated and saved!\n');
  }
}

fixMissingExpiryDates().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
