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

async function comprehensiveExpirySync() {
  console.log('\n' + '═'.repeat(120));
  console.log('  COMPREHENSIVE EXPIRY SYNCHRONIZATION - ALL CSV FILES');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Map: courseName -> { allValues: [{ location, months }], countByMonths: { months: count } }
  const courseExpiryMap = new Map();

  console.log(`📂 Scanning ${csvFiles.length} CSV files...\n`);

  // Extract ALL expiry data from ALL CSVs
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
            if (!courseExpiryMap.has(courseName)) {
              courseExpiryMap.set(courseName, {
                allValues: [],
                countByMonths: {}
              });
            }

            const months = parseExpiryMonths(expiryText);
            const monthsStr = months === null ? 'NULL' : `${months}m`;
            
            const data = courseExpiryMap.get(courseName);
            data.allValues.push({ location, months, monthsStr, rawText: expiryText });
            data.countByMonths[monthsStr] = (data.countByMonths[monthsStr] || 0) + 1;
          }
        }
      }
    } catch (err) {
      console.error(`  Error parsing ${csvFile}: ${err.message}`);
    }
  }

  console.log(`✓ Extracted expiry data for ${courseExpiryMap.size} courses from all locations\n`);

  // Get all courses from database
  const { data: dbCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months');

  console.log('═'.repeat(120));
  console.log('DETERMINING CORRECT VALUES FOR ALL COURSES:\n');

  const updates = [];
  const noChanges = [];
  const conflicts = [];

  for (const dbCourse of dbCourses) {
    const csvData = courseExpiryMap.get(dbCourse.name);
    
    if (!csvData) {
      continue;
    }

    // Count occurrences
    const counts = csvData.countByMonths;
    const monthsKeys = Object.keys(counts);

    // Find the most common value
    let mostCommonMonths = monthsKeys[0];
    let maxCount = counts[monthsKeys[0]];

    for (const monthsStr of monthsKeys) {
      if (counts[monthsStr] > maxCount) {
        mostCommonMonths = monthsStr;
        maxCount = counts[monthsStr];
      }
    }

    const correctMonths = mostCommonMonths === 'NULL' ? null : parseInt(mostCommonMonths);
    const dbMonths = dbCourse.expiry_months;

    // Check if database matches CSV
    if (correctMonths === dbMonths && monthsKeys.length === 1) {
      // Perfect match, no conflict
      noChanges.push(dbCourse.name);
    } else if (monthsKeys.length > 1) {
      // Conflicting data in CSV across locations
      conflicts.push({
        name: dbCourse.name,
        dbValue: dbMonths,
        correctValue: correctMonths,
        counts: counts,
        values: csvData.allValues
      });

      // Still mark for update if different
      if (correctMonths !== dbMonths) {
        updates.push({
          id: dbCourse.id,
          name: dbCourse.name,
          oldValue: dbMonths,
          newValue: correctMonths,
          confidence: 'CONFLICTING',
          counts: counts
        });
      }
    } else if (correctMonths !== dbMonths) {
      // Consistent CSV data but different from database
      updates.push({
        id: dbCourse.id,
        name: dbCourse.name,
        oldValue: dbMonths,
        newValue: correctMonths,
        confidence: 'CONSISTENT',
        counts: counts
      });
    }
  }

  console.log(`Found ${updates.length} courses to update`);
  console.log(`Found ${noChanges.length} courses with no changes needed`);
  console.log(`Found ${conflicts.length} courses with conflicting CSV data\n`);

  // Show conflicts
  if (conflicts.length > 0) {
    console.log('═'.repeat(120));
    console.log('COURSES WITH CONFLICTING DATA ACROSS LOCATIONS:\n');
    
    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i];
      console.log(`${i + 1}. ${conflict.name}`);
      console.log(`   Database value: ${conflict.dbValue === null ? 'NULL' : `${conflict.dbValue}m`}`);
      console.log(`   CSV values (using most common: ${conflict.correctValue === null ? 'NULL' : `${conflict.correctValue}m`}):`);
      
      for (const [monthsStr, count] of Object.entries(conflict.counts).sort()) {
        const locations = conflict.values
          .filter(v => v.monthsStr === monthsStr)
          .map(v => v.location)
          .join(', ');
        console.log(`     • ${monthsStr}: ${count} location(s) - ${locations}`);
      }
      console.log('');
    }
  }

  // Show updates
  console.log('═'.repeat(120));
  console.log(`UPDATING ${updates.length} COURSES:\n`);

  const groupedUpdates = {};
  for (const update of updates) {
    const oldDisplay = update.oldValue === null ? 'NULL' : `${update.oldValue}m`;
    const newDisplay = update.newValue === null ? 'NULL' : `${update.newValue}m`;
    const key = `${oldDisplay} → ${newDisplay}`;

    if (!groupedUpdates[key]) {
      groupedUpdates[key] = [];
    }
    groupedUpdates[key].push(update.name);
  }

  for (const [change, courses] of Object.entries(groupedUpdates)) {
    console.log(`${change} (${courses.length} courses):`);
    courses.slice(0, 5).forEach(c => console.log(`  • ${c}`));
    if (courses.length > 5) {
      console.log(`  ... and ${courses.length - 5} more`);
    }
    console.log('');
  }

  // Apply all updates
  console.log('═'.repeat(120));
  console.log('SAVING TO DATABASE:\n');

  let successCount = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from('courses')
      .update({ expiry_months: update.newValue })
      .eq('id', update.id);

    if (!error) {
      successCount++;
    }
  }

  console.log(`✓ Updated ${successCount}/${updates.length} courses\n`);

  // Recalculate ALL expiry dates
  console.log('═'.repeat(120));
  console.log('RECALCULATING ALL EXPIRY DATES:\n');

  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, courses(name, expiry_months)')
    .not('completion_date', 'is', null);

  let recalculated = 0;
  let alreadyCorrect = 0;

  for (const record of allRecords) {
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
      } else {
        alreadyCorrect++;
      }
    }
  }

  console.log(`✓ Recalculated ${recalculated} expiry dates`);
  console.log(`✓ ${alreadyCorrect} records were already correct\n`);

  console.log('═'.repeat(120));
  console.log('✅ COMPLETE SYNCHRONIZATION FINISHED\n');
  console.log(`Summary:`);
  console.log(`  • Updated ${successCount} courses`);
  console.log(`  • Recalculated ${recalculated} expiry dates`);
  console.log(`  • ${noChanges.length} courses needed no changes`);
  console.log(`  • ${conflicts.length} courses had conflicting data (used most common value)\n`);
}

comprehensiveExpirySync();
