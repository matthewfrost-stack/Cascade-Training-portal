const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeStatus(value) {
  if (!value || typeof value !== 'string') return null;
  
  const lower = value.toLowerCase().trim();
  
  if (lower === 'booked') return 'booked';
  if (lower.includes('awaiting')) return 'awaiting';
  if (lower === 'n/a') return 'na';
  if (lower === 'not yet due') return 'awaiting';
  if (lower === 'in progress') return 'awaiting';
  
  if (value.includes('/')) {
    return 'completed';
  }
  
  return null;
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    // Validate date
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      // Invalid date (e.g., Feb 31 or Sep 31)
      return null;
    }
    
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  
  return null;
}

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  if (match) {
    return match[1];
  }
  return null;
}

async function parseCSVWithHeaders(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content);

    let courseRow = -1;
    let courseNames = [];
    
    for (let i = 0; i < Math.min(10, records.length); i++) {
      if (records[i][0] === 'Staff Name') {
        courseNames = records[i].slice(1).filter(c => c && c.length > 0);
        courseRow = i;
        break;
      }
    }

    if (courseRow === -1) {
      return { staff: [], courses: [] };
    }

    const staffData = [];
    const skipPhrases = ['Notes', 'Mandatory', 'Date valid for', 'Management', 'Team Leaders', 'Lead Support', 'Staff Team', 'Staff on Probation', 'Inactive'];

    for (let i = courseRow + 1; i < records.length; i++) {
      const row = records[i];
      if (!row[0] || row[0].trim().length === 0) continue;

      const staffName = row[0].trim();
      
      if (skipPhrases.some(phrase => staffName.includes(phrase))) {
        continue;
      }

      const trainingData = {};
      for (let j = 0; j < courseNames.length && j + 1 < row.length; j++) {
        const courseName = courseNames[j].trim();
        const value = (row[j + 1] || '').trim();
        if (courseName) {
          trainingData[courseName] = value;
        }
      }

      staffData.push({
        name: staffName,
        training: trainingData
      });
    }

    return { staff: staffData, courses: courseNames };
  } catch (err) {
    throw err;
  }
}

async function importCSVData() {
  try {
    console.log('Starting CSV import with upsert...\n');
    
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name');
    
    const locationMap = new Map();
    locations?.forEach(loc => {
      locationMap.set(loc.name.toLowerCase(), loc.id);
      locationMap.set(loc.name.toLowerCase().trim(), loc.id);
    });

    const { data: staffProfiles } = await supabase
      .from('profiles')
      .select('id, full_name');
    
    const staffMap = new Map();
    staffProfiles?.forEach(staff => {
      staffMap.set(staff.full_name.toLowerCase(), staff.id);
    });

    const { data: courses } = await supabase
      .from('courses')
      .select('id, name');
    
    const courseMap = new Map();
    courses?.forEach(course => {
      courseMap.set(course.name.toLowerCase(), course.id);
    });

    const { data: staffLocations } = await supabase
      .from('staff_locations')
      .select('staff_id, location_id');
    
    const staffLocationMap = new Map();
    staffLocations?.forEach(sl => {
      staffLocationMap.set(sl.staff_id, sl.location_id);
    });

    const csvFolder = '/Users/matthewfrost/training-portal/csv-import';
    const csvFiles = fs.readdirSync(csvFolder).filter(f => f.endsWith('.csv')).sort();

    console.log(`Processing ${csvFiles.length} CSV files...\n`);

    let records = [];

    for (const csvFile of csvFiles) {
      const locationName = extractLocationFromFilename(csvFile);
      let locationId = locationMap.get(locationName?.toLowerCase());

      if (!locationId) {
        console.log(`⚠️  Location not found: ${locationName}`);
        continue;
      }

      try {
        const { staff, courses: csvCourses } = await parseCSVWithHeaders(path.join(csvFolder, csvFile));
        
        if (!csvCourses || csvCourses.length === 0) {
          continue;
        }

        console.log(`✓ ${csvFile}: ${staff.length} staff, ${csvCourses.length} courses`);

        for (const staffMember of staff) {
          const staffId = staffMap.get(staffMember.name.toLowerCase());
          
          if (!staffId) continue;

          const assignedLocation = staffLocationMap.get(staffId);
          if (assignedLocation !== locationId) continue;

          for (const [courseName, statusValue] of Object.entries(staffMember.training)) {
            if (!statusValue) continue;

            const status = normalizeStatus(statusValue);
            if (!status) continue;

            const courseId = courseMap.get(courseName.toLowerCase());
            if (!courseId) continue;

            records.push({
              staff_id: staffId,
              course_id: courseId,
              status,
              completion_date: parseDate(statusValue),
              expiry_date: null,
              completed_at_location_id: locationId
            });
          }
        }
      } catch (err) {
        console.log(`❌ Error: ${csvFile}: ${err.message}`);
      }
    }

    console.log(`\n\n=== SUMMARY ===`);
    console.log(`Total records to upsert: ${records.length}`);

    const statusCount = {};
    records.forEach(r => {
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
    });
    
    for (const [status, count] of Object.entries(statusCount)) {
      console.log(`  ${status}: ${count}`);
    }

    console.log('\n\nTo apply, run:');
    console.log('  node import-upsert.js --apply\n');

    if (process.argv.includes('--apply')) {
      console.log('Upserting records to database...\n');
      
      let successCount = 0;
      let errorCount = 0;
      const batchSize = 500;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        try {
          const { error } = await supabase
            .from('staff_training_matrix')
            .upsert(batch, { onConflict: 'staff_id,course_id' });

          if (error) {
            console.log(`❌ Batch error: ${error.message}`);
            errorCount += batch.length;
          } else {
            successCount += batch.length;
            console.log(`✅ Upserted ${successCount} records...`);
          }
        } catch (err) {
          console.log(`❌ Error: ${err.message}`);
          errorCount += batch.length;
        }
      }

      console.log(`\n✅ Complete!`);
      console.log(`  Success: ${successCount}`);
      console.log(`  Errors: ${errorCount}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

importCSVData();
