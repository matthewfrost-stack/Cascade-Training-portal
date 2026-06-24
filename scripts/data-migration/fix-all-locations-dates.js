require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAllLocationsDates() {
  console.log('='.repeat(80));
  console.log('FIXING ALL DATE ISSUES ACROSS ALL 13 LOCATIONS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all data with proper pagination
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log('Fetching all training records...');
    while (hasMore) {
      const { data, error } = await supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date, completed_at_location_id')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching records:', error);
        hasMore = false;
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRecords = allRecords.concat(data);
        console.log(`  - Fetched ${data.length} records (page ${page + 1})`);
        page++;
      }
    }

    console.log(`\n✅ Total records loaded: ${allRecords.length}\n`);

    // Get reference data
    const { data: locations } = await supabase.from('locations').select('id, name');
    const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');

    let stats = {
      total: allRecords.length,
      fixed: 0,
      errors: 0,
      byLocation: {}
    };

    let fixedRecords = [];

    // Analyze and prepare fixes
    for (const record of allRecords) {
      const location = locations.find(l => l.id === record.completed_at_location_id);
      const locationName = location?.name || 'Unknown';
      const course = courses.find(c => c.id === record.course_id);

      if (!stats.byLocation[locationName]) {
        stats.byLocation[locationName] = { fixed: 0, errors: 0 };
      }

      // Skip if no completion date - can't calculate expiry
      if (!record.completion_date) {
        stats.byLocation[locationName].errors++;
        continue;
      }

      // If expiry date is missing, calculate it
      if (!record.expiry_date && course) {
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
        const expectedExpiry = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

        fixedRecords.push({
          id: record.id,
          expiry_date: expectedExpiry,
          location: locationName,
          action: 'calculate_expiry'
        });

        stats.fixed++;
        stats.byLocation[locationName].fixed++;
        continue;
      }

      // If expiry date exists but might be wrong, verify and fix if needed
      if (record.expiry_date && course) {
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
        const expectedExpiry = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;

        if (record.expiry_date !== expectedExpiry) {
          fixedRecords.push({
            id: record.id,
            expiry_date: expectedExpiry,
            location: locationName,
            action: 'correct_anomaly',
            from: record.expiry_date,
            to: expectedExpiry
          });

          stats.fixed++;
          stats.byLocation[locationName].fixed++;
        }
      }
    }

    // Apply all fixes
    console.log(`Applying ${fixedRecords.length} fixes...\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const fix of fixedRecords) {
      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: fix.expiry_date })
        .eq('id', fix.id);

      if (error) {
        console.error(`❌ Error fixing record ${fix.id}:`, error.message);
        errorCount++;
      } else {
        successCount++;
      }
    }

    // Report results
    console.log('='.repeat(80));
    console.log('RESULTS BY LOCATION');
    console.log('='.repeat(80));

    Object.entries(stats.byLocation)
      .sort((a, b) => b[1].fixed - a[1].fixed)
      .forEach(([loc, data]) => {
        console.log(`\n${loc}:`);
        console.log(`  ✅ Fixed: ${data.fixed}`);
        console.log(`  🔴 Cannot fix (no completion_date): ${data.errors}`);
      });

    console.log('\n' + '='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal records: ${stats.total}`);
    console.log(`✅ Successfully fixed: ${successCount}`);
    console.log(`❌ Fix errors: ${errorCount}`);
    console.log(`🔴 Unfixable (missing completion_date): ${Object.values(stats.byLocation).reduce((sum, loc) => sum + loc.errors, 0)}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

fixAllLocationsDates();
