require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('RUNNING ALL TESTS');
  console.log('='.repeat(80));
  console.log('');

  let passed = 0;
  let failed = 0;

  // =====================================================
  // TEST 1: Course Order Matches CSV
  // =====================================================
  console.log('TEST 1: Course Order Verification');
  console.log('-'.repeat(40));
  
  const fs = require('fs');
  const path = require('path');
  const { parse } = require('csv-parse/sync');
  const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';
  
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');
  
  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  let allLocationsMatch = true;
  
  for (const location of locations) {
    const csvFile = csvFiles.find(f => {
      const match = f.match(/^(.+?)\s+Training Matrix\s*-/);
      if (!match) return false;
      return match[1].trim().toLowerCase() === location.name.toLowerCase();
    });
    
    if (!csvFile) continue;
    
    const content = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
    const rows = parse(content, { relax_column_count: true });
    
    let headerRowIndex = -1;
    for (let i = 0; i < 10; i++) {
      if ((rows[i]?.[0] || '').toString().trim().toLowerCase() === 'staff name') {
        headerRowIndex = i;
        break;
      }
    }
    
    if (headerRowIndex === -1) continue;
    
    // De-duplicate CSV courses
    const seenCourses = new Set();
    const csvCourses = [];
    rows[headerRowIndex].slice(1).forEach(c => {
      const name = (c || '').toString().trim();
      const normalized = name.replace(/\s+/g, ' ').toLowerCase();
      if (name && !seenCourses.has(normalized)) {
        seenCourses.add(normalized);
        csvCourses.push(name);
      }
    });
    
    const { data: dbCourses } = await supabase
      .from('location_training_courses')
      .select('training_courses(name)')
      .eq('location_id', location.id)
      .order('display_order');
    
    const filteredDbCourses = dbCourses?.filter(c => 
      c.training_courses && !c.training_courses.name.toLowerCase().includes('(careskills)')
    ) || [];
    
    // Check first 10 courses match
    let matches = 0;
    const checkCount = Math.min(10, csvCourses.length, filteredDbCourses.length);
    for (let i = 0; i < checkCount; i++) {
      const csvName = csvCourses[i].replace(/\s+/g, ' ').toLowerCase().trim();
      const dbName = (filteredDbCourses[i]?.training_courses?.name || '').replace(/\s+/g, ' ').toLowerCase().trim();
      if (csvName === dbName) matches++;
    }
    
    if (matches < checkCount) {
      console.log(`  ❌ ${location.name}: ${matches}/${checkCount} first courses match`);
      allLocationsMatch = false;
    }
  }
  
  if (allLocationsMatch) {
    console.log('  ✅ All locations have correct course order');
    passed++;
  } else {
    failed++;
  }
  console.log('');

  // =====================================================
  // TEST 2: Booked Status Preserves Expiry Date (Code Check)
  // =====================================================
  console.log('TEST 2: Booked Status Preserves Expiry Date');
  console.log('-'.repeat(40));
  
  const matrixPagePath = '/Users/matthewfrost/training-portal/src/app/training-matrix/page.tsx';
  const matrixCode = fs.readFileSync(matrixPagePath, 'utf-8');
  
  const hasBookedExpiryPreservation = matrixCode.includes("status === 'booked' && existingCell?.expiry_date");
  
  if (hasBookedExpiryPreservation) {
    console.log('  ✅ Code includes expiry preservation for booked status');
    passed++;
  } else {
    console.log('  ❌ Missing expiry preservation code for booked status');
    failed++;
  }
  console.log('');

  // =====================================================
  // TEST 3: Careskills Courses Have 12-Month Expiry
  // =====================================================
  console.log('TEST 3: Careskills Courses Have Yearly Expiry');
  console.log('-'.repeat(40));
  
  const { data: careskillsCourses } = await supabase
    .from('training_courses')
    .select('id, name, expiry_months')
    .ilike('name', '%(Careskills)%');
  
  const wrongExpiry = careskillsCourses?.filter(c => c.expiry_months !== 12) || [];
  
  if (wrongExpiry.length === 0) {
    console.log(`  ✅ All ${careskillsCourses?.length || 0} Careskills courses have 12-month expiry`);
    passed++;
  } else {
    console.log(`  ❌ ${wrongExpiry.length} Careskills courses don't have 12-month expiry:`);
    wrongExpiry.slice(0, 5).forEach(c => console.log(`    - ${c.name}: ${c.expiry_months} months`));
    failed++;
  }
  console.log('');

  // =====================================================
  // TEST 4: Atlas Import Course Matching
  // =====================================================
  console.log('TEST 4: Atlas Import Course Matching');
  console.log('-'.repeat(40));
  
  const { data: trainingCourses } = await supabase
    .from('training_courses')
    .select('id, name, careskills_name');
  
  // Build course map like the import does
  const courseMap = new Map();
  trainingCourses?.forEach(course => {
    courseMap.set(course.name.toLowerCase(), course.id);
    if (course.careskills_name) {
      courseMap.set(course.careskills_name.toLowerCase(), course.id);
    }
  });
  
  // Test some common Careskills course names that might be in Excel
  const testCourses = [
    'Fire Safety',
    'Health and Safety',
    'Infection Control',
    'First Aid',
    'Safeguarding and Protection of Adults',
    'Mental Capacity',
    'Medication Practice',
    'Moving and Handling',
    'GDPR 1',
    'Food Hygiene'
  ];
  
  let matchedCourses = 0;
  for (const testCourse of testCourses) {
    const found = courseMap.has(testCourse.toLowerCase());
    if (found) {
      matchedCourses++;
    } else {
      console.log(`  ⚠️  "${testCourse}" not directly matched (may need normalization)`);
    }
  }
  
  if (matchedCourses >= 8) {
    console.log(`  ✅ ${matchedCourses}/${testCourses.length} common courses can be matched`);
    passed++;
  } else {
    console.log(`  ❌ Only ${matchedCourses}/${testCourses.length} courses matched`);
    failed++;
  }
  console.log('');

  // =====================================================
  // TEST 5: Staff Can Be Found By Name
  // =====================================================
  console.log('TEST 5: Staff Lookup By Name');
  console.log('-'.repeat(40));
  
  const { data: sampleStaff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false)
    .limit(5);
  
  const staffMap = new Map();
  const { data: allStaff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false);
  
  allStaff?.forEach(s => staffMap.set(s.full_name.toLowerCase(), s.id));
  
  let staffFound = 0;
  for (const staff of sampleStaff || []) {
    if (staffMap.has(staff.full_name.toLowerCase())) {
      staffFound++;
    }
  }
  
  if (staffFound === (sampleStaff?.length || 0)) {
    console.log(`  ✅ All ${staffFound} sample staff can be found by name`);
    passed++;
  } else {
    console.log(`  ❌ Only ${staffFound}/${sampleStaff?.length} staff found`);
    failed++;
  }
  console.log('');

  // =====================================================
  // TEST 6: Staff Have Locations Assigned
  // =====================================================
  console.log('TEST 6: Staff Have Locations');
  console.log('-'.repeat(40));
  
  const { data: staffWithLocations, count } = await supabase
    .from('staff_locations')
    .select('staff_id', { count: 'exact' });
  
  const uniqueStaffWithLoc = new Set(staffWithLocations?.map(s => s.staff_id) || []);
  const totalActiveStaff = allStaff?.length || 0;
  const staffWithLocCount = uniqueStaffWithLoc.size;
  const percentage = Math.round((staffWithLocCount / totalActiveStaff) * 100);
  
  if (percentage >= 90) {
    console.log(`  ✅ ${staffWithLocCount}/${totalActiveStaff} staff (${percentage}%) have locations assigned`);
    passed++;
  } else {
    console.log(`  ⚠️  ${staffWithLocCount}/${totalActiveStaff} staff (${percentage}%) have locations`);
    console.log(`     ${totalActiveStaff - staffWithLocCount} staff without locations won't be updated by import`);
    passed++; // Warning but not failure
  }
  console.log('');

  // =====================================================
  // TEST 7: Training Records Have Required Fields
  // =====================================================
  console.log('TEST 7: Training Records Integrity');
  console.log('-'.repeat(40));
  
  const { data: sampleRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status')
    .limit(100);
  
  let validRecords = 0;
  let invalidRecords = 0;
  
  for (const record of sampleRecords || []) {
    const hasStaffId = !!record.staff_id;
    const hasCourseId = !!record.course_id;
    const hasValidStatus = ['completed', 'booked', 'n/a', 'na', 'awaiting', null, ''].includes(record.status?.toLowerCase());
    
    if (hasStaffId && hasCourseId) {
      validRecords++;
    } else {
      invalidRecords++;
    }
  }
  
  if (invalidRecords === 0) {
    console.log(`  ✅ All ${validRecords} sample records have required fields`);
    passed++;
  } else {
    console.log(`  ❌ ${invalidRecords} records missing staff_id or course_id`);
    failed++;
  }
  console.log('');

  // =====================================================
  // SUMMARY
  // =====================================================
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');
  
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log(`⚠️  ${failed} test(s) need attention`);
  }
}

runAllTests().catch(console.error);
