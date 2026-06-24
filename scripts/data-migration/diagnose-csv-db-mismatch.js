const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  return match ? match[1].trim() : null;
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];
  
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeCourseName(name) {
  return (name || '').trim().toLowerCase();
}

async function diagnose() {
  console.log('\n' + '═'.repeat(120));
  console.log('  CSV vs DATABASE DIAGNOSTIC');
  console.log('═'.repeat(120) + '\n');

  // Get database data
  const { data: dbRecords, error: dbError } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (!dbRecords) {
    console.log('Error loading database records:', dbError);
    process.exit(1);
  }

  const { data: profiles } = await supabase.from('profiles').select('id, full_name');
  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');
  const { data: locations } = await supabase.from('locations').select('id, name');

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.id] = p.full_name;
  });

  const courseMap = {};
  courses.forEach(c => {
    courseMap[c.id] = { name: c.name, expiry_months: c.expiry_months };
  });

  const locationMap = {};
  locations.forEach(l => {
    locationMap[l.name] = l.id;
  });

  console.log(`Database loaded:`);
  console.log(`  - ${Object.keys(profileMap).length} profiles`);
  console.log(`  - ${Object.keys(courseMap).length} courses`);
  console.log(`  - ${dbRecords.length} training records (sample of 1000)\n`);

  // Parse CSV files
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  let csvCourseSet = new Set();
  let csvDataByLocation = {};

  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;

    const csvPath = path.join(CSV_FOLDER, csvFile);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(content);

    // Find staff name row
    let staffNameRow = -1;
    let courseNames = [];

    for (let i = 0; i < Math.min(15, records.length); i++) {
      if (records[i][0] === 'Staff Name') {
        courseNames = records[i].slice(1).filter(c => c && c.trim().length > 0);
        staffNameRow = i;
        break;
      }
    }

    if (staffNameRow === -1) {
      console.log(`⚠️  No "Staff Name" row found in ${location}`);
      continue;
    }

    courseNames.forEach(c => csvCourseSet.add(normalizeCourseName(c)));
    csvDataByLocation[location] = { courseCount: courseNames.length, courseNames };
  }

  console.log(`CSV Analysis:`);
  console.log(`  - ${csvFiles.length} CSV files found`);
  console.log(`  - ${csvCourseSet.size} unique course names across all CSVs\n`);

  // Find courses in DB but not in CSV
  const dbCourseSet = new Set(Object.values(courseMap).map(c => normalizeCourseName(c.name)));
  const coursesInDbNotInCsv = Array.from(dbCourseSet).filter(c => !csvCourseSet.has(c));
  const coursesInCsvNotInDb = Array.from(csvCourseSet).filter(c => !dbCourseSet.has(c));

  console.log(`Course Discrepancies:\n`);
  if (coursesInDbNotInCsv.length > 0) {
    console.log(`  IN DATABASE BUT NOT IN CSV (${coursesInDbNotInCsv.length}):`);
    coursesInDbNotInCsv.slice(0, 10).forEach(c => console.log(`    - ${c}`));
    if (coursesInDbNotInCsv.length > 10) {
      console.log(`    ... and ${coursesInDbNotInCsv.length - 10} more`);
    }
  }

  if (coursesInCsvNotInDb.length > 0) {
    console.log(`\n  IN CSV BUT NOT IN DATABASE (${coursesInCsvNotInDb.length}):`);
    coursesInCsvNotInDb.slice(0, 10).forEach(c => console.log(`    - ${c}`));
    if (coursesInCsvNotInDb.length > 10) {
      console.log(`    ... and ${coursesInCsvNotInDb.length - 10} more`);
    }
  }

  // Check date formats
  console.log(`\n\nDate Format Check:\n`);
  let dateIssues = 0;
  let completedWithDates = 0;
  let completedWithoutDates = 0;

  for (const record of dbRecords.slice(0, 100)) {
    if (record.status === 'completed' && record.completion_date) {
      completedWithDates++;
      if (!record.expiry_date) {
        console.log(`  ⚠️  No expiry_date for completed record (ID: ${record.id})`);
        dateIssues++;
      }
    } else if (record.status === 'completed' && !record.completion_date) {
      completedWithoutDates++;
      console.log(`  ⚠️  Completed but no completion_date (ID: ${record.id})`);
      dateIssues++;
    }
  }

  console.log(`  Completed records with dates: ${completedWithDates}`);
  console.log(`  Completed records without dates: ${completedWithoutDates}`);
  console.log(`  Date issues found: ${dateIssues}\n`);

  // Show sample of each location's courses
  console.log(`\nCourses by Location:\n`);
  for (const [location, data] of Object.entries(csvDataByLocation).slice(0, 3)) {
    console.log(`  ${location}:`);
    console.log(`    Course count: ${data.courseCount}`);
    console.log(`    Sample courses:`);
    data.courseNames.slice(0, 3).forEach(c => console.log(`      - ${c}`));
  }

  console.log(`\n${'═'.repeat(120)}\n`);
}

diagnose().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
