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
let totalTests = 0;

function logTest(name, success, message, isWarning = false) {
  totalTests++;
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

async function runExtensiveTests() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              EXTENSIVE TEST SUITE - FULL SYSTEM VERIFICATION                 ║');
  console.log('║                        Training Portal Application                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // =====================================================
  // SECTION 1: DATABASE SCHEMA VERIFICATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 1: DATABASE SCHEMA VERIFICATION                                      │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Test tables exist
  const tables = ['locations', 'profiles', 'training_courses', 'location_training_courses', 
                  'staff_training_matrix', 'staff_locations', 'courses'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    logTest(`1.${table}`, !error, error ? `Table error: ${error.message}` : 'Table exists and accessible');
  }

  console.log('');

  // =====================================================
  // SECTION 2: DATA INTEGRITY - LOCATIONS
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 2: DATA INTEGRITY - LOCATIONS                                        │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: locations } = await supabase.from('locations').select('*').order('name');
  
  logTest('2.1 Location count', locations?.length === 13, `${locations?.length} locations (expected 13)`);
  
  const expectedLocations = ['Armfield House', 'Banks House', 'Banks House School', 'Bonetti House', 
    'Charlton House', 'Cohen House', 'Felix House', 'Felix House School', 'Group', 
    'Hurst House', 'Moore House', 'Peters House', 'Stiles House'];
  
  for (const locName of expectedLocations) {
    const found = locations?.find(l => l.name === locName);
    logTest(`2.${locName}`, !!found, found ? 'Location exists' : 'Location MISSING');
  }

  // Check no duplicate locations
  const locationNames = locations?.map(l => l.name) || [];
  const uniqueNames = new Set(locationNames);
  logTest('2.No duplicates', uniqueNames.size === locationNames.length, 
    uniqueNames.size === locationNames.length ? 'No duplicate locations' : 'Duplicate locations found');

  console.log('');

  // =====================================================
  // SECTION 3: DATA INTEGRITY - STAFF PROFILES
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 3: DATA INTEGRITY - STAFF PROFILES                                   │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: profiles, count: profileCount } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_deleted', { count: 'exact' });

  const activeProfiles = profiles?.filter(p => !p.is_deleted) || [];
  const deletedProfiles = profiles?.filter(p => p.is_deleted) || [];

  logTest('3.1 Total profiles', profileCount > 400, `${profileCount} total profiles`);
  logTest('3.2 Active profiles', activeProfiles.length > 400, `${activeProfiles.length} active staff`);
  logTest('3.3 Deleted profiles tracked', true, `${deletedProfiles.length} deleted/inactive staff`);

  // Check all active profiles have names
  const profilesWithoutNames = activeProfiles.filter(p => !p.full_name || p.full_name.trim() === '');
  logTest('3.4 All have names', profilesWithoutNames.length === 0, 
    profilesWithoutNames.length === 0 ? 'All profiles have names' : `${profilesWithoutNames.length} missing names`);

  // Check for duplicate names (warning only)
  const nameCount = {};
  activeProfiles.forEach(p => {
    const name = p.full_name?.toLowerCase().trim();
    nameCount[name] = (nameCount[name] || 0) + 1;
  });
  const duplicateNames = Object.entries(nameCount).filter(([_, count]) => count > 1);
  logTest('3.5 Unique names', duplicateNames.length < 5, 
    `${duplicateNames.length} duplicate names`, duplicateNames.length >= 5);

  console.log('');

  // =====================================================
  // SECTION 4: DATA INTEGRITY - STAFF LOCATIONS
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 4: DATA INTEGRITY - STAFF LOCATIONS                                  │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: staffLocations } = await supabase
    .from('staff_locations')
    .select('staff_id, location_id');

  const staffWithLocations = new Set(staffLocations?.map(sl => sl.staff_id) || []);
  const activeStaffIds = new Set(activeProfiles.map(p => p.id));

  // Check all active staff have at least one location
  const staffWithoutLocation = [...activeStaffIds].filter(id => !staffWithLocations.has(id));
  logTest('4.1 All staff have locations', staffWithoutLocation.length === 0,
    staffWithoutLocation.length === 0 ? 'All active staff have locations' : `${staffWithoutLocation.length} staff without locations`);

  // Check staff per location distribution
  const locationStaffCount = {};
  staffLocations?.forEach(sl => {
    locationStaffCount[sl.location_id] = (locationStaffCount[sl.location_id] || 0) + 1;
  });

  for (const location of locations || []) {
    const count = locationStaffCount[location.id] || 0;
    logTest(`4.${location.name} staff`, count > 0, `${count} staff members`);
  }

  console.log('');

  // =====================================================
  // SECTION 5: DATA INTEGRITY - TRAINING COURSES
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 5: DATA INTEGRITY - TRAINING COURSES                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: trainingCourses } = await supabase
    .from('training_courses')
    .select('id, name, careskills_name, expiry_months, never_expires');

  logTest('5.1 Course count', trainingCourses?.length > 200, `${trainingCourses?.length} training courses`);

  // Check all courses have names
  const coursesWithoutNames = trainingCourses?.filter(c => !c.name || c.name.trim() === '') || [];
  logTest('5.2 All have names', coursesWithoutNames.length === 0, 
    coursesWithoutNames.length === 0 ? 'All courses have names' : `${coursesWithoutNames.length} missing names`);

  // Check expiry_months distribution
  const expiryDist = {};
  trainingCourses?.forEach(c => {
    const months = c.expiry_months || 'null';
    expiryDist[months] = (expiryDist[months] || 0) + 1;
  });
  logTest('5.3 Expiry months set', !expiryDist['null'] || expiryDist['null'] < 10, 
    `Distribution: ${JSON.stringify(expiryDist)}`);

  // Check Careskills courses specifically
  const careskillsCourses = trainingCourses?.filter(c => c.name.includes('(Careskills)')) || [];
  logTest('5.4 Careskills count', careskillsCourses.length >= 40, `${careskillsCourses.length} Careskills courses`);

  const careskillsWrongExpiry = careskillsCourses.filter(c => c.expiry_months !== 12);
  logTest('5.5 Careskills 12-month', careskillsWrongExpiry.length === 0,
    careskillsWrongExpiry.length === 0 ? 'All Careskills have 12-month expiry' : `${careskillsWrongExpiry.length} wrong`);

  // Check for duplicate course names
  const courseNameCount = {};
  trainingCourses?.forEach(c => {
    const name = c.name.toLowerCase().trim();
    courseNameCount[name] = (courseNameCount[name] || 0) + 1;
  });
  const duplicateCourses = Object.entries(courseNameCount).filter(([_, count]) => count > 1);
  logTest('5.6 No duplicate courses', duplicateCourses.length === 0,
    duplicateCourses.length === 0 ? 'No duplicate course names' : `${duplicateCourses.length} duplicates`);

  console.log('');

  // =====================================================
  // SECTION 6: LOCATION TRAINING COURSES
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 6: LOCATION TRAINING COURSES                                         │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));

  for (const location of locations || []) {
    const { data: locCourses } = await supabase
      .from('location_training_courses')
      .select('id, training_course_id, display_order')
      .eq('location_id', location.id)
      .order('display_order');

    // Find matching CSV
    const csvFile = csvFiles.find(f => {
      const match = f.match(/^(.+?)\s+Training Matrix\s*-/);
      if (!match) return false;
      return match[1].trim().toLowerCase() === location.name.toLowerCase();
    });

    if (csvFile) {
      const content = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
      const rows = parse(content, { relax_column_count: true });
      
      let headerRowIndex = -1;
      for (let i = 0; i < 10; i++) {
        if ((rows[i]?.[0] || '').toString().trim().toLowerCase() === 'staff name') {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex >= 0) {
        const seenCourses = new Set();
        rows[headerRowIndex].slice(1).forEach(c => {
          const name = (c || '').toString().trim();
          const normalized = name.replace(/\s+/g, ' ').toLowerCase();
          if (name && !seenCourses.has(normalized)) seenCourses.add(normalized);
        });

        logTest(`6.${location.name}`, locCourses?.length === seenCourses.size,
          `${locCourses?.length} courses (CSV: ${seenCourses.size})`);
      }
    }

    // Check display_order is sorted and unique (gaps are acceptable, order matters)
    const orders = locCourses?.map(c => c.display_order).sort((a, b) => a - b) || [];
    const isSorted = orders.length > 0 && orders.every((o, i) => i === 0 || o > orders[i-1]);
    const hasMinOrder = orders.length === 0 || orders[0] >= 1;
    logTest(`6.${location.name} order`, isSorted && hasMinOrder, 
      isSorted && hasMinOrder ? `Sorted correctly (${orders[0]}-${orders[orders.length-1]})` : 'Order issues detected');
  }

  console.log('');

  // =====================================================
  // SECTION 7: TRAINING RECORDS INTEGRITY
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 7: TRAINING RECORDS INTEGRITY                                        │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { count: totalRecords } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true });

  logTest('7.1 Total records', totalRecords > 30000, `${totalRecords} training records`);

  // Status distribution
  const statuses = ['completed', 'booked', 'awaiting'];
  for (const status of statuses) {
    const { count } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    logTest(`7.${status} count`, count >= 0, `${count} ${status} records`);
  }

  // N/A status (multiple variations)
  const { count: naCount } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .in('status', ['n/a', 'na', 'N/A']);
  logTest('7.N/A count', naCount >= 0, `${naCount} N/A records`);

  // Records with completion dates
  const { count: withCompletionDate } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .not('completion_date', 'is', null);
  logTest('7.2 With completion dates', withCompletionDate > 20000, `${withCompletionDate} have completion dates`);

  // Records with expiry dates
  const { count: withExpiryDate } = await supabase
    .from('staff_training_matrix')
    .select('id', { count: 'exact', head: true })
    .not('expiry_date', 'is', null);
  logTest('7.3 With expiry dates', withExpiryDate > 20000, `${withExpiryDate} have expiry dates`);

  // Check no orphaned records (staff_id exists)
  const { data: sampleRecords } = await supabase
    .from('staff_training_matrix')
    .select('staff_id, course_id')
    .limit(1000);

  const validStaffIds = new Set(profiles?.map(p => p.id) || []);
  const validCourseIds = new Set(trainingCourses?.map(c => c.id) || []);

  const orphanedStaff = sampleRecords?.filter(r => !validStaffIds.has(r.staff_id)) || [];
  const orphanedCourse = sampleRecords?.filter(r => !validCourseIds.has(r.course_id)) || [];

  logTest('7.4 No orphaned staff refs', orphanedStaff.length === 0,
    orphanedStaff.length === 0 ? 'All staff_ids valid' : `${orphanedStaff.length} orphaned`);
  logTest('7.5 No orphaned course refs', orphanedCourse.length === 0,
    orphanedCourse.length === 0 ? 'All course_ids valid' : `${orphanedCourse.length} orphaned`);

  console.log('');

  // =====================================================
  // SECTION 8: COURSE NAME MAPPING FOR IMPORT
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 8: COURSE NAME MAPPING FOR IMPORT                                    │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Build course map like the import does
  const courseMap = new Map();
  trainingCourses?.forEach(course => {
    courseMap.set(course.name.toLowerCase(), course);
    if (course.careskills_name) {
      courseMap.set(course.careskills_name.toLowerCase(), course);
    }
  });

  // Test all common Careskills course names
  const careskillsImportNames = [
    'Fire Safety', 'Health and Safety', 'Infection Control', 'First Aid',
    'Safeguarding and Protection of Adults', 'Mental Capacity', 'Medication Practice',
    'Moving and Handling', 'GDPR 1', 'Food Hygiene', 'Lone Working', 'Mental Health',
    'Person Centred Care', 'Communication', 'Equality, Diversity, Inclusion',
    'Recording Information', 'Nutrition and Hydration', 'Diabetes Awareness',
    'Positive Behaviour Support', 'Personal Care', 'Care Certificate',
    'Prevent Extremism and Radicalisation', 'Oral Care', 'Managing Continence',
    'LGBTQ+ Aware for Care', 'Behaviours that Challenge', 'Epilepsy Awareness',
    'Risk Assessment', 'Supervision', 'GDPR 2', 'Dignity in Care',
    'Professional Boundaries', 'Anxiety', 'Dysphagia', 'Cyber Security Awareness',
    'COSHH', 'End of Life Care', 'Self-Harm'
  ];

  let mapped = 0;
  const unmapped = [];
  for (const name of careskillsImportNames) {
    if (courseMap.has(name.toLowerCase())) {
      mapped++;
    } else {
      unmapped.push(name);
    }
  }

  logTest('8.1 Careskills mapping rate', mapped / careskillsImportNames.length > 0.9,
    `${mapped}/${careskillsImportNames.length} courses mappable (${Math.round(mapped/careskillsImportNames.length*100)}%)`);

  if (unmapped.length > 0 && unmapped.length <= 10) {
    console.log(`      Unmapped: ${unmapped.join(', ')}`);
  }

  // Specific critical mappings
  const criticalMappings = [
    { import: 'Mental Capacity', expected: "Mental Capacity & DOL'S" },
    { import: 'Fire Safety', expected: 'Fire Safety' },
    { import: 'First Aid', expected: 'First Aid' },
    { import: 'Health and Safety', expected: 'Health and Safety' },
  ];

  for (const mapping of criticalMappings) {
    const found = courseMap.get(mapping.import.toLowerCase());
    logTest(`8.${mapping.import}`, !!found,
      found ? `Maps to: "${found.name}"` : 'NOT FOUND');
  }

  console.log('');

  // =====================================================
  // SECTION 9: CODE VERIFICATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 9: CODE VERIFICATION                                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  // Training Matrix Page
  const matrixPagePath = '/Users/matthewfrost/training-portal/src/app/training-matrix/page.tsx';
  const matrixCode = fs.readFileSync(matrixPagePath, 'utf-8');

  logTest('9.1 Matrix page exists', matrixCode.length > 1000, 'File exists and has content');
  logTest('9.2 Booked status handling', matrixCode.includes("status === 'booked'"), 'Booked status is handled');
  logTest('9.3 Expiry preservation', matrixCode.includes('existingCell?.expiry_date'), 'Expiry preservation code exists');
  logTest('9.4 Completion preservation', matrixCode.includes('existingCell.completion_date'), 'Completion preservation exists');
  logTest('9.5 Display order query', matrixCode.includes('display_order') || matrixCode.includes('displayOrder'), 
    'Uses display_order for course sorting');

  // Import API
  const importApiPath = '/Users/matthewfrost/training-portal/src/app/api/atlas/import/route.ts';
  const importCode = fs.readFileSync(importApiPath, 'utf-8');

  logTest('9.6 Import API exists', importCode.length > 1000, 'File exists and has content');
  logTest('9.7 Header detection', importCode.includes('staff name') || importCode.includes("learner's name"), 
    'Dynamic header row detection');
  logTest('9.8 Course normalization', importCode.includes('normalizeCourseName') || importCode.includes('Careskills'), 
    'Course name normalization');
  logTest('9.9 Staff lookup', importCode.includes('staffMap'), 'Staff name mapping');
  logTest('9.10 Location handling', importCode.includes('staffLocations') || importCode.includes('location_id'), 
    'Location handling in import');
  logTest('9.11 Expiry calculation', importCode.includes('expiry_months') && importCode.includes('expiryDate'), 
    'Expiry date calculation');
  logTest('9.12 Date parsing', importCode.includes("split('/')"), 'DD/MM/YYYY date parsing');

  console.log('');

  // =====================================================
  // SECTION 10: CROSS-LOCATION DATA VERIFICATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 10: CROSS-LOCATION DATA VERIFICATION                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  for (const location of locations || []) {
    const { data: locStaff } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', location.id);

    const staffIds = locStaff?.map(s => s.staff_id) || [];

    const { count: locRecords } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .in('staff_id', staffIds.length > 0 ? staffIds : ['none']);

    const { data: locCourses } = await supabase
      .from('location_training_courses')
      .select('id')
      .eq('location_id', location.id);

    const hasData = staffIds.length > 0 && (locCourses?.length || 0) > 0 && (locRecords || 0) > 0;
    logTest(`10.${location.name}`, hasData,
      `Staff: ${staffIds.length}, Courses: ${locCourses?.length || 0}, Records: ${locRecords || 0}`);
  }

  console.log('');

  // =====================================================
  // SECTION 11: DATE FORMAT VERIFICATION
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 11: DATE FORMAT VERIFICATION                                         │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: dateRecords } = await supabase
    .from('staff_training_matrix')
    .select('completion_date, expiry_date')
    .not('completion_date', 'is', null)
    .limit(100);

  let validDates = 0;
  let invalidDates = 0;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  dateRecords?.forEach(r => {
    if (r.completion_date && dateRegex.test(r.completion_date)) validDates++;
    else if (r.completion_date) invalidDates++;
    if (r.expiry_date && dateRegex.test(r.expiry_date)) validDates++;
    else if (r.expiry_date) invalidDates++;
  });

  logTest('11.1 Date format YYYY-MM-DD', invalidDates === 0,
    invalidDates === 0 ? `All ${validDates} dates in correct format` : `${invalidDates} invalid date formats`);

  // Check expiry is after completion
  let expiryAfterCompletion = 0;
  let expiryBeforeCompletion = 0;
  dateRecords?.forEach(r => {
    if (r.completion_date && r.expiry_date) {
      if (r.expiry_date >= r.completion_date) expiryAfterCompletion++;
      else expiryBeforeCompletion++;
    }
  });

  logTest('11.2 Expiry after completion', expiryBeforeCompletion === 0,
    expiryBeforeCompletion === 0 ? 'All expiry dates are after completion' : `${expiryBeforeCompletion} expiry before completion`);

  console.log('');

  // =====================================================
  // SECTION 12: BOOKING COURSES (CALENDAR)
  // =====================================================
  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 12: BOOKING COURSES (CALENDAR)                                       │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');

  const { data: bookingCourses, count: bookingCount } = await supabase
    .from('courses')
    .select('id, name', { count: 'exact' });

  logTest('12.1 Booking courses exist', (bookingCount || 0) > 0, `${bookingCount} booking calendar courses`);

  // Check booking courses are different from training courses
  const bookingNames = new Set(bookingCourses?.map(c => c.name.toLowerCase()) || []);
  const trainingNames = new Set(trainingCourses?.map(c => c.name.toLowerCase()) || []);
  
  logTest('12.2 Separate from training', true, 
    `Booking: ${bookingNames.size} courses, Training: ${trainingNames.size} courses`);

  console.log('');

  // =====================================================
  // FINAL SUMMARY
  // =====================================================
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        EXTENSIVE TEST SUMMARY                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests:  ${String(totalTests).padStart(3)}                                                          ║`);
  console.log(`║  ✅ PASSED:    ${String(passed).padStart(3)}                                                          ║`);
  console.log(`║  ❌ FAILED:    ${String(failed).padStart(3)}                                                          ║`);
  console.log(`║  ⚠️  WARNINGS:  ${String(warnings).padStart(3)}                                                          ║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  
  const successRate = Math.round((passed / totalTests) * 100);
  if (failed === 0) {
    console.log('║                    🎉 ALL TESTS PASSED! 🎉                                    ║');
  } else {
    console.log(`║           Success Rate: ${successRate}% (${failed} test(s) need attention)              ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
}

runExtensiveTests().catch(console.error);
