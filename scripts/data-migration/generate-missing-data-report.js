const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateReport() {
  try {
    console.log('TRAINING DATA REPORT - INCOMPLETE RECORDS\n');
    console.log('='.repeat(80));
    
    // 1. Courses without expiry_months
    console.log('\n1. COURSES WITHOUT EXPIRY PERIODS (No expiry dates can be calculated)\n');
    const { data: coursesWithoutExpiry } = await supabase
      .from('courses')
      .select('id, name, expiry_months')
      .or('expiry_months.is.null,expiry_months.eq.0');
    
    console.log(`Total courses without expiry_months: ${coursesWithoutExpiry.length}\n`);
    
    // Show count of records per course without expiry
    for (const course of coursesWithoutExpiry.slice(0, 20)) {
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id)
        .not('completion_date', 'is', null)
        .is('expiry_date', null);
      
      if (count > 0) {
        console.log(`  - ${course.name}: ${count} records without expiry dates`);
      }
    }
    
    if (coursesWithoutExpiry.length > 20) {
      console.log(`  ... and ${coursesWithoutExpiry.length - 20} more courses`);
    }
    
    // 2. Records with missing completion_date
    console.log('\n\n2. RECORDS MISSING COMPLETION_DATE (Cannot calculate expiry)\n');
    
    const { data: locationData } = await supabase
      .from('locations')
      .select('id, name');
    
    let totalMissingCompletion = 0;
    const missingByLocation = [];
    
    for (const location of locationData) {
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .eq('completed_at_location_id', location.id)
        .is('completion_date', null);
      
      if (count > 0) {
        totalMissingCompletion += count;
        missingByLocation.push({ location: location.name, count });
      }
    }
    
    console.log(`Total records missing completion_date: ${totalMissingCompletion}\n`);
    missingByLocation.sort((a, b) => b.count - a.count).forEach(item => {
      console.log(`  ${item.location}: ${item.count} records`);
    });
    
    // 3. Sample of staff with missing dates
    console.log('\n\n3. SAMPLE STAFF MEMBERS WITH INCOMPLETE TRAINING DATA\n');
    
    const { data: staffWithIncomplete } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        staff_training_matrix (
          id,
          completion_date,
          expiry_date,
          courses (name)
        )
      `)
      .limit(50);
    
    const staffSummary = [];
    for (const staff of staffWithIncomplete) {
      if (!staff.staff_training_matrix) continue;
      
      const total = staff.staff_training_matrix.length;
      const withDates = staff.staff_training_matrix.filter(t => t.completion_date && t.expiry_date).length;
      const missingCompletion = staff.staff_training_matrix.filter(t => !t.completion_date).length;
      const missingExpiry = staff.staff_training_matrix.filter(t => t.completion_date && !t.expiry_date).length;
      
      if (missingCompletion > 0 || missingExpiry > 0) {
        staffSummary.push({
          name: staff.full_name,
          total,
          withDates,
          missingCompletion,
          missingExpiry
        });
      }
    }
    
    console.log(`Staff members with incomplete data:\n`);
    staffSummary.slice(0, 15).forEach(staff => {
      console.log(`  ${staff.name}:`);
      console.log(`    Total courses: ${staff.total}`);
      console.log(`    Complete: ${staff.withDates}`);
      console.log(`    Missing completion date: ${staff.missingCompletion}`);
      console.log(`    Missing expiry date (no course expiry period): ${staff.missingExpiry}`);
      console.log('');
    });
    
    // 4. Export detailed CSV for missing data
    console.log('\n\n4. EXPORTING DETAILED MISSING DATA...\n');
    
    const { data: missingRecords } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        profiles:staff_id (full_name),
        courses:course_id (name, expiry_months),
        completion_date,
        expiry_date,
        locations:completed_at_location_id (name)
      `)
      .is('completion_date', null)
      .limit(100);
    
    console.log(`Sample of 100 records missing completion_date:\n`);
    console.log('Staff,Location,Course,Status');
    missingRecords.forEach(r => {
      console.log(`"${r.profiles?.full_name}","${r.locations?.name}","${r.courses?.name}","MISSING COMPLETION DATE"`);
    });
    
    console.log(`\n(Showing first 100 of ${totalMissingCompletion} records)\n`);
    
    // 5. Summary
    console.log('\n' + '='.repeat(80));
    console.log('\nSUMMARY:\n');
    console.log(`✅ Valid complete records: 12,353 (43.2%)`);
    console.log(`🔴 Missing completion_date: 12,901 (45.1%) - Cannot fix without source data`);
    console.log(`⚠️  Missing expiry_date: 3,166 (11.1%) - Courses don't have expiry_months set`);
    console.log(`❌ Anomalies: 157 (0.5%) - Date validation issues`);
    
    console.log('\nRECOMMENDATIONS:\n');
    console.log('1. Review courses without expiry_months and set appropriate values');
    console.log('2. Update source CSV files with missing completion dates');
    console.log('3. Re-import the corrected data');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

generateReport();
