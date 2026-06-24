import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

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

async function checkCourseExpiryInCSV() {
  console.log('\n' + '═'.repeat(120));
  console.log('  SCANNING CSV FILES FOR COURSE EXPIRY DURATIONS');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Map: courseName -> { locations: [{ location, expiryText, expiryMonths }] }
  const courseExpiryMap = new Map();

  console.log(`📂 Scanning ${csvFiles.length} CSV files...\n`);

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
              expiryText,
              expiryMonths: months
            });
          }
        }
      }
    } catch (err) {
      console.error(`  Error parsing ${csvFile}: ${err.message}`);
    }
  }

  console.log(`✓ Found expiry information for ${courseExpiryMap.size} unique courses\n`);

  // Find courses with inconsistent expiry durations
  console.log('═'.repeat(120));
  console.log('COURSES WITH VARYING EXPIRY DURATIONS ACROSS LOCATIONS:\n');

  const inconsistentCourses = [];

  for (const [courseName, expiryList] of courseExpiryMap.entries()) {
    const uniqueMonths = new Set(expiryList.map(e => e.expiryMonths));
    
    if (uniqueMonths.size > 1) {
      inconsistentCourses.push({ courseName, expiryList });
      
      console.log(`${courseName}:`);
      for (const entry of expiryList) {
        const display = entry.expiryMonths === null ? 'One-off' : `${entry.expiryMonths} months`;
        console.log(`  ${entry.location}: "${entry.expiryText}" = ${display}`);
      }
      console.log('');
    }
  }

  if (inconsistentCourses.length === 0) {
    console.log('✓ All courses have consistent expiry durations across locations\n');
  } else {
    console.log(`\nFound ${inconsistentCourses.length} courses with inconsistent durations\n`);
  }

  // Show all courses organized by expiry months
  console.log('═'.repeat(120));
  console.log('ALL COURSES BY EXPIRY DURATION:\n');

  const byExpiry = new Map();

  for (const [courseName, expiryList] of courseExpiryMap.entries()) {
    // Use the first (most common) expiry month
    const monthsList = expiryList.map(e => e.expiryMonths);
    const mostCommon = monthsList.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    const standardMonths = Object.keys(mostCommon).reduce((a, b) => 
      mostCommon[a] > mostCommon[b] ? a : b
    );

    const key = standardMonths === 'null' ? 'One-off (null)' : `${standardMonths} months`;
    if (!byExpiry.has(key)) {
      byExpiry.set(key, []);
    }
    byExpiry.get(key).push(courseName);
  }

  for (const [duration, courses] of byExpiry.entries()) {
    console.log(`${duration} (${courses.length} courses):`);
    courses.forEach(c => {
      console.log(`  • ${c}`);
    });
    console.log('');
  }
}

checkCourseExpiryInCSV();
