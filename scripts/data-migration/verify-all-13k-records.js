require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAllLocationsDates() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE DATE VERIFICATION - ALL 13,000 RECORDS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all locations
    const { data: locations } = await supabase.from('locations').select('id, name').order('name');
    
    // Get all courses with expiry_months
    const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

    let totalRecords = 0;
    let validDates = 0;
    let missingExpiry = 0;
    let missingCompletion = 0;
    let anomalies = [];

    for (const location of locations) {
      const { data: records } = await supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date')
        .eq('completed_at_location_id', location.id);

      let locValid = 0;
      let locMissingExpiry = 0;
      let locMissingCompletion = 0;

      for (const record of records) {
        totalRecords++;

        if (!record.completion_date) {
          missingCompletion++;
          locMissingCompletion++;
          continue;
        }

        if (!record.expiry_date) {
          missingExpiry++;
          locMissingExpiry++;
          continue;
        }

        // Validate calculation
        const course = courses.find(c => c.id === record.course_id);
        if (course) {
          const months = course.expiry_months || 12;
          
          // Calculate expected expiry
          const [year, month, day] = record.completion_date.split('-').map(Number);
          let newMonth = month + months;
          let newYear = year;
          while (newMonth > 12) { newMonth -= 12; newYear++; }
          const lastDayOfMonth = new Date(newYear, newMonth, 0).getDate();
          const newDay = Math.min(day, lastDayOfMonth);
          const expected = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

          if (record.expiry_date === expected) {
            validDates++;
            locValid++;
          } else {
            anomalies.push({
              id: record.id,
              location: location.name,
              expected,
              actual: record.expiry_date,
              course: course.name
            });
          }
        }
      }

      const pct = records.length > 0 ? ((locValid / records.length) * 100).toFixed(1) : 0;
      console.log(`📍 ${location.name}: ${records.length} records | ✅ ${locValid} valid | ⚠️ ${locMissingExpiry} missing expiry | 🔴 ${locMissingCompletion} no completion`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal records: ${totalRecords}`);
    console.log(`✅ Valid dates: ${validDates} (${((validDates/totalRecords)*100).toFixed(1)}%)`);
    console.log(`⚠️  Missing expiry_date: ${missingExpiry}`);
    console.log(`🔴 Missing completion_date: ${missingCompletion}`);
    console.log(`❌ Anomalies: ${anomalies.length}`);

    if (anomalies.length > 0 && anomalies.length <= 20) {
      console.log('\nAnomalies:');
      anomalies.forEach(a => {
        console.log(`  ${a.location} - ${a.course}: Expected ${a.expected}, got ${a.actual}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyAllLocationsDates();
