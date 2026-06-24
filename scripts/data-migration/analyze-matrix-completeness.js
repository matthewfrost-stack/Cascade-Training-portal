require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

async function analyzeMatrixCompleteness() {
  console.log('='.repeat(100));
  console.log('TRAINING MATRIX COMPLETENESS ANALYSIS');
  console.log('='.repeat(100));
  console.log('');

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  // Get all training courses
  const { data: allCourses } = await supabase
    .from('training_courses')
    .select('id, name');

  const courseMap = new Map();
  allCourses.forEach(c => {
    courseMap.set(c.name.replace(/\s+/g, ' ').toLowerCase().trim(), c);
    // Also without (Careskills) suffix
    const withoutSuffix = c.name.replace(/\s*\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').toLowerCase().trim();
    if (withoutSuffix !== c.name.toLowerCase()) {
      courseMap.set(withoutSuffix, c);
    }
  });

  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));

  let totalStats = {
    locationsProcessed: 0,
    coursesWithData: 0,
    coursesWithoutData: 0,
    totalRecords: 0,
    statusBreakdown: {}
  };

  for (const location of locations) {
    // Find matching CSV
    const csvFile = csvFiles.find(f => {
      const match = f.match(/^(.+?)\s+Training Matrix\s*-/);
      if (!match) return false;
      return match[1].trim().toLowerCase() === location.name.toLowerCase();
    });

    if (!csvFile) {
      console.log(`⚠️  ${location.name}: No CSV file found, skipping`);
      continue;
    }

    // Read CSV
    const content = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
    const rows = parse(content, { relax_column_count: true });

    // Find header row
    let headerRowIndex = -1;
    for (let i = 0; i < 10; i++) {
      if ((rows[i]?.[0] || '').toString().trim().toLowerCase() === 'staff name') {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`⚠️  ${location.name}: Could not find header row`);
      continue;
    }

    // Get course names from header (de-duplicate)
    const seenCourses = new Set();
    const csvCourseNames = [];
    rows[headerRowIndex].slice(1).forEach(c => {
      const name = (c || '').toString().trim();
      const normalized = name.replace(/\s+/g, ' ').toLowerCase();
      if (name && !seenCourses.has(normalized)) {
        seenCourses.add(normalized);
        csvCourseNames.push(name);
      }
    });

    // Get staff for this location
    const { data: staffLocations } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(id, full_name)')
      .eq('location_id', location.id);

    const staffMap = new Map();
    staffLocations?.forEach(sl => {
      if (sl.profiles) {
        staffMap.set(sl.profiles.full_name?.toLowerCase().trim(), sl.profiles.id);
      }
    });

    // Get all training records for this location's staff
    const staffIds = [...staffMap.values()];
    const { data: trainingRecords } = await supabase
      .from('staff_training_matrix')
      .select('staff_id, course_id, completion_date, expiry_date, status')
      .in('staff_id', staffIds.length > 0 ? staffIds : ['none']);

    // Get location_training_courses for this location
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('training_course_id, training_courses(id, name)')
      .eq('location_id', location.id);

    // Analyze which courses have data
    const coursesWithData = new Set();
    const courseRecordCounts = new Map();
    const statusCounts = { booked: 0, na: 0, awaiting: 0, completed: 0, other: 0 };

    trainingRecords?.forEach(r => {
      coursesWithData.add(r.course_id);
      courseRecordCounts.set(r.course_id, (courseRecordCounts.get(r.course_id) || 0) + 1);
      
      const status = (r.status || '').toLowerCase();
      if (status === 'booked') statusCounts.booked++;
      else if (status === 'n/a' || status === 'na') statusCounts.na++;
      else if (status === 'awaiting' || status.includes('await')) statusCounts.awaiting++;
      else if (r.completion_date) statusCounts.completed++;
      else statusCounts.other++;
    });

    // Count courses without any data
    const coursesWithoutData = locationCourses?.filter(lc => 
      !coursesWithData.has(lc.training_course_id)
    ) || [];

    console.log(`\n${'─'.repeat(100)}`);
    console.log(`📍 ${location.name}`);
    console.log(`${'─'.repeat(100)}`);
    console.log(`   CSV: ${csvFile}`);
    console.log(`   Staff in location: ${staffMap.size}`);
    console.log(`   Courses in location: ${locationCourses?.length || 0}`);
    console.log(`   Courses with training data: ${coursesWithData.size}`);
    console.log(`   Courses with NO data: ${coursesWithoutData.length}`);
    console.log(`   Total training records: ${trainingRecords?.length || 0}`);
    console.log(`   Status breakdown:`);
    console.log(`     - Completed (with date): ${statusCounts.completed}`);
    console.log(`     - Booked: ${statusCounts.booked}`);
    console.log(`     - N/A: ${statusCounts.na}`);
    console.log(`     - Awaiting: ${statusCounts.awaiting}`);
    console.log(`     - Other/Empty: ${statusCounts.other}`);

    if (coursesWithoutData.length > 0 && coursesWithoutData.length <= 10) {
      console.log(`   Courses with no data (can be removed):`);
      coursesWithoutData.forEach(c => {
        console.log(`     - ${c.training_courses?.name}`);
      });
    } else if (coursesWithoutData.length > 10) {
      console.log(`   First 10 courses with no data:`);
      coursesWithoutData.slice(0, 10).forEach(c => {
        console.log(`     - ${c.training_courses?.name}`);
      });
    }

    totalStats.locationsProcessed++;
    totalStats.coursesWithData += coursesWithData.size;
    totalStats.coursesWithoutData += coursesWithoutData.length;
    totalStats.totalRecords += trainingRecords?.length || 0;
    Object.keys(statusCounts).forEach(k => {
      totalStats.statusBreakdown[k] = (totalStats.statusBreakdown[k] || 0) + statusCounts[k];
    });
  }

  console.log('\n' + '='.repeat(100));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(100));
  console.log(`Locations processed: ${totalStats.locationsProcessed}`);
  console.log(`Total courses with data across all locations: ${totalStats.coursesWithData}`);
  console.log(`Total courses without data (candidates for removal): ${totalStats.coursesWithoutData}`);
  console.log(`Total training records: ${totalStats.totalRecords}`);
  console.log(`Status breakdown:`);
  console.log(`  - Completed: ${totalStats.statusBreakdown.completed || 0}`);
  console.log(`  - Booked: ${totalStats.statusBreakdown.booked || 0}`);
  console.log(`  - N/A: ${totalStats.statusBreakdown.na || 0}`);
  console.log(`  - Awaiting: ${totalStats.statusBreakdown.awaiting || 0}`);
  console.log(`  - Other: ${totalStats.statusBreakdown.other || 0}`);
}

analyzeMatrixCompleteness().catch(console.error);
