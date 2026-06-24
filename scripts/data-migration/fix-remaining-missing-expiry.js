const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Date calculation function
function addMonthsToDate(dateStr, months) {
  if (!dateStr) return null;
  
  const [year, month, day] = dateStr.split('-').map(Number);
  
  let newYear = year;
  let newMonth = month + months;
  let newDay = day;
  
  while (newMonth > 12) {
    newMonth -= 12;
    newYear++;
  }
  
  const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
  if (newDay > lastDayOfMonth) {
    newDay = lastDayOfMonth;
  }
  
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

async function fixRemainingMissingExpiryDates() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIX REMAINING MISSING EXPIRY DATES');
  console.log('═'.repeat(120) + '\n');

  // Get all records without expiry dates
  const { data: records } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status')
    .is('expiry_date', null)
    .eq('status', 'completed');

  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
  const { data: profiles } = await supabase.from('profiles').select('id, full_name');

  const courseMap = {};
  courses.forEach(c => {
    courseMap[c.id] = { name: c.name, expiry_months: c.expiry_months };
  });

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.id] = p.full_name;
  });

  console.log(`Found ${records.length} records without expiry dates\n`);

  let fixed = 0;
  let cannotFix = 0;

  for (const record of records) {
    const course = courseMap[record.course_id];
    
    if (!record.completion_date) {
      console.log(`⚠️  Record ${record.id} (${profileMap[record.staff_id]}): No completion_date - cannot calculate expiry`);
      cannotFix++;
      continue;
    }

    if (!course) {
      console.log(`⚠️  Record ${record.id} (${profileMap[record.staff_id]}): Course not found - cannot calculate expiry`);
      cannotFix++;
      continue;
    }

    const expiryDate = addMonthsToDate(record.completion_date, course.expiry_months || 12);
    
    const { error } = await supabase
      .from('staff_training_matrix')
      .update({ expiry_date: expiryDate })
      .eq('id', record.id);

    if (error) {
      console.log(`❌ Error updating record ${record.id}: ${error.message}`);
      cannotFix++;
    } else {
      console.log(`✅ Fixed record ${record.id} (${profileMap[record.staff_id]}): ${record.completion_date} + ${course.expiry_months || 12}mo = ${expiryDate}`);
      fixed++;
    }
  }

  console.log(`\n${'═'.repeat(120)}`);
  console.log(`Results: ${fixed} fixed, ${cannotFix} cannot fix\n`);

  if (fixed > 0) {
    console.log('✅ Successfully fixed the remaining missing expiry dates!\n');
  }
}

fixRemainingMissingExpiryDates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
