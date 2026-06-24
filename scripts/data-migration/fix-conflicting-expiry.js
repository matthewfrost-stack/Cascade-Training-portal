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
  
  if (lower === 'one-off' || lower === 'one off' || lower === 'never' || lower === '' || lower === 'blank') {
    return null;
  }
  
  const yearMatch = expiryText.match(/(\d+)\s*(?:year|yr)?/i);
  if (yearMatch) {
    const years = parseInt(yearMatch[1]);
    return years * 12;
  }
  
  return null;
}

async function fixConflictingExpiry() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIXING CONFLICTING COURSES WITH CORRECT DURATIONS');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  const courseExpiryDetails = new Map();

  console.log(`📂 Scanning ${csvFiles.length} CSV files...\n`);

  // Extract all expiry data from CSVs
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;

    try {
      const content = fs.readFileSync(path.join(CSV_FOLDER, csvFile), 'utf-8');
      const records = parse(content);

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

      if (expiryRow >= 0) {
        const expiryValues = records[expiryRow].slice(1);
        
        for (let i = 0; i < courseNames.length && i < expiryValues.length; i++) {
          const courseName = courseNames[i].trim();
          const expiryText = (expiryValues[i] || '').trim();

          if (courseName) {
            if (!courseExpiryDetails.has(courseName)) {
              courseExpiryDetails.set(courseName, {
                durations: {},
                locations: {}
              });
            }

            const months = parseExpiryMonths(expiryText);
            const monthsStr = months === null ? 'NULL' : `${months}m`;
            
            const details = courseExpiryDetails.get(courseName);
            details.durations[monthsStr] = (details.durations[monthsStr] || 0) + 1;
            
            if (!details.locations[monthsStr]) {
              details.locations[monthsStr] = [];
            }
            details.locations[monthsStr].push(location);
          }
        }
      }
    } catch (err) {
      console.error(`  Error parsing ${csvFile}: ${err.message}`);
    }
  }

  console.log(`✓ Extracted expiry data for ${courseExpiryDetails.size} courses\n`);

  // Get all courses from database
  const { data: dbCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months');

  console.log('═'.repeat(120));
  console.log('APPLYING FIXES:\n');

  const updates = [];

  for (const dbCourse of dbCourses) {
    const csvDetails = courseExpiryDetails.get(dbCourse.name);
    if (!csvDetails) continue;

    const durations = csvDetails.durations;
    const durationKeys = Object.keys(durations);

    // Find most common duration in CSV
    let mostCommonDuration = durationKeys[0];
    for (const duration of durationKeys) {
      if (durations[duration] > durations[mostCommonDuration]) {
        mostCommonDuration = duration;
      }
    }

    const mostCommonMonths = mostCommonDuration === 'NULL' ? null : parseInt(mostCommonDuration);
    const dbMonths = dbCourse.expiry_months;

    // If they don't match
    if (mostCommonMonths !== dbMonths) {
      updates.push({
        id: dbCourse.id,
        name: dbCourse.name,
        oldValue: dbMonths,
        newValue: mostCommonMonths,
        durationBreakdown: durations,
        locations: csvDetails.locations
      });
    }
  }

  console.log(`Found ${updates.length} courses to update:\n`);

  for (const update of updates) {
    const oldDisplay = update.oldValue === null ? 'NULL' : `${update.oldValue}m`;
    const newDisplay = update.newValue === null ? 'NULL' : `${update.newValue}m`;
    
    console.log(`${update.name}`);
    console.log(`  ${oldDisplay} → ${newDisplay}`);
    
    // Show breakdown
    for (const [duration, count] of Object.entries(update.durationBreakdown).sort()) {
      console.log(`    • ${duration}: ${count} location(s)`);
    }
    console.log('');
  }

  // Apply updates
  console.log('═'.repeat(120));
  console.log('SAVING UPDATES:\n');

  let saved = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from('courses')
      .update({ expiry_months: update.newValue })
      .eq('id', update.id);

    if (!error) {
      saved++;
      const oldDisplay = update.oldValue === null ? 'NULL' : `${update.oldValue}m`;
      const newDisplay = update.newValue === null ? 'NULL' : `${update.newValue}m`;
      console.log(`✓ ${update.name}: ${oldDisplay} → ${newDisplay}`);
    }
  }
  
  console.log(`\n✓ Updated ${saved}/${updates.length} courses\n`);

  // Recalculate all expiry dates for updated courses
  console.log('═'.repeat(120));
  console.log('RECALCULATING EXPIRY DATES:\n');

  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, courses(name, expiry_months)')
    .not('completion_date', 'is', null);

  const updatedCourseNames = new Set(updates.map(u => u.name));
  let recalculated = 0;

  for (const record of allRecords) {
    // Only recalculate for courses we updated
    if (!updatedCourseNames.has(record.courses?.name)) continue;

    if (record.completion_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      if (expiryDateStr !== record.expiry_date) {
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: expiryDateStr })
          .eq('id', record.id);

        if (!error) {
          recalculated++;
        }
      }
    }
  }

  console.log(`✓ Recalculated ${recalculated} expiry dates\n`);

  console.log('═'.repeat(120));
  console.log('✅ ALL CONFLICTS FIXED\n');
}

fixConflictingExpiry();
