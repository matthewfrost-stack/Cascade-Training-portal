const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDateAnomalies() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIX DATE CALCULATION ANOMALIES');
  console.log('═'.repeat(120) + '\n');

  // Get all completed records
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status')
    .eq('status', 'completed');

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

  // Find anomalies
  let anomalyRecords = [];

  for (const record of allRecords) {
    if (!record.expiry_date || !record.completion_date) continue;

    const course = courseMap[record.course_id];
    if (!course) continue;

    const completionDate = new Date(record.completion_date);
    const expectedExpiry = new Date(completionDate);
    expectedExpiry.setMonth(expectedExpiry.getMonth() + (course.expiry_months || 12));

    const expiryDate = new Date(record.expiry_date);

    const expectedStr = expectedExpiry.toISOString().split('T')[0];
    const actualStr = expiryDate.toISOString().split('T')[0];

    if (expectedStr !== actualStr) {
      const diffDays = Math.floor((expiryDate - expectedExpiry) / (1000 * 60 * 60 * 24));
      anomalyRecords.push({
        id: record.id,
        staff: profileMap[record.staff_id],
        course: course.name,
        completion: record.completion_date,
        expected: expectedStr,
        actual: actualStr,
        diff_days: diffDays
      });
    }
  }

  console.log(`Found ${anomalyRecords.length} date anomalies\n`);

  if (anomalyRecords.length === 0) {
    console.log('✅ No anomalies found!\n');
    return;
  }

  // Show what will be fixed
  console.log('Anomalies to fix:\n');
  anomalyRecords.forEach(r => {
    console.log(`  Record ${r.id}:`);
    console.log(`    Staff: ${r.staff}`);
    console.log(`    Course: ${r.course}`);
    console.log(`    Completion: ${r.completion}`);
    console.log(`    Expected expiry: ${r.expected}`);
    console.log(`    Current expiry: ${r.actual}`);
    console.log(`    Difference: ${r.diff_days} days\n`);
  });

  // Fix anomalies by recalculating expiry dates properly using ISO date math
  let fixed = 0;
  let errors = 0;

  for (const anomaly of anomalyRecords) {
    try {
      // Parse completion date carefully
      const [year, month, day] = anomaly.completion.split('-').map(Number);
      
      // Create date at start of day in UTC
      const completionDate = new Date(Date.UTC(year, month - 1, day));
      
      // Get course months
      const course = courseMap[anomaly.id];
      const course_data = courses.find(c => c.name === anomaly.course);
      const months = course_data?.expiry_months || 12;
      
      // Calculate expiry: add months to day-of-month
      let expiryYear = year;
      let expiryMonth = month + months;
      let expiryDay = day;
      
      // Handle month overflow
      while (expiryMonth > 12) {
        expiryMonth -= 12;
        expiryYear += 1;
      }
      
      // Handle day overflow (e.g., Jan 31 + 1 year = Jan 31, but Jan 31 doesn't exist in Feb)
      // Create the date and let JS handle it
      const expiryDate = new Date(Date.UTC(expiryYear, expiryMonth - 1, expiryDay));
      const expiryStr = expiryDate.toISOString().split('T')[0];
      
      // Update database
      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: expiryStr })
        .eq('id', anomaly.id);
      
      if (error) {
        console.log(`❌ Error updating record ${anomaly.id}: ${error.message}`);
        errors++;
      } else {
        console.log(`✅ Fixed record ${anomaly.id}: ${anomaly.completion} + ${months}mo = ${expiryStr}`);
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

fixDateAnomalies().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
