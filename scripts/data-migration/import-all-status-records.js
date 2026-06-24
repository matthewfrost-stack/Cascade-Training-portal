require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

// Proper CSV parsing that respects quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse status from cell value
function parseStatus(cellValue) {
  if (!cellValue) return null;
  const lower = cellValue.toLowerCase().trim();
  
  if (lower === 'n/a' || lower === 'na') {
    return 'na';
  } else if (lower.includes('booked')) {
    return 'booked';
  } else if (lower.includes('awaiting') || lower.includes('not yet due')) {
    return 'awaiting';
  }
  return null;
}

// Parse date from cell value (DD/MM/YYYY format)
function parseDate(cellValue) {
  if (!cellValue) return null;
  const match = cellValue.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

async function importAllStatusRecords() {
  console.log('=== Importing All Status Records from CSV Files ===\n');

  // Get all locations
  const { data: locations } = await supabase.from('locations').select('id, name');
  
  // Get all courses for name matching
  const { data: allCourses } = await supabase.from('training_courses').select('id, name');
  const courseNameToId = new Map();
  allCourses.forEach(c => {
    courseNameToId.set(c.name.toLowerCase().trim(), c.id);
    // Also map without (Careskills) suffix for matching
    if (c.name.includes('(Careskills)')) {
      const baseName = c.name.replace(' (Careskills)', '').toLowerCase().trim();
      if (!courseNameToId.has(baseName)) {
        courseNameToId.set(baseName, c.id);
      }
    }
  });

  // Get all profiles for name matching
  const { data: allProfiles } = await supabase.from('profiles').select('id, full_name').eq('is_deleted', false);
  const profileNameToId = new Map();
  allProfiles.forEach(p => {
    profileNameToId.set(p.full_name.toLowerCase().trim(), p.id);
  });

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const location of locations) {
    console.log(`\n=== Processing: ${location.name} ===`);

    const csvPath = path.join(CSV_DIR, `${location.name} Training Matrix - Staff Matrix.csv`);
    if (!fs.existsSync(csvPath)) {
      console.log('  No CSV file found');
      continue;
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    // Find header row
    let headerRow = -1;
    for (let i = 0; i < 60; i++) {
      if (lines[i] && lines[i].toLowerCase().includes('staff name')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      console.log('  Could not find header row');
      continue;
    }

    // Parse course headers
    const headers = parseCSVLine(lines[headerRow]);
    const courseIds = [];
    
    for (let i = 1; i < headers.length; i++) {
      const courseName = headers[i]?.toLowerCase().trim();
      if (!courseName) {
        courseIds.push(null);
        continue;
      }
      
      // Try exact match first
      let courseId = courseNameToId.get(courseName);
      
      // Try with (Careskills) suffix
      if (!courseId) {
        courseId = courseNameToId.get(courseName + ' (careskills)');
      }
      
      // Try partial match for multi-line course names
      if (!courseId) {
        for (const [name, id] of courseNameToId) {
          if (name.includes(courseName) || courseName.includes(name.split('\n')[0])) {
            courseId = id;
            break;
          }
        }
      }
      
      courseIds.push(courseId);
    }

    console.log(`  Found ${courseIds.filter(id => id).length} matching courses out of ${headers.length - 1} columns`);

    // Get location courses for linking
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('training_course_id')
      .eq('location_id', location.id);
    const linkedCourseIds = new Set(locationCourses?.map(lc => lc.training_course_id) || []);

    // Skip patterns for non-staff rows
    const skipPatterns = [
      /^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training|Modules|Notes|->|Mandatory|Date Valid|Core|Manager|Phase|Careskills|Level|Sickness|Maternity|Inactive|Bank Staff|New Staff)/i
    ];

    let locationCreated = 0;
    let locationUpdated = 0;
    let locationSkipped = 0;

    // Process each staff row
    for (let i = headerRow + 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const staffName = cols[0]?.trim();
      
      if (!staffName || staffName.length < 3) continue;
      
      // Check if this is a header/divider row
      let skip = false;
      for (const pattern of skipPatterns) {
        if (pattern.test(staffName)) { skip = true; break; }
      }
      if (skip) continue;
      
      // Staff names should have at least a first and last name
      if (!staffName.includes(' ')) continue;

      // Find staff ID
      const staffId = profileNameToId.get(staffName.toLowerCase().trim());
      if (!staffId) {
        continue; // Staff not in database
      }

      // Process each course cell
      for (let j = 1; j < cols.length; j++) {
        const courseId = courseIds[j - 1];
        if (!courseId) continue;

        const cellValue = cols[j]?.trim();
        if (!cellValue) continue;

        const status = parseStatus(cellValue);
        const date = parseDate(cellValue);

        // Only process if it's a status or date
        if (!status && !date) continue;

        // Check if record exists
        const { data: existing } = await supabase
          .from('staff_training_matrix')
          .select('id, completion_date, status')
          .eq('staff_id', staffId)
          .eq('course_id', courseId)
          .eq('completed_at_location_id', location.id)
          .single();

        if (existing) {
          // Record exists - update if needed
          const needsUpdate = 
            (status && existing.status !== status && !existing.completion_date) ||
            (date && !existing.completion_date);
          
          if (needsUpdate) {
            const updateData = {};
            if (date && !existing.completion_date) {
              updateData.completion_date = date;
            }
            if (status && !existing.completion_date) {
              updateData.status = status;
            }
            
            if (Object.keys(updateData).length > 0) {
              const { error } = await supabase
                .from('staff_training_matrix')
                .update(updateData)
                .eq('id', existing.id);
              
              if (!error) {
                locationUpdated++;
              }
            }
          } else {
            locationSkipped++;
          }
        } else {
          // Create new record
          const newRecord = {
            staff_id: staffId,
            course_id: courseId,
            completed_at_location_id: location.id,
            status: status || 'completed',
          };
          
          if (date) {
            newRecord.completion_date = date;
          }

          const { error } = await supabase
            .from('staff_training_matrix')
            .insert(newRecord);

          if (!error) {
            locationCreated++;
          }
        }
      }
    }

    console.log(`  Created: ${locationCreated}, Updated: ${locationUpdated}, Skipped: ${locationSkipped}`);
    totalCreated += locationCreated;
    totalUpdated += locationUpdated;
    totalSkipped += locationSkipped;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('TOTALS:');
  console.log(`  Created: ${totalCreated}`);
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Skipped: ${totalSkipped}`);
}

importAllStatusRecords().catch(console.error);
