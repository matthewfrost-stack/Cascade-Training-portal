import fs from 'fs';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix\s+-.+\.csv$/);
  return match ? match[1].trim() : null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return true;
}

async function verifyLocationData(locationName) {
  console.log('\n' + '═'.repeat(120));
  console.log(`  VERIFY DATA INTEGRITY FOR: ${locationName}`);
  console.log('═'.repeat(120) + '\n');

  // Load reference data
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: staffProfiles } = await supabase.from('profiles').select('id, full_name').eq('is_deleted', false);
  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

  const locationMap = {};
  locations?.forEach(loc => {
    locationMap[loc.name.trim()] = loc.id;
  });

  const staffMap = {};
  staffProfiles?.forEach(staff => {
    staffMap[staff.full_name] = staff.id;
  });

  const courseMap = {};
  courses?.forEach(course => {
    courseMap[course.name] = { id: course.id, expiry_months: course.expiry_months };
  });

  const locationId = locationMap[locationName];
  if (!locationId) {
    console.log(`❌ Location not found: ${locationName}`);
    return;
  }

  // Find the CSV file for this location
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const csvFile = csvFiles.find(f => extractLocationFromFilename(f) === locationName);

  if (!csvFile) {
    console.log(`❌ CSV file not found for: ${locationName}`);
    return;
  }

  try {
    const filePath = path.join(CSV_FOLDER, csvFile);
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    
    const records = csvParse(csvContent, { relax: false });

    // Find "Staff Name" row (row 2, index 2)
    const staffNameRowIndex = 2;
    let courseNames = [];

    if (records[staffNameRowIndex]?.[0] === 'Staff Name') {
      courseNames = records[staffNameRowIndex].slice(1)
        .map(c => (c || '').trim())
        .filter(c => c && c.length > 0);
    } else {
      console.log(`❌ Unexpected structure in CSV`);
      return;
    }

    // Identify expected staff-course combinations from CSV
    const dataStartRow = 6;
    const expectedRecords = new Set();
    
    for (let i = dataStartRow; i < records.length; i++) {
      const staffName = (records[i][0] || '').trim();
      if (!staffName || !staffMap[staffName]) continue;

      const staffId = staffMap[staffName];
      
      for (let j = 0; j < courseNames.length; j++) {
        const courseName = courseNames[j].trim();
        const dateStr = (records[i][j + 1] || '').trim();

        if (!courseMap[courseName]) continue;

        const courseId = courseMap[courseName].id;
        const key = `${staffId}|${courseId}`;
        
        expectedRecords.add(key);
      }
    }

    // Get all actual records from database for this location (with pagination)
    let allDbRecords = [];
    let pageNum = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData } = await supabase
        .from('staff_training_matrix')
        .select('staff_id, course_id, completion_date, expiry_date, status')
        .eq('completed_at_location_id', locationId)
        .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

      if (!pageData || pageData.length === 0) {
        hasMore = false;
      } else {
        allDbRecords = allDbRecords.concat(pageData);
        pageNum++;
      }
    }

    const actualRecords = new Map();
    const statusCounts = { completed: 0, booked: 0, awaiting: 0, na: 0 };
    const dateIssues = [];

    allDbRecords.forEach(record => {
      const key = `${record.staff_id}|${record.course_id}`;
      actualRecords.set(key, record);
      
      if (record.status === 'completed') {
        statusCounts.completed++;
        if (!record.completion_date) {
          dateIssues.push(`${key}: completed status but NO completion_date`);
        }
        if (!record.expiry_date && record.completion_date) {
          // Some courses might not have expiry
        }
      } else if (record.status === 'booked') {
        statusCounts.booked++;
      } else if (record.status === 'awaiting') {
        statusCounts.awaiting++;
      } else if (record.status === 'na') {
        statusCounts.na++;
      }
    });

    // Find mismatches
    let expectedButMissing = 0;
    let extraRecordsInDb = 0;
    const missingInDb = [];
    const extraInDb = [];

    expectedRecords.forEach(key => {
      if (!actualRecords.has(key)) {
        expectedButMissing++;
        missingInDb.push(key);
      }
    });

    actualRecords.forEach((record, key) => {
      if (!expectedRecords.has(key)) {
        extraRecordsInDb++;
        extraInDb.push(key);
      }
    });

    console.log(`Total records in database: ${allDbRecords.length}`);
    console.log(`Expected from CSV: ${expectedRecords.size}`);
    console.log(`\nStatus Breakdown:`);
    console.log(`  ✓ Completed (with dates):    ${statusCounts.completed}`);
    console.log(`  📅 Booked (awaiting entry):  ${statusCounts.booked}`);
    console.log(`  ⏳ Awaiting (awaiting entry): ${statusCounts.awaiting}`);
    console.log(`  - N/A (no training):         ${statusCounts.na}`);

    if (dateIssues.length > 0) {
      console.log(`\n⚠️  Issues Found:`);
      dateIssues.slice(0, 5).forEach(issue => console.log(`  ${issue}`));
      if (dateIssues.length > 5) {
        console.log(`  ... and ${dateIssues.length - 5} more`);
      }
    }

    if (expectedButMissing > 0) {
      console.log(`\n⚠️  Expected from CSV but MISSING in database: ${expectedButMissing}`);
      if (missingInDb.length <= 5) {
        missingInDb.forEach(key => console.log(`  ${key}`));
      }
    }

    if (extraRecordsInDb > 0) {
      console.log(`\n⚠️  Extra records in database (not in CSV): ${extraRecordsInDb}`);
      if (extraInDb.length <= 5) {
        extraInDb.forEach(key => console.log(`  ${key}`));
      }
    }

    if (expectedButMissing === 0 && extraRecordsInDb === 0 && dateIssues.length === 0) {
      console.log(`\n✅ ALL DATA VERIFIED - Perfect alignment between CSV and database!`);
    }

    console.log('\n' + '═'.repeat(120));
    console.log(`VERIFICATION COMPLETE FOR ${locationName}`);
    console.log('═'.repeat(120) + '\n');

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

// Get location name from command line argument
const locationName = process.argv[2];

if (!locationName) {
  console.log('\n❌ Please specify a location name\n');
  console.log('Available locations:');
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  csvFiles.forEach(f => {
    const name = extractLocationFromFilename(f);
    if (name) console.log(`  - ${name}`);
  });
  console.log('\nUsage: node verify-location-data.js "Location Name"\n');
  process.exit(1);
}

verifyLocationData(locationName);
