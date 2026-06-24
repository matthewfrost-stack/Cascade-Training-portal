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

function determineStatus(cellValue) {
  if (!cellValue || cellValue.trim() === '') return 'na';
  
  const trimmed = cellValue.trim().toLowerCase();
  
  if (trimmed === 'booked') return 'booked';
  if (trimmed.includes('awaiting')) return 'awaiting';
  if (trimmed === 'n/a') return 'na';
  if (trimmed === 'completed') return 'completed';
  
  // If it's a date, it's completed
  if (parseDate(cellValue)) return 'completed';
  
  return 'na';
}

function calculateExpiryDate(completionDateStr, months) {
  if (!completionDateStr || !months) return null;
  const date = new Date(completionDateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

async function syncStatusesByLocation(locationName) {
  console.log('\n' + '═'.repeat(120));
  console.log(`  SYNC ALL STATUSES (COMPLETED, BOOKED, AWAITING, N/A) FOR: ${locationName}`);
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

    // Data starts at row 6 (index 6)
    const dataStartRow = 6;
    
    let completedCount = 0;
    let bookedCount = 0;
    let awaitingCount = 0;
    let naCount = 0;
    let errorCount = 0;

    console.log(`Processing staff records for ${locationName}...\n`);

    for (let i = dataStartRow; i < records.length; i++) {
      const staffName = (records[i][0] || '').trim();
      if (!staffName || !staffMap[staffName]) continue;

      const staffId = staffMap[staffName];

      for (let j = 0; j < courseNames.length; j++) {
        const courseName = courseNames[j].trim();
        const cellValue = (records[i][j + 1] || '').trim();

        if (!courseMap[courseName]) continue;

        const courseId = courseMap[courseName].id;
        const status = determineStatus(cellValue);
        
        let completionDate = null;
        let expiryDate = null;

        // Only parse as date if it looks like a date and status is completed
        if (status === 'completed' && cellValue && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cellValue)) {
          const parts = cellValue.split('/');
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            const date = new Date(year, month - 1, day);
            completionDate = date.toISOString().split('T')[0];
            
            const expiryMonths = courseMap[courseName].expiry_months;
            if (expiryMonths) {
              expiryDate = calculateExpiryDate(completionDate, expiryMonths);
            }
          }
        }

        const { error } = await supabase
          .from('staff_training_matrix')
          .update({
            completion_date: completionDate,
            expiry_date: expiryDate,
            status: status
          })
          .eq('staff_id', staffId)
          .eq('course_id', courseId)
          .eq('completed_at_location_id', locationId);

        if (!error) {
          if (status === 'completed') completedCount++;
          else if (status === 'booked') bookedCount++;
          else if (status === 'awaiting') awaitingCount++;
          else if (status === 'na') naCount++;
        } else {
          errorCount++;
        }
      }
    }

    // Get summary stats
    const { count: totalRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', locationId);

    const { count: completedRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', locationId)
      .eq('status', 'completed');

    const { count: bookedRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', locationId)
      .eq('status', 'booked');

    const { count: awaitingRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', locationId)
      .eq('status', 'awaiting');

    const { count: naRecords } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', locationId)
      .eq('status', 'na');

    console.log('\n' + '═'.repeat(120));
    console.log(`✅ STATUS SYNC COMPLETE FOR ${locationName}`);
    console.log('═'.repeat(120));
    console.log(`
  Records Processed:
    Completed:    ${completedCount}
    Booked:       ${bookedCount}
    Awaiting:     ${awaitingCount}
    N/A:          ${naCount}
    Errors:       ${errorCount}

  Total Database Records: ${totalRecords}
    ✓ Completed:  ${completedRecords}
    📅 Booked:    ${bookedRecords}
    ⏳ Awaiting:   ${awaitingRecords}
    - N/A:        ${naRecords}
`);

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
  console.log('\nUsage: node sync-all-statuses.js "Location Name"\n');
  process.exit(1);
}

syncStatusesByLocation(locationName);
