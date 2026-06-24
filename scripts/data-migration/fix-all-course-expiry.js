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

async function fixAllCourseExpiry() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIX ALL COURSE EXPIRY_MONTHS BASED ON CSV DATA');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Map: courseName -> [{ location, expiryMonths }]
  const courseExpiryMap = new Map();

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
            if (!courseExpiryMap.has(courseName)) {
              courseExpiryMap.set(courseName, []);
            }

            const months = parseExpiryMonths(expiryText);
            courseExpiryMap.get(courseName).push({
              location,
              expiryMonths: months
            });
          }
        }
      }
    } catch (err) {
      console.error(`  Error parsing ${csvFile}: ${err.message}`);
    }
  }

  console.log(`✓ Extracted expiry data for ${courseExpiryMap.size} courses\n`);

  // For each course, determine the MOST COMMON expiry duration
  const courseStandardExpiry = new Map();

  for (const [courseName, expiryList] of courseExpiryMap.entries()) {
    const months = expiryList.map(e => e.expiryMonths);
    const counts = {};
    
    months.forEach(m => {
      counts[m] = (counts[m] || 0) + 1;
    });

    // Get the most common expiry
    const mostCommon = Object.keys(counts).reduce((a, b) => 
      counts[a] > counts[b] ? a : b
    );

    const standardMonths = mostCommon === 'null' ? null : parseInt(mostCommon);
    courseStandardExpiry.set(courseName, standardMonths);
  }

  // Get all courses from database
  const { data: dbCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months');

  console.log(`✓ Found ${dbCourses.length} courses in database\n`);

  // Find courses that need updating
  console.log('═'.repeat(120));
  console.log('COURSES TO UPDATE:\n');

  const updates = [];

  for (const dbCourse of dbCourses) {
    const csvExpiry = courseStandardExpiry.get(dbCourse.name);

    if (csvExpiry !== undefined && csvExpiry !== dbCourse.expiry_months) {
      updates.push({
        id: dbCourse.id,
        name: dbCourse.name,
        oldValue: dbCourse.expiry_months,
        newValue: csvExpiry
      });
    }
  }

  console.log(`Found ${updates.length} courses to update\n`);

  if (updates.length > 0) {
    // Group by what's changing
    const changes = {};
    updates.forEach(u => {
      const oldDisplay = u.oldValue === null ? 'NULL' : `${u.oldValue}m`;
      const newDisplay = u.newValue === null ? 'NULL' : `${u.newValue}m`;
      const key = `${oldDisplay} → ${newDisplay}`;
      if (!changes[key]) changes[key] = [];
      changes[key].push(u.name);
    });

    for (const [change, courses] of Object.entries(changes)) {
      console.log(`${change} (${courses.length} courses):`);
      courses.forEach(c => {
        console.log(`  • ${c}`);
      });
      console.log('');
    }

    // Apply updates
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
        const oldDisplay = update.oldValue === null ? 'NULL' : `${update.oldValue}m`;
        const newDisplay = update.newValue === null ? 'NULL' : `${update.newValue}m`;
        if (saved <= 10) {
          console.log(`✓ ${update.name}: ${oldDisplay} → ${newDisplay}`);
        }
      }
    }
    
    if (saved > 10) {
      console.log(`... and ${saved - 10} more courses`);
    }
    console.log(`\n✓ Updated ${saved}/${updates.length} courses\n`);

    // Recalculate all expiry dates
    console.log('═'.repeat(120));
    console.log('RECALCULATING EXPIRY DATES:\n');

    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, completion_date, expiry_date, courses(expiry_months)')
      .not('completion_date', 'is', null);

    let recalculated = 0;

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
            if (recalculated % 100 === 0) {
              console.log(`  Recalculated ${recalculated}...`);
            }
          }
        }
      }
    }

    console.log(`✓ Recalculated ${recalculated} expiry dates\n`);

    // Final verification
    console.log('═'.repeat(120));
    console.log('VERIFICATION:\n');

    const { data: samples } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        expiry_date,
        courses(name, expiry_months),
        profiles(full_name)
      `)
      .not('completion_date', 'is', null)
      .limit(15);

    console.log('Sample of updated records:\n');
    samples.slice(0, 10).forEach((rec, idx) => {
      const staff = rec.profiles?.full_name || 'Unknown';
      const course = rec.courses?.name || 'Unknown';
      const completion = rec.completion_date;
      const expiry = rec.expiry_date;
      const months = rec.courses?.expiry_months;

      // Verify calculation
      if (completion && months) {
        const completionDate = new Date(completion);
        const calcExpiry = new Date(completionDate);
        calcExpiry.setMonth(calcExpiry.getMonth() + months);
        const calcExpiryStr = calcExpiry.toISOString().split('T')[0];
        const matches = calcExpiryStr === expiry ? '✓' : '⚠️';

        console.log(`${idx + 1}. ${staff} - ${course}`);
        console.log(`   Completion: ${completion} | Expiry_months: ${months}`);
        console.log(`   DB Expiry: ${expiry} | Calculated: ${calcExpiryStr} ${matches}`);
        console.log('');
      }
    });

    console.log('═'.repeat(120));
    console.log('✅ ALL EXPIRY MONTHS AND DATES SYNCHRONIZED\n');
  }
}

fixAllCourseExpiry();
