require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAllLocationsAfterFix() {
  console.log('='.repeat(80));
  console.log('VERIFICATION - ALL LOCATIONS AFTER DATE FIXES');
  console.log('='.repeat(80) + '\n');

  try {
    // Fetch all records with pagination
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;

    console.log('Loading all records for verification...');
    while (true) {
      const { data, error } = await supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date, completed_at_location_id')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error || !data || data.length === 0) break;
      allRecords = allRecords.concat(data);
      page++;
    }

    // Get reference data
    const { data: locations } = await supabase.from('locations').select('id, name');
    const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

    console.log(`✅ Loaded ${allRecords.length} records\n`);

    // Categorize results
    let stats = {
      total: allRecords.length,
      validDates: 0,
      missingCompletion: 0,
      missingExpiry: 0,
      anomalies: 0,
      byLocation: {}
    };

    let anomalyDetails = [];

    for (const record of allRecords) {
      const location = locations.find(l => l.id === record.completed_at_location_id);
      const locationName = location?.name || 'Unknown';
      const course = courses.find(c => c.id === record.course_id);

      if (!stats.byLocation[locationName]) {
        stats.byLocation[locationName] = {
          total: 0,
          valid: 0,
          missingCompletion: 0,
          missingExpiry: 0,
          anomalies: 0
        };
      }

      stats.byLocation[locationName].total++;

      if (!record.completion_date) {
        stats.missingCompletion++;
        stats.byLocation[locationName].missingCompletion++;
        continue;
      }

      if (!record.expiry_date) {
        stats.missingExpiry++;
        stats.byLocation[locationName].missingExpiry++;
        continue;
      }

      // Verify calculation
      if (course) {
        const months = course.expiry_months || 12;
        const [year, month, day] = record.completion_date.split('-').map(Number);
        
        let newMonth = month + months;
        let newYear = year;
        while (newMonth > 12) {
          newMonth -= 12;
          newYear++;
        }
        
        const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
        const newDay = Math.min(day, lastDayOfMonth);
        const expected = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

        if (record.expiry_date !== expected) {
          stats.anomalies++;
          stats.byLocation[locationName].anomalies++;
          anomalyDetails.push({
            location: locationName,
            course: course.name,
            completion: record.completion_date,
            expected,
            actual: record.expiry_date
          });
        } else {
          stats.validDates++;
          stats.byLocation[locationName].valid++;
        }
      } else {
        stats.validDates++;
        stats.byLocation[locationName].valid++;
      }
    }

    // Report by location
    console.log('DETAILED BREAKDOWN BY LOCATION:');
    console.log('='.repeat(80));
    Object.entries(stats.byLocation)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([loc, data]) => {
        const validPct = ((data.valid / data.total) * 100).toFixed(1);
        console.log(`\n${loc}:`);
        console.log(`  Total records: ${data.total}`);
        console.log(`  ✅ Valid dates: ${data.valid} (${validPct}%)`);
        console.log(`  🔴 Missing completion_date: ${data.missingCompletion}`);
        console.log(`  ⚠️  Missing expiry_date: ${data.missingExpiry}`);
        console.log(`  ❌ Anomalies: ${data.anomalies}`);
      });

    // Overall summary
    console.log('\n' + '='.repeat(80));
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal records: ${stats.total}`);
    console.log(`✅ Valid dates: ${stats.validDates} (${((stats.validDates/stats.total)*100).toFixed(1)}%)`);
    console.log(`🔴 Missing completion_date: ${stats.missingCompletion} (${((stats.missingCompletion/stats.total)*100).toFixed(1)}%)`);
    console.log(`⚠️  Missing expiry_date: ${stats.missingExpiry} (${((stats.missingExpiry/stats.total)*100).toFixed(1)}%)`);
    console.log(`❌ Remaining anomalies: ${stats.anomalies} (${((stats.anomalies/stats.total)*100).toFixed(1)}%)`);

    if (anomalyDetails.length > 0 && anomalyDetails.length <= 50) {
      console.log('\nANOMALY DETAILS:');
      console.log('-'.repeat(80));
      anomalyDetails.forEach(a => {
        console.log(`${a.location} - ${a.course}:`);
        console.log(`  Completion: ${a.completion}`);
        console.log(`  Expected:   ${a.expected}`);
        console.log(`  Actual:     ${a.actual}`);
      });
    } else if (anomalyDetails.length > 50) {
      console.log(`\n${anomalyDetails.length} anomalies found (too many to display individually)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyAllLocationsAfterFix();
