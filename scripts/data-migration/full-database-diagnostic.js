require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fullDiagnostic() {
  console.log('Full database structure check...\n');

  try {
    // Get all records with proper pagination
    let allRecords = [];
    let page = 0;
    let pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date, completed_at_location_id')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching records:', error);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRecords = allRecords.concat(data);
        page++;
      }
    }

    console.log(`✅ Total records fetched: ${allRecords.length}`);

    // Get metadata
    const { data: locations } = await supabase.from('locations').select('id, name');
    const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

    console.log(`📍 Total locations: ${locations.length}`);
    console.log(`📚 Total courses: ${courses.length}`);

    // Categorize all issues
    let issues = {
      missingCompletion: {},
      missingExpiry: {},
      anomalies: {}
    };

    let counts = {
      totalRecords: allRecords.length,
      validDates: 0,
      missingCompletion: 0,
      missingExpiry: 0,
      anomalies: 0
    };

    for (const record of allRecords) {
      const loc = locations.find(l => l.id === record.completed_at_location_id);
      const locationName = loc?.name || 'Unknown';
      const course = courses.find(c => c.id === record.course_id);
      const courseName = course?.name || 'Unknown Course';

      if (!record.completion_date) {
        counts.missingCompletion++;
        if (!issues.missingCompletion[locationName]) issues.missingCompletion[locationName] = {};
        issues.missingCompletion[locationName][courseName] = 
          (issues.missingCompletion[locationName][courseName] || 0) + 1;
      } else if (!record.expiry_date) {
        counts.missingExpiry++;
        if (!issues.missingExpiry[locationName]) issues.missingExpiry[locationName] = {};
        issues.missingExpiry[locationName][courseName] = 
          (issues.missingExpiry[locationName][courseName] || 0) + 1;
      } else if (course) {
        const months = course.expiry_months || 12;
        const [year, month, day] = record.completion_date.split('-').map(Number);
        let newMonth = month + months;
        let newYear = year;
        while (newMonth > 12) { newMonth -= 12; newYear++; }
        const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
        const newDay = Math.min(day, lastDayOfMonth);
        const expected = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

        if (record.expiry_date !== expected) {
          counts.anomalies++;
          if (!issues.anomalies[locationName]) issues.anomalies[locationName] = {};
          issues.anomalies[locationName][courseName] = 
            (issues.anomalies[locationName][courseName] || 0) + 1;
        } else {
          counts.validDates++;
        }
      } else {
        counts.validDates++;
      }
    }

    // Report
    console.log('\n' + '='.repeat(80));
    console.log('MISSING COMPLETION_DATE BY LOCATION:');
    console.log('='.repeat(80));
    Object.entries(issues.missingCompletion)
      .sort((a, b) => {
        const countA = Object.values(a[1]).reduce((sum, v) => sum + v, 0);
        const countB = Object.values(b[1]).reduce((sum, v) => sum + v, 0);
        return countB - countA;
      })
      .forEach(([loc, courses]) => {
        const total = Object.values(courses).reduce((sum, v) => sum + v, 0);
        console.log(`\n${loc}: ${total} records missing completion_date`);
        Object.entries(courses)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([course, count]) => {
            console.log(`  - ${course}: ${count}`);
          });
      });

    console.log('\n' + '='.repeat(80));
    console.log('MISSING EXPIRY_DATE BY LOCATION:');
    console.log('='.repeat(80));
    Object.entries(issues.missingExpiry)
      .sort((a, b) => {
        const countA = Object.values(a[1]).reduce((sum, v) => sum + v, 0);
        const countB = Object.values(b[1]).reduce((sum, v) => sum + v, 0);
        return countB - countA;
      })
      .forEach(([loc, courses]) => {
        const total = Object.values(courses).reduce((sum, v) => sum + v, 0);
        console.log(`\n${loc}: ${total} records`);
        Object.entries(courses)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([course, count]) => {
            console.log(`  - ${course}: ${count}`);
          });
      });

    console.log('\n' + '='.repeat(80));
    console.log('DATE ANOMALIES BY LOCATION:');
    console.log('='.repeat(80));
    Object.entries(issues.anomalies)
      .sort((a, b) => {
        const countA = Object.values(a[1]).reduce((sum, v) => sum + v, 0);
        const countB = Object.values(b[1]).reduce((sum, v) => sum + v, 0);
        return countB - countA;
      })
      .forEach(([loc, courses]) => {
        const total = Object.values(courses).reduce((sum, v) => sum + v, 0);
        console.log(`\n${loc}: ${total} anomalies`);
        Object.entries(courses)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([course, count]) => {
            console.log(`  - ${course}: ${count}`);
          });
      });

    console.log('\n' + '='.repeat(80));
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal records: ${counts.totalRecords}`);
    console.log(`✅ Valid dates: ${counts.validDates} (${((counts.validDates/counts.totalRecords)*100).toFixed(1)}%)`);
    console.log(`🔴 Missing completion_date: ${counts.missingCompletion} (${((counts.missingCompletion/counts.totalRecords)*100).toFixed(1)}%)`);
    console.log(`⚠️  Missing expiry_date: ${counts.missingExpiry} (${((counts.missingExpiry/counts.totalRecords)*100).toFixed(1)}%)`);
    console.log(`❌ Anomalies: ${counts.anomalies} (${((counts.anomalies/counts.totalRecords)*100).toFixed(1)}%)`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

fullDiagnostic();
