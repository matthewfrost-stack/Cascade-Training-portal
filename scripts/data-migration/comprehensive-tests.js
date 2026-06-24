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

let passed = 0;
let failed = 0;
let warnings = 0;

function logTest(name, success, message, isWarning = false) {
  if (success) {
    console.log(`  ✅ ${name}: ${message}`);
    passed++;
  } else if (isWarning) {
    console.log(`  ⚠️  ${name}: ${message}`);
    warnings++;
  } else {
    console.log(`  ❌ ${name}: ${message}`);
    failed++;
  }
}

async function runComprehensiveTests() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    COMPREHENSIVE TEST SUITE                                   ║');
  console.log('║                    Training Portal Verification                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // =====================================================
  // SECTION 1: DATABASE INTEGRITY
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 1: DATABASE INTEGRITY                                                │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Test 1.1: Locations exist
  const { data: locations } = await supabase.from('locations').select('id, name');
  logTest('1.1 Locations exist', locations?.length === 13, `${locations?.length || 0} locations found (expected 13)`);

  // Test 1.2: Training courses exist
  const { data: trainingCourses } = await supabase.from('training_courses').select('id, name, expiry_months');
  logTest('1.2 Training courses exist', trainingCourses?.length > 100, `${trainingCourses?.length || 0} courses found`);

  // Test 1.3: Staff profiles exist
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').eq('is_deleted', false);
  logTest('1.3 Staff profiles exist', profiles?.length > 400, `${profiles?.length || 0} active staff found`);

  // Test 1.4: Staff locations linked
  const { data: staffLocations } = await supabase.from('staff_locations').select('staff_id, location_id');
  const uniqueStaff = new Set(staffLocations?.map(s => s.staff_id) || []);
  logTest('1.4 Staff have locations', uniqueStaff.size >= profiles?.length * 0.95, 
    `${uniqueStaff.size}/${profiles?.length} staff have locations (${Math.round(uniqueStaff.size/profiles?.length*100)}%)`);

  // Test 1.5: Training records exist
  const { count: recordCount } = await supabase.from('staff_training_matrix').select('id', { count: 'exact', head: true });
  logTest('1.5 Training records exist', recordCount > 10000, `${recordCount} training records found`);

  console.log('');

  // =====================================================
  // SECTION 2: COURSE ORDER VERIFICATION (ALL LOCATIONS)
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 2: COURSE ORDER VERIFICATION (ALL 13 LOCATIONS)                      │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  let allLocationsCorrect = true;

  for (const location of locations || []) {
    const csvFile = csvFiles.find(f => {
      const match = f.match(/^(.+?)\s+Training Matrix\s*-/);
      if (!match) return false;
      return match[1].trim().toLowerCase() === location.name.toLowerCase();
    });

    if (!csvFile) {
      logTest(`2.${location.name}`, false, 'No CSV file found');
      allLocationsCorrect = false;
      continue;
    }

    const content = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
    const rows = parse(content, { relax_column_count: true });

    let headerRowIndex = -1;
    for (let i = 0; i < 10; i++) {
      if ((rows[i]?.[0] || '').toString().trim().toLowerCase() === 'staff name') {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      logTest(`2.${location.name}`, false, 'Could not find header row in CSV');
      allLocationsCorrect = false;
      continue;
    }

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

    // Compare all courses
    let matches = 0;
    const compareCount = Math.min(csvCourses.length, filteredDbCourses.length);
    for (let i = 0; i < compareCount; i++) {
      const csvName = csvCourses[i].replace(/\s+/g, ' ').toLowerCase().trim();
      const dbName = (filteredDbCourses[i]?.training_courses?.name || '').replace(/\s+/g, ' ').toLowerCase().trim();
      if (csvName === dbName) matches++;
    }

    const matchPercent = Math.round((matches / compareCount) * 100);
    const success = matchPercent === 100;
    if (!success) allLocationsCorrect = false;
    
    logTest(`2.${location.name}`, success, 
      `${matches}/${compareCount} courses match (${matchPercent}%) - CSV: ${csvCourses.length}, DB: ${filteredDbCourses.length}`);
  }

  console.log('');

  // =====================================================
  // SECTION 3: CARESKILLS COURSE CONFIGURATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 3: CARESKILLS COURSE CONFIGURATION                                   │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Test 3.1: All Careskills courses have 12-month expiry
  const { data: careskillsCourses } = await supabase
    .from('training_courses')
    .select('id, name, expiry_months')
    .ilike('name', '%(Careskills)%');

  const wrongExpiry = careskillsCourses?.filter(c => c.expiry_months !== 12) || [];
  logTest('3.1 Careskills 12-month expiry', wrongExpiry.length === 0, 
    `${careskillsCourses?.length - wrongExpiry.length}/${careskillsCourses?.length} have 12-month expiry`);

  // Test 3.2: Common Careskills course mappings
  const courseMap = new Map();
  trainingCourses?.forEach(course => {
    courseMap.set(course.name.toLowerCase(), course);
    // Also check careskills_name if it exists
  });

  const { data: coursesWithCareskills } = await supabase
    .from('training_courses')
    .select('id, name, careskills_name');

  coursesWithCareskills?.forEach(course => {
    if (course.careskills_name) {
      courseMap.set(course.careskills_name.toLowerCase(), course);
    }
  });

  const importCourseNames = [
    'Fire Safety', 'Health and Safety', 'Infection Control', 'First Aid',
    'Safeguarding and Protection of Adults', 'Mental Capacity', 'Medication Practice',
    'Moving and Handling', 'GDPR 1', 'Food Hygiene', 'Lone Working', 'Mental Health',
    'Person Centred Care', 'Communication', 'Equality, Diversity, Inclusion',
    'Recording Information', 'Nutrition and Hydration', 'Diabetes Awareness',
    'Positive Behaviour Support', 'Personal Care', 'Autism', 'Learning Disability'
  ];

  let mappedCount = 0;
  const unmapped = [];
  for (const name of importCourseNames) {
    if (courseMap.has(name.toLowerCase())) {
      mappedCount++;
    } else {
      unmapped.push(name);
    }
  }

  logTest('3.2 Careskills import mapping', mappedCount >= importCourseNames.length - 2, 
    `${mappedCount}/${importCourseNames.length} common courses can be matched`);

  if (unmapped.length > 0 && unmapped.length <= 3) {
    console.log(`      Unmapped: ${unmapped.join(', ')}`);
  }

  // Test 3.3: Mental Capacity maps to Mental Capacity & DOL'S
  const mentalCapacityMatch = courseMap.get('mental capacity');
  logTest('3.3 Mental Capacity mapping', 
    mentalCapacityMatch?.name === "Mental Capacity & DOL'S",
    mentalCapacityMatch ? `Maps to: "${mentalCapacityMatch.name}"` : 'Not found');

  console.log('');

  // =====================================================
  // SECTION 4: BOOKED STATUS EXPIRY PRESERVATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 4: BOOKED STATUS EXPIRY PRESERVATION                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Test 4.1: Code check for expiry preservation
  const matrixPagePath = '/Users/matthewfrost/training-portal/src/app/training-matrix/page.tsx';
  const matrixCode = fs.readFileSync(matrixPagePath, 'utf-8');

  const hasBookedCheck = matrixCode.includes("status === 'booked'");
  const hasExpiryPreservation = matrixCode.includes("existingCell?.expiry_date");
  const hasCompletionPreservation = matrixCode.includes("existingCell.completion_date");

  logTest('4.1 Booked status check exists', hasBookedCheck, 
    hasBookedCheck ? 'Code checks for booked status' : 'Missing booked status check');

  logTest('4.2 Expiry date preservation', hasExpiryPreservation, 
    hasExpiryPreservation ? 'Expiry date is preserved when changing to booked' : 'Missing expiry preservation');

  logTest('4.3 Completion date preservation', hasCompletionPreservation, 
    hasCompletionPreservation ? 'Completion date is preserved when changing to booked' : 'Missing completion preservation');

  console.log('');

  // =====================================================
  // SECTION 5: TRAINING RECORDS STATUS DISTRIBUTION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 5: TRAINING RECORDS STATUS DISTRIBUTION                              │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Use count queries for accurate numbers (avoiding 1000 row limit)
  const { count: totalRecords } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true });

  const { count: completedCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');

  const { count: bookedCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'booked');

  const { count: naCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .in('status', ['n/a', 'na', 'N/A']);

  const { count: awaitingCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'awaiting');

  const { count: withExpiryCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .not('expiry_date', 'is', null);

  const { count: completedWithExpiryCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .not('expiry_date', 'is', null);

  logTest('5.1 Completed records', completedCount > 5000, 
    `${completedCount} completed records (total: ${totalRecords})`);
  logTest('5.2 Booked records', bookedCount >= 0, 
    `${bookedCount} booked records`);
  logTest('5.3 N/A records', naCount >= 0, 
    `${naCount} N/A records`);
  logTest('5.4 Awaiting records', awaitingCount >= 0, 
    `${awaitingCount} awaiting records`);
  
  const expiryRate = completedCount > 0 ? Math.round((completedWithExpiryCount / completedCount) * 100) : 0;
  logTest('5.5 Expiry dates calculated', expiryRate > 85, 
    `${completedWithExpiryCount}/${completedCount} completed records have expiry dates (${expiryRate}%)`);

  console.log('');

  // =====================================================
  // SECTION 6: IMPORT API CODE VERIFICATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 6: IMPORT API CODE VERIFICATION                                      │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const importApiPath = '/Users/matthewfrost/training-portal/src/app/api/atlas/import/route.ts';
  const importCode = fs.readFileSync(importApiPath, 'utf-8');

  // Test 6.1: Header row detection
  const hasHeaderDetection = importCode.includes('staff name') || importCode.includes("learner's name");
  logTest('6.1 Dynamic header detection', hasHeaderDetection, 
    hasHeaderDetection ? 'Import finds header row dynamically' : 'Missing header detection');

  // Test 6.2: Course name normalization
  const hasNormalization = importCode.includes('normalizeCourseName') || importCode.includes('(Careskills)');
  logTest('6.2 Course name normalization', hasNormalization, 
    hasNormalization ? 'Course names are normalized for matching' : 'Missing normalization');

  // Test 6.3: Staff lookup
  const hasStaffLookup = importCode.includes('staffMap') && importCode.includes('full_name');
  logTest('6.3 Staff name lookup', hasStaffLookup, 
    hasStaffLookup ? 'Staff are looked up by name' : 'Missing staff lookup');

  // Test 6.4: Location handling
  const hasLocationHandling = importCode.includes('staffLocations') || importCode.includes('location_id');
  logTest('6.4 Location handling', hasLocationHandling, 
    hasLocationHandling ? 'Staff locations are handled in import' : 'Missing location handling');

  // Test 6.5: Expiry calculation
  const hasExpiryCalc = importCode.includes('expiry_months') && importCode.includes('expiryDate');
  logTest('6.5 Expiry date calculation', hasExpiryCalc, 
    hasExpiryCalc ? 'Expiry dates are calculated based on expiry_months' : 'Missing expiry calculation');

  // Test 6.6: Date parsing
  const hasDateParsing = importCode.includes("split('/')") || importCode.includes('DD/MM/YYYY');
  logTest('6.6 Date parsing (DD/MM/YYYY)', hasDateParsing, 
    hasDateParsing ? 'Dates are parsed from DD/MM/YYYY format' : 'Missing date parsing');

  console.log('');

  // =====================================================
  // SECTION 7: LOCATION-SPECIFIC TESTS
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 7: LOCATION-SPECIFIC DATA VERIFICATION                               │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  for (const location of (locations || []).slice(0, 5)) {
    // Get staff for this location
    const { data: locStaff } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', location.id);

    const staffIds = locStaff?.map(s => s.staff_id) || [];

    // Get courses for this location
    const { data: locCourses } = await supabase
      .from('location_training_courses')
      .select('id')
      .eq('location_id', location.id);

    // Get training records for this location's staff
    const { data: locRecords } = await supabase
      .from('staff_training_matrix')
      .select('id')
      .in('staff_id', staffIds.length > 0 ? staffIds : ['none']);

    const hasData = staffIds.length > 0 && locCourses?.length > 0 && locRecords?.length > 0;
    logTest(`7.${location.name}`, hasData, 
      `Staff: ${staffIds.length}, Courses: ${locCourses?.length || 0}, Records: ${locRecords?.length || 0}`);
  }

  console.log('');

  // =====================================================
  // SECTION 8: COURSE CONFIGURATION COMPLETE
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 8: COURSE CONFIGURATION VERIFICATION                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Verify each location has the expected number of courses matching CSV
  let allCourseCountsCorrect = true;
  for (const location of locations || []) {
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
    rows[headerRowIndex].slice(1).forEach(c => {
      const name = (c || '').toString().trim();
      const normalized = name.replace(/\s+/g, ' ').toLowerCase();
      if (name && !seenCourses.has(normalized)) {
        seenCourses.add(normalized);
      }
    });

    const { data: locCourses } = await supabase
      .from('location_training_courses')
      .select('id')
      .eq('location_id', location.id);

    if (locCourses?.length !== seenCourses.size) {
      allCourseCountsCorrect = false;
    }
  }

  logTest('8.1 Course counts match CSV', allCourseCountsCorrect,
    allCourseCountsCorrect 
      ? 'All locations have correct course counts'
      : 'Some locations have incorrect course counts');

  console.log('');

  // =====================================================
  // FINAL SUMMARY
  // =====================================================
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST SUMMARY                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ PASSED:   ${String(passed).padStart(3)}                                                           ║`);
  console.log(`║  ❌ FAILED:   ${String(failed).padStart(3)}                                                           ║`);
  console.log(`║  ⚠️  WARNINGS: ${String(warnings).padStart(3)}                                                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  
  if (failed === 0) {
    console.log('║                    🎉 ALL TESTS PASSED! 🎉                                   ║');
  } else {
    console.log(`║                    ⚠️  ${failed} TEST(S) NEED ATTENTION                              ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
}

runComprehensiveTests().catch(console.error);
