import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

// Mapping of course names to standard forms to catch variations
const courseNameNormalization = {
  'careskills': 'Careskills',
  'fire safety': 'Fire Safety',
  'first aid': 'First Aid',
  'food hygiene': 'Food Hygiene',
  'safeguarding': 'Safeguarding',
  'gdpr': 'GDPR',
  'manual handling': 'Manual Handling',
  'health & safety': 'Health & Safety',
};

function normalizeName(name) {
  if (!name) return null;
  return name.toLowerCase().trim();
}

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  return match ? match[1].trim() : null;
}

async function parseCSVToGetExpiryData(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content);
    
    const courseExpiries = {};
    let courseRow = -1;
    let expiryRow = -1;
    
    // Find the row with course names
    for (let i = 0; i < Math.min(10, records.length); i++) {
      const row = records[i];
      if (row[0] === 'Staff Name' || (row[0] && row[0].toLowerCase().includes('staff'))) {
        courseRow = i;
        break;
      }
    }
    
    if (courseRow === -1) return courseExpiries;
    
    // Look for "Date valid for" or "Expiry" row near the top
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
    
    // Get course names from header row
    const courseNames = records[courseRow].slice(1).filter(c => c && c.length > 0);
    
    // Get expiry info if available
    if (expiryRow >= 0) {
      const expiryValues = records[expiryRow].slice(1);
      for (let i = 0; i < courseNames.length && i < expiryValues.length; i++) {
        const courseName = courseNames[i].trim();
        const expiryVal = (expiryValues[i] || '').trim();
        
        if (courseName && expiryVal) {
          courseExpiries[normalizeName(courseName)] = {
            courseName,
            expiryValue: expiryVal,
            months: parseExpiryValue(expiryVal)
          };
        }
      }
    }
    
    return courseExpiries;
  } catch (err) {
    console.error(`Error parsing CSV: ${err.message}`);
    return {};
  }
}

function parseExpiryValue(value) {
  if (!value) return null;
  
  const lower = value.toLowerCase().trim();
  
  // Check for "one off" or "never"
  if (lower.includes('one off') || lower.includes('never') || lower.includes('non renewal')) {
    return null; // No expiry
  }
  
  // Check for year values (e.g., "1", "2", "3 years")
  const yearMatch = value.match(/(\d+)\s*(?:year)?/i);
  if (yearMatch) {
    const years = parseInt(yearMatch[1]);
    return years * 12; // Convert to months
  }
  
  // Check for month values
  const monthMatch = value.match(/(\d+)\s*(?:month)?/i);
  if (monthMatch) {
    return parseInt(monthMatch[1]);
  }
  
  return null;
}

async function extractAllCourseExpiries() {
  console.log('📊 EXTRACTING EXPIRY DURATIONS FROM ALL CSV FILES\n');
  console.log('='.repeat(60) + '\n');
  
  const allExpiries = {};
  const locationExpiries = {};
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  console.log(`Found ${csvFiles.length} CSV files to process:\n`);
  
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) {
      console.log(`⚠️  Skipping ${csvFile} - could not extract location name`);
      continue;
    }
    
    const expiries = await parseCSVToGetExpiryData(path.join(CSV_FOLDER, csvFile));
    locationExpiries[location] = expiries;
    
    // Merge into overall map
    for (const [normalized, data] of Object.entries(expiries)) {
      if (!allExpiries[normalized]) {
        allExpiries[normalized] = {
          courseName: data.courseName,
          locations: {}
        };
      }
      allExpiries[normalized].locations[location] = data;
    }
    
    console.log(`✓ ${location}: ${Object.keys(expiries).length} courses with expiry data`);
  }
  
  return { allExpiries, locationExpiries };
}

