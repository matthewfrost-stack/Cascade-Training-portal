const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAllDates() {
  console.log('\n' + '═'.repeat(120));
  console.log('  COMPREHENSIVE DATE VERIFICATION - ALL LOCATIONS');
  console.log('═'.repeat(120) + '\n');

  // Get all data needed for verification
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, home_house');
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
    .eq('status', 'completed');

  const locationMap = {};
  locations.forEach(l => {
    locationMap[l.id] = l.name;
  });

  const courseMap = {};
  courses.forEach(c => {
    courseMap[c.id] = { name: c.name, expiry_months: c.expiry_months };
  });

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.id] = { name: p.full_name, house: p.home_house };
  });

  console.log(`Data loaded:`);
  console.log(`  - ${Object.keys(locationMap).length} locations`);
  console.log(`  - ${Object.keys(courseMap).length} courses`);
  console.log(`  - ${Object.keys(profileMap).length} staff profiles`);
  console.log(`  - ${allRecords.length} completed training records\n`);

  // Analyze by location
  const recordsByLocation = {};
  locations.forEach(l => {
    recordsByLocation[l.name] = [];
  });

  allRecords.forEach(record => {
    const locName = locationMap[record.completed_at_location_id] || 'Unknown';
    if (recordsByLocation[locName]) {
      recordsByLocation[locName].push(record);
    }
  });

  console.log('RECORDS BY LOCATION:\n');
  let totalIssues = 0;
  const locationIssues = {};

  for (const [locName, records] of Object.entries(recordsByLocation)) {
    console.log(`\n📍 ${locName}`);
    console.log(`   Total completed records: ${records.length}`);

    let validDates = 0;
    let missingExpiry = 0;
    let calculationErrors = 0;
    let futureExpiry = 0;
    let expiredDates = [];
    let anomalies = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const record of records) {
      const course = courseMap[record.course_id];
      if (!course) continue;

      const completionDate = new Date(record.completion_date);
      completionDate.setHours(0, 0, 0, 0);

      if (!record.expiry_date) {
        missingExpiry++;
        continue;
      }

      const expiryDate = new Date(record.expiry_date);
      expiryDate.setHours(0, 0, 0, 0);

      // Calculate expected expiry date
      const expectedExpiry = new Date(completionDate);
      expectedExpiry.setMonth(expectedExpiry.getMonth() + (course.expiry_months || 12));

      const expectedStr = expectedExpiry.toISOString().split('T')[0];
      const actualStr = expiryDate.toISOString().split('T')[0];

      if (expectedStr !== actualStr) {
        calculationErrors++;
        anomalies.push({
          record_id: record.id,
          staff: profileMap[record.staff_id]?.name || 'Unknown',
          course: course.name,
          completion: record.completion_date,
          expected_expiry: expectedStr,
          actual_expiry: actualStr,
          difference_days: Math.floor((expiryDate - expectedExpiry) / (1000 * 60 * 60 * 24))
        });
      } else {
        validDates++;
      }

      // Check if expiry is in future
      if (expiryDate > today) {
        futureExpiry++;
      } else {
        expiredDates.push({
          staff: profileMap[record.staff_id]?.name || 'Unknown',
          course: course.name,
          expiry_date: record.expiry_date,
          days_expired: Math.floor((today - expiryDate) / (1000 * 60 * 60 * 24))
        });
      }
    }

    console.log(`   ✅ Valid dates: ${validDates}`);
    if (missingExpiry > 0) console.log(`   ⚠️  Missing expiry dates: ${missingExpiry}`);
    if (calculationErrors > 0) console.log(`   ❌ Calculation errors: ${calculationErrors}`);
    console.log(`   📅 Expiring in future: ${futureExpiry}`);
    if (expiredDates.length > 0) {
      console.log(`   ⏳ Already expired: ${expiredDates.length}`);
      if (expiredDates.length <= 3) {
        expiredDates.forEach(d => {
          console.log(`      - ${d.staff} (${d.course}): ${d.days_expired} days ago`);
        });
      } else {
        expiredDates.slice(0, 3).forEach(d => {
          console.log(`      - ${d.staff} (${d.course}): ${d.days_expired} days ago`);
        });
        console.log(`      ... and ${expiredDates.length - 3} more`);
      }
    }

    if (anomalies.length > 0) {
      console.log(`\n   🔴 CALCULATION ANOMALIES (${anomalies.length}):`);
      anomalies.slice(0, 3).forEach(a => {
        console.log(`      - ${a.staff}: ${a.course}`);
        console.log(`        Completion: ${a.completion}`);
        console.log(`        Expected: ${a.expected_expiry}, Actual: ${a.actual_expiry} (${a.difference_days > 0 ? '+' : ''}${a.difference_days} days)`);
      });
      if (anomalies.length > 3) {
        console.log(`      ... and ${anomalies.length - 3} more anomalies`);
      }
      locationIssues[locName] = {
        anomalies: anomalies.length,
        details: anomalies.slice(0, 5)
      };
      totalIssues += anomalies.length;
    }
  }

  // Summary statistics
  console.log(`\n${'═'.repeat(120)}`);
  console.log('\nSUMMARY STATISTICS:\n');

  let totalCompleted = 0;
  let totalValidDates = 0;
  let totalAnomalies = 0;
  let totalExpiredRecords = 0;

  for (const [locName, records] of Object.entries(recordsByLocation)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let validCount = 0;
    let expiredCount = 0;

    for (const record of records) {
      if (!record.expiry_date) continue;
      
      const course = courseMap[record.course_id];
      if (!course) continue;

      const completionDate = new Date(record.completion_date);
      completionDate.setHours(0, 0, 0, 0);
      const expectedExpiry = new Date(completionDate);
      expectedExpiry.setMonth(expectedExpiry.getMonth() + (course.expiry_months || 12));

      const expiryDate = new Date(record.expiry_date);
      expiryDate.setHours(0, 0, 0, 0);

      const expectedStr = expectedExpiry.toISOString().split('T')[0];
      const actualStr = expiryDate.toISOString().split('T')[0];

      if (expectedStr === actualStr) {
        validCount++;
      }

      if (expiryDate <= today) {
        expiredCount++;
      }
    }

    totalCompleted += records.length;
    totalValidDates += validCount;
    totalExpiredRecords += expiredCount;
  }

  totalAnomalies = totalCompleted - totalValidDates;

  console.log(`Total completed records verified: ${totalCompleted}`);
  console.log(`✅ Correctly calculated dates: ${totalValidDates} (${((totalValidDates/totalCompleted)*100).toFixed(1)}%)`);
  console.log(`⏳ Records with expired dates: ${totalExpiredRecords}`);
  console.log(`❌ Anomalies found: ${totalAnomalies}\n`);

  if (totalAnomalies === 0) {
    console.log('🎉 ALL DATES ARE CORRECT ACROSS ALL LOCATIONS!\n');
  } else {
    console.log(`⚠️  Issues found in locations: ${Object.keys(locationIssues).join(', ')}\n`);
  }

  console.log('═'.repeat(120) + '\n');
}

verifyAllDates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
