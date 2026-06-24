require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function comprehensiveDiagnostic() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE DIAGNOSTIC - ALL 13,000 TRAINING RECORDS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all data
    const { data: locations } = await supabase.from('locations').select('id, name').order('name');
    const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
    const { data: allRecords } = await supabase.from('staff_training_matrix')
      .select('id, staff_id, course_id, completion_date, expiry_date, completed_at_location_id, status');

    console.log(`📊 Total records to analyze: ${allRecords.length}\n`);

    // Categorize issues
    let missingCompletionByLocation = {};
    let missingExpiryByLocation = {};
    let anomaliesByLocation = {};
    let missingCompletionByCourse = {};
    let missingExpiryByCourse = {};
    let anomaliesByCourse = {};

    let totalMissingCompletion = 0;
    let totalMissingExpiry = 0;
    let totalAnomalies = 0;

    for (const record of allRecords) {
      const location = locations.find(l => l.id === record.completed_at_location_id)?.name || 'Unknown';
      const course = courses.find(c => c.id === record.course_id);
      const courseName = course?.name || 'Unknown Course';

      // Check for missing completion_date
      if (!record.completion_date) {
        totalMissingCompletion++;
        missingCompletionByLocation[location] = (missingCompletionByLocation[location] || 0) + 1;
        missingCompletionByCourse[courseName] = (missingCompletionByCourse[courseName] || 0) + 1;
        continue;
      }

      // Check for missing expiry_date
      if (!record.expiry_date) {
        totalMissingExpiry++;
        missingExpiryByLocation[location] = (missingExpiryByLocation[location] || 0) + 1;
        missingExpiryByCourse[courseName] = (missingExpiryByCourse[courseName] || 0) + 1;
        continue;
      }

      // Check for anomalies
      if (course) {
        const months = course.expiry_months || 12;
        const [year, month, day] = record.completion_date.split('-').map(Number);
        let newMonth = month + months;
        let newYear = year;
        while (newMonth > 12) { newMonth -= 12; newYear++; }
        const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
        const newDay = Math.min(day, lastDayOfMonth);
        const expected = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

        if (record.expiry_date !== expected) {
          totalAnomalies++;
          anomaliesByLocation[location] = (anomaliesByLocation[location] || 0) + 1;
          anomaliesByCourse[courseName] = (anomaliesByCourse[courseName] || 0) + 1;
        }
      }
    }

    // Report by location
    console.log('MISSING COMPLETION_DATE BY LOCATION:');
    console.log('-'.repeat(80));
    Object.entries(missingCompletionByLocation)
      .sort((a, b) => b[1] - a[1])
      .forEach(([loc, count]) => {
        console.log(`  ${loc}: ${count} records`);
      });

    console.log('\nMISSING EXPIRY_DATE BY LOCATION:');
    console.log('-'.repeat(80));
    Object.entries(missingExpiryByLocation)
      .sort((a, b) => b[1] - a[1])
      .forEach(([loc, count]) => {
        console.log(`  ${loc}: ${count} records`);
      });

    console.log('\nDATE ANOMALIES BY LOCATION:');
    console.log('-'.repeat(80));
    Object.entries(anomaliesByLocation)
      .sort((a, b) => b[1] - a[1])
      .forEach(([loc, count]) => {
        console.log(`  ${loc}: ${count} records`);
      });

    // Report by course
    console.log('\n\nMISSING COMPLETION_DATE BY COURSE (Top 20):');
    console.log('-'.repeat(80));
    Object.entries(missingCompletionByCourse)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([course, count]) => {
        console.log(`  ${course}: ${count} records`);
      });

    console.log('\nMISSING EXPIRY_DATE BY COURSE:');
    console.log('-'.repeat(80));
    Object.entries(missingExpiryByCourse)
      .sort((a, b) => b[1] - a[1])
      .forEach(([course, count]) => {
        console.log(`  ${course}: ${count} records`);
      });

    console.log('\nDATE ANOMALIES BY COURSE:');
    console.log('-'.repeat(80));
    Object.entries(anomaliesByCourse)
      .sort((a, b) => b[1] - a[1])
      .forEach(([course, count]) => {
        console.log(`  ${course}: ${count} records`);
      });

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n🔴 Missing completion_date: ${totalMissingCompletion} records (${(totalMissingCompletion/allRecords.length*100).toFixed(1)}%)`);
    console.log(`⚠️  Missing expiry_date: ${totalMissingExpiry} records (${(totalMissingExpiry/allRecords.length*100).toFixed(1)}%)`);
    console.log(`❌ Date anomalies: ${totalAnomalies} records (${(totalAnomalies/allRecords.length*100).toFixed(1)}%)`);
    console.log(`✅ Valid records: ${allRecords.length - totalMissingCompletion - totalMissingExpiry - totalAnomalies} records (${((allRecords.length - totalMissingCompletion - totalMissingExpiry - totalAnomalies)/allRecords.length*100).toFixed(1)}%)`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

comprehensiveDiagnostic();
