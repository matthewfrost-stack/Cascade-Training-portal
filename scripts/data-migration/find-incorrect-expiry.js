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

async function findIncorrectExpiry() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FINDING COURSES WITH INCORRECT EXPIRY_MONTHS');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Map: courseName -> { durations: { months: count }, locations: { months: [location1, location2] } }
  const courseExpiryDetails = new Map();

  console.log(`📂 Scanning ${csvFiles.length} CSV files...\n`);

  // Extract all expiry data from CSVs with details
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
  console.log('COURSES WITH CONFLICTING DATA OR POTENTIAL ISSUES:\n');

  let issuesFound = 0;

  for (const dbCourse of dbCourses) {
    const csvDetails = courseExpiryDetails.get(dbCourse.name);

    if (!csvDetails) continue;

    const durations = csvDetails.durations;
    const durationKeys = Object.keys(durations);

    // Check if there are conflicting durations in CSV
    if (durationKeys.length > 1) {
      issuesFound++;
      const dbMonthsStr = dbCourse.expiry_months === null ? 'NULL' : `${dbCourse.expiry_months}m`;
      
      console.log(`${issuesFound}. ${dbCourse.name}`);
      console.log(`   Current DB Value: ${dbMonthsStr}`);
      console.log(`   CSV Data (conflicting):`);
      
      for (const duration of durationKeys.sort((a, b) => {
        const aNum = a === 'NULL' ? -1 : parseInt(a);
        const bNum = b === 'NULL' ? -1 : parseInt(b);
        return bNum - aNum;
      })) {
        const count = durations[duration];
        const locations = csvDetails.locations[duration];
        console.log(`     • ${duration}: ${count} location(s) - ${locations.join(', ')}`);
      }
      console.log('');
    }
  }

  if (issuesFound === 0) {
    console.log('✓ No courses with conflicting CSV data found\n');
  } else {
    console.log(`═`.repeat(120));
    console.log(`Found ${issuesFound} courses with conflicting CSV data\n`);
  }

  // Now check database vs CSV
  console.log('═'.repeat(120));
  console.log('COURSES WHERE DATABASE DOESN\'T MATCH CSV (Most common value):\n');

  let mismatchesFound = 0;

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
      mismatchesFound++;
      const dbMonthsStr = dbMonths === null ? 'NULL' : `${dbMonths}m`;
      console.log(`${mismatchesFound}. ${dbCourse.name}`);
      console.log(`   Database: ${dbMonthsStr} | CSV (most common): ${mostCommonDuration}`);
      console.log('');
    }
  }

  if (mismatchesFound === 0) {
    console.log('✓ All courses match their most common CSV value\n');
  }

  console.log('═'.repeat(120) + '\n');
}

findIncorrectExpiry();