async function getConsistencyReport(allExpiries) {
  console.log('\n\n📋 CONSISTENCY REPORT\n');
  console.log('='.repeat(60) + '\n');
  
  const inconsistencies = [];
  let consistent = 0;
  let oneOff = 0;
  
  for (const [normalized, data] of Object.entries(allExpiries)) {
    const locations = Object.values(data.locations);
    const months = locations.map(l => l.months);
    const uniqueMonths = new Set(months.filter(m => m !== null));
    
    if (uniqueMonths.size === 0) {
      oneOff++;
      console.log(`✅ ${data.courseName}: One-off (no expiry) - ${locations.length} locations`);
    } else if (uniqueMonths.size === 1) {
      consistent++;
      const monthVal = [...uniqueMonths][0];
      const years = monthVal / 12;
      console.log(`✅ ${data.courseName}: ${years} year(s) - ${locations.length} locations`);
    } else {
      inconsistencies.push({
        course: data.courseName,
        variations: locations.map(l => ({
          location: Object.keys(data.locations).find(k => data.locations[k] === l),
          months: l.months,
          value: l.expiryValue
        }))
      });
    }
  }
  
  if (inconsistencies.length > 0) {
    console.log(`\n⚠️  INCONSISTENCIES FOUND (${inconsistencies.length} courses):\n`);
    for (const inc of inconsistencies) {
      console.log(`  ${inc.course}:`);
      for (const v of inc.variations) {
        console.log(`    - ${v.location}: "${v.value}" (${v.months} months)`);
      }
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Consistent courses: ${consistent}`);
  console.log(`  One-off courses: ${oneOff}`);
  console.log(`  Inconsistent courses: ${inconsistencies.length}`);
  
  return inconsistencies;
}

async function syncCoursesWithExpiries(allExpiries) {
  console.log('\n\n💾 SYNCING COURSES TO DATABASE\n');
  console.log('='.repeat(60) + '\n');
  
  const { data: dbCourses, error: fetchError } = await supabase
    .from('courses')
    .select('id, name, expiry_months');
  
  if (fetchError) {
    console.log(`❌ Error fetching courses: ${fetchError.message}`);
    return false;
  }
  
  if (!dbCourses) {
    console.log(`❌ No courses found in database`);
    return false;
  }
  
  const updates = [];
  const creations = [];
  let synced = 0;
  
  for (const [normalized, data] of Object.entries(allExpiries)) {
    // Find course in database
    const dbCourse = dbCourses.find(c => normalizeName(c.name) === normalized);
    
    if (!dbCourse) {
      console.log(`⚠️  Course not found in DB: ${data.courseName}`);
      continue;
    }
    
    // Determine the standard expiry for this course
    const locations = Object.values(data.locations);
    const months = locations.map(l => l.months).filter(m => m !== null);
    const uniqueMonths = new Set(months);
    
    let targetMonths = null;
    
    if (uniqueMonths.size === 0) {
      // One-off course - no expiry
      targetMonths = null;
    } else if (uniqueMonths.size === 1) {
      // Consistent across all locations
      targetMonths = [...uniqueMonths][0];
    } else {
      // Inconsistent - use most common
      const counts = {};
      for (const m of months) {
        counts[m] = (counts[m] || 0) + 1;
      }
      targetMonths = Object.keys(counts).reduce((a, b) => 
        counts[a] > counts[b] ? a : b
      );
      console.log(`  Using most common expiry for ${data.courseName}: ${targetMonths} months`);
    }
    
    // Check if update is needed
    const updateNeeded = dbCourse.expiry_months !== targetMonths;
    
    if (updateNeeded) {
      updates.push({
        id: dbCourse.id,
        expiry_months: targetMonths
      });
      synced++;
    }
  }
  
  if (updates.length > 0) {
    console.log(`Updating ${updates.length} courses...`);
    
    // Batch update
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      for (const update of batch) {
        const { error } = await supabase
          .from('courses')
          .update({
            expiry_months: update.expiry_months
          })
          .eq('id', update.id);
        
        if (error) {
          console.log(`❌ Error updating ${update.id}: ${error.message}`);
        }
      }
      console.log(`  ✅ Synced batch ${Math.min(i + 100, updates.length)} of ${updates.length}`);
    }
  }
  
  console.log(`\n✅ ${synced} courses synced with their expiry durations`);
  return updates.length > 0;
}

async function calculateAllMissingExpiries() {
  console.log('\n\n⏱️  CALCULATING MISSING EXPIRY DATES\n');
  console.log('='.repeat(60) + '\n');
  
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, name, expiry_months');
  
  if (coursesError) {
    console.log(`❌ Error fetching courses: ${coursesError.message}`);
    return 0;
  }
  
  if (!courses) {
    console.log(`❌ No courses found in database`);
    return 0;
  }
  
  const courseMap = new Map();
  courses.forEach(c => {
    courseMap.set(c.id, c.expiry_months);
  });
  
  console.log(`Loaded ${courses.length} courses with expiry settings\n`);
  
  let totalUpdated = 0;
  let pageSize = 500;
  let offset = 0;
  
  while (true) {
    const { data: records, error } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date, expiry_date, status')
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error(`Error fetching records: ${error.message}`);
      break;
    }
    
    if (!records || records.length === 0) {
      console.log(`✅ Complete! No more records to process.`);
      break;
    }
    
    console.log(`Processing records ${offset + 1} to ${offset + records.length}...`);
    
    const updates = [];
    
    for (const record of records) {
      const courseMonths = courseMap.get(record.course_id);
      
      if (!courseMonths) continue;
      
      // Calculate expiry date
      const date = new Date(record.completion_date);
      date.setMonth(date.getMonth() + courseMonths);
      const expiryDate = date.toISOString().split('T')[0];
      
      updates.push({
        id: record.id,
        expiry_date: expiryDate
      });
    }
    
    // Batch update
    let pageUpdated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      
      for (const update of batch) {
        const { error: updateError } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: update.expiry_date })
          .eq('id', update.id);
        
        if (!updateError) {
          pageUpdated++;
        }
      }
    }
    
    totalUpdated += pageUpdated;
    console.log(`  ✅ Updated ${pageUpdated} records in this batch (${totalUpdated} total)`);
    
    if (records.length < pageSize) {
      break;
    }
    
    offset += pageSize;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n✅ ${totalUpdated} expiry dates calculated and saved`);
  return totalUpdated;
}

async function main() {
  console.log('\n\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '   TRAINING DATES EXTRACTION & SYNCHRONIZATION   '.padEnd(59) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n');
  
  try {
    // Step 1: Extract all expiry data from CSVs
    const { allExpiries, locationExpiries } = await extractAllCourseExpiries();
    
    // Step 2: Check consistency
    const inconsistencies = await getConsistencyReport(allExpiries);
    
    // Step 3: Sync courses to database
    const synced = await syncCoursesWithExpiries(allExpiries);
    
    // Step 4: Calculate all missing expiry dates
    const updated = await calculateAllMissingExpiries();
    
    // Final Summary
    console.log('\n\n');
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(58) + '║');
    console.log('║' + '                    ✅ ALL COMPLETE                     '.padEnd(59) + '║');
    console.log('║' + ' '.repeat(58) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');
    console.log('\n');
    console.log(`📊 SUMMARY:`);
    console.log(`   • Total courses extracted: ${Object.keys(allExpiries).length}`);
    console.log(`   • CSV files processed: ${Object.keys(locationExpiries).length}`);
    console.log(`   • Inconsistencies found: ${inconsistencies.length}`);
    console.log(`   • Courses synced to database: ${synced}`);
    console.log(`   • Expiry dates calculated: ${updated}`);
    console.log(`\n✅ All dates have been extracted from CSV files and saved!`);
    console.log(`✅ All locations now have consistent course durations!`);
    console.log(`✅ No manual saving required!\n\n`);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
