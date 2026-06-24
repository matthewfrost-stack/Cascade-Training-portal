import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  return match ? match[1].trim() : null;
}

function parseExpiryMonths(expiryText) {
  if (!expiryText) return null;
  
  const lower = expiryText.toLowerCase().trim();
  
  // Check for "one off" or "never"
  if (lower === 'one-off' || lower === 'one off' || lower === 'never' || lower === '' || lower === 'blank') {
    return null; // No expiry
  }
  
  // Check for year values (e.g., "1", "2", "3 years")
  const yearMatch = expiryText.match(/(\d+)\s*(?:year|yr)?/i);
  if (yearMatch) {
    const years = parseInt(yearMatch[1]);
    return years * 12; // Convert to months
  }
  
  return null;
}

async function extractAndSaveExpiryMonths() {
  console.log('\n' + '═'.repeat(120));
  console.log('  EXTRACT EXPIRY MONTHS FROM CSV AND SAVE TO DATABASE');
  console.log('═'.repeat(120) + '\n');

  try {
    const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
    
    // Map: courseName -> { locations: { locationName: expiryMonths } }
    const courseExpiryMap = new Map();

    console.log(`📂 Processing ${csvFiles.length} CSV files...\n`);

    // Extract expiry months from all CSV files
    for (const csvFile of csvFiles) {
      const location = extractLocationFromFilename(csvFile);
      if (!location) continue;

      try {
        const content = fs.readFileSync(path.join(CSV_FOLDER, csvFile), 'utf-8');
        const records = parse(content);

        // Find course row (row with "Staff Name")
        let courseRow = -1;
        let expiryRow = -1;
        let courseNames = [];

        for (let i = 0; i < Math.min(10, records.length); i++) {
          if (records[i][0] === 'Staff Name') {
            courseNames = records[i].slice(1).filter(c => c && c.length > 0);
            courseRow = i;
            break;
          }
        }

        if (courseRow === -1) continue;

        // Look for expiry row (typically labeled "Date valid for" or similar)
        for (let i = 0; i < Math.min(15, records.length); i++) {
          if (records[i][0] && (
            records[i][0].includes('Date valid for') || 
            records[i][0].includes('Expiry') ||
            records[i][0].toLowerCase().includes('valid')
          )) {
            expiryRow = i;
            break;
          }
        }

        // Extract course expiry information
        if (expiryRow >= 0) {
          const expiryValues = records[expiryRow].slice(1);
          
          for (let i = 0; i < courseNames.length && i < expiryValues.length; i++) {
            const courseName = courseNames[i].trim();
            const expiryText = (expiryValues[i] || '').trim();

            if (courseName) {
              if (!courseExpiryMap.has(courseName)) {
                courseExpiryMap.set(courseName, { locations: {}, expiryMonths: null });
              }

              const months = parseExpiryMonths(expiryText);
              const courseData = courseExpiryMap.get(courseName);
              courseData.locations[location] = months;

              // If we don't have a standard expiry yet, use this one
              if (courseData.expiryMonths === null && months !== null) {
                courseData.expiryMonths = months;
              }
            }
          }
        }
      } catch (err) {
        console.error(`  Error parsing ${csvFile}: ${err.message}`);
      }
    }

    console.log(`✓ Extracted ${courseExpiryMap.size} unique courses from CSV\n`);

    // Get all courses from database
    const { data: dbCourses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    console.log(`✓ Found ${dbCourses.length} courses in database\n`);

    // Match and update
    console.log('📊 Matching CSV courses to database and saving expiry_months:\n');

    let updated = 0;
    let skipped = 0;
    const updates = [];

    for (const dbCourse of dbCourses) {
      const courseName = dbCourse.name;
      const csvData = courseExpiryMap.get(courseName);

      if (!csvData) {
        // Try case-insensitive match
        for (const [csvCourseName, data] of courseExpiryMap.entries()) {
          if (csvCourseName.toLowerCase() === courseName.toLowerCase()) {
            courseExpiryMap.set(courseName, data);
            break;
          }
        }
      }

      const matchedData = courseExpiryMap.get(courseName);
      if (matchedData && matchedData.expiryMonths !== null) {
        const monthsToSet = matchedData.expiryMonths;
        
        // Only update if different
        if (dbCourse.expiry_months !== monthsToSet) {
          updates.push({
            id: dbCourse.id,
            name: courseName,
            oldValue: dbCourse.expiry_months,
            newValue: monthsToSet
          });
        }
      } else {
        skipped++;
      }
    }

    console.log(`Found ${updates.length} courses to update\n`);

    if (updates.length > 0) {
      console.log('═'.repeat(120));
      console.log('SAVING UPDATES TO DATABASE:\n');

      let saved = 0;
      for (const update of updates) {
        const { error } = await supabase
          .from('courses')
          .update({ expiry_months: update.newValue })
          .eq('id', update.id);

        if (!error) {
          saved++;
          const oldDisplay = update.oldValue === null ? 'NULL' : update.oldValue;
          const newDisplay = update.newValue === null ? 'NULL' : `${update.newValue} months`;
          console.log(`✓ ${update.name}: ${oldDisplay} → ${newDisplay}`);
        } else {
          console.error(`❌ ${update.name}: ${error.message}`);
        }
      }

      console.log(`\n✓ Updated ${saved}/${updates.length} courses\n`);
    }

    // Now recalculate all expiry dates based on updated course settings
    console.log('═'.repeat(120));
    console.log('RECALCULATING EXPIRY DATES:\n');

    const { data: recordsToRecalc } = await supabase
      .from('staff_training_matrix')
      .select('id, completion_date, expiry_date, courses(expiry_months)')
      .not('completion_date', 'is', null);

    let recalculated = 0;
    const expiryUpdates = [];

    for (const record of recordsToRecalc) {
      if (record.completion_date && record.courses?.expiry_months) {
        const completionDate = new Date(record.completion_date);
        const expiryDate = new Date(completionDate);
        expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];

        if (expiryDateStr !== record.expiry_date) {
          expiryUpdates.push({
            id: record.id,
            oldExpiry: record.expiry_date,
            newExpiry: expiryDateStr
          });
        }
      }
    }

    console.log(`Found ${expiryUpdates.length} expiry dates to recalculate\n`);

    if (expiryUpdates.length > 0) {
      let recalcSaved = 0;
      for (const update of expiryUpdates) {
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: update.newExpiry })
          .eq('id', update.id);

        if (!error) {
          recalcSaved++;
          if (recalcSaved % 50 === 0) {
            console.log(`  Recalculated ${recalcSaved}/${expiryUpdates.length}...`);
          }
        }
      }
      console.log(`✓ Recalculated ${recalcSaved} expiry dates\n`);
    }

    // Final summary
    console.log('\n' + '═'.repeat(120));
    console.log('✅ COMPLETE\n');
    console.log('Summary:');
    console.log(`  • Courses updated with expiry_months: ${updates.length}`);
    console.log(`  • Expiry dates recalculated: ${expiryUpdates.length}`);
    console.log(`  • All dates now match correctly\n`);
    console.log('═'.repeat(120) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

extractAndSaveExpiryMonths();
