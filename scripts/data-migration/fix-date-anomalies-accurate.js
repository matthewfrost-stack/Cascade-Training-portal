const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// More reliable date arithmetic function
function addMonthsToDate(dateStr, months) {
  const [year, month, day] = dateStr.split('-').map(Number);
  
  let newYear = year;
  let newMonth = month + months;
  let newDay = day;
  
  // Handle month overflow
  while (newMonth > 12) {
    newMonth -= 12;
    newYear++;
  }
  
  // Handle day overflow - if the target month doesn't have this day, use last day of month
  const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
  if (newDay > lastDayOfMonth) {
    newDay = lastDayOfMonth;
  }
  
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

async function fixDateAnomaliesAccurately() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIX DATE CALCULATION ANOMALIES - ACCURATE METHOD');
  console.log('═'.repeat(120) + '\n');

  // Get Armfield House location ID first
  const { data: locations } = await supabase.from('locations').select('id, name');
  const armfieldId = locations.find(l => l.name === 'Armfield House')?.id;

  if (!armfieldId) {
    console.log('Armfield House location not found');
    process.exit(1);
  }

  // Get all completed records from Armfield House
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
    .eq('status', 'completed')
    .eq('completed_at_location_id', armfieldId);

  // Get courses with expiry months
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

  // Find and fix anomalies
  let anomalyRecords = [];

  for (const record of allRecords) {
    if (!record.expiry_date || !record.completion_date) continue;

    const course = courseMap[record.course_id];
    if (!course) continue;

    // Calculate expected expiry using our accurate function
    const expectedExpiry = addMonthsToDate(record.completion_date, course.expiry_months || 12);
    const actualExpiry = record.expiry_date;

    if (expectedExpiry !== actualExpiry) {
      anomalyRecords.push({
        id: record.id,
        staff: profileMap[record.staff_id],
        course: course.name,
        completion: record.completion_date,
        expected: expectedExpiry,
        actual: actualExpiry,
        expiry_months: course.expiry_months || 12
      });
    }
  }

  console.log(`Found ${anomalyRecords.length} date anomalies in Armfield House\n`);

  if (anomalyRecords.length === 0) {
    console.log('✅ No anomalies found!\n');
    return;
  }

  // Show what will be fixed
  console.log('Anomalies to fix:\n');
  anomalyRecords.slice(0, 5).forEach(r => {
    console.log(`  Record ${r.id}:`);
    console.log(`    Staff: ${r.staff}`);
    console.log(`    Course: ${r.course}`);
    console.log(`    Completion: ${r.completion} + ${r.expiry_months} months`);
    console.log(`    Expected: ${r.expected}`);
    console.log(`    Current: ${r.actual}\n`);
  });
  if (anomalyRecords.length > 5) {
    console.log(`  ... and ${anomalyRecords.length - 5} more\n`);
  }

  // Fix anomalies
  let fixed = 0;
  let errors = 0;

  for (const anomaly of anomalyRecords) {
    try {
      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: anomaly.expected })
        .eq('id', anomaly.id);

      if (error) {
        console.log(`❌ Error updating record ${anomaly.id}: ${error.message}`);
        errors++;
      } else {
        console.log(`✅ Fixed record ${anomaly.id}: ${anomaly.completion} + ${anomaly.expiry_months}mo = ${anomaly.expected}`);
        fixed++;
      }
    } catch (err) {
      console.log(`❌ Exception for record ${anomaly.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${'═'.repeat(120)}`);
  console.log(`Results: ${fixed} fixed, ${errors} errors\n`);
}

fixDateAnomaliesAccurately().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
