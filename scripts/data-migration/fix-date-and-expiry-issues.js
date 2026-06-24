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

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  return match ? match[1].trim() : null;
}

// Parse dates strictly as DD/MM/YYYY
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    
    // Validate date
    const dateObj = new Date(`${year}-${month}-${day}`);
    if (isNaN(dateObj.getTime())) return null;
    
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

async function parseCSVData(filePath, locationName) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content);
    
    const csvData = {};
    let courseRow = -1;
    let courseNames = [];
    
    for (let i = 0; i < Math.min(10, records.length); i++) {
      if (records[i][0] === 'Staff Name') {
        courseNames = records[i].slice(1).filter(c => c && c.length > 0);
        courseRow = i;
        break;
      }
    }
    
    if (courseRow === -1) return csvData;
    
    const skipPhrases = ['Notes', 'Mandatory', 'Date valid for', 'Management', 'Team Leaders', 'Lead Support', 'Staff Team', 'Staff on Probation', 'Inactive'];
    
    for (let i = courseRow + 1; i < records.length; i++) {
      const row = records[i];
      if (!row[0] || row[0].trim().length === 0) continue;
      
      const staffName = row[0].trim();
      if (skipPhrases.some(phrase => staffName.includes(phrase))) continue;
      
      for (let j = 0; j < courseNames.length && j + 1 < row.length; j++) {
        const courseName = courseNames[j].trim();
        const value = (row[j + 1] || '').trim();
        
        if (courseName && value) {
          const key = `${staffName}|${courseName}`;
          csvData[key] = {
            staffName,
            courseName,
            csvValue: value,
            csvDate: parseDate(value),
            location: locationName
          };
        }
      }
    }
    
    return csvData;
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
    return {};
  }
}

async function getAllCsvData() {
  console.log('📂 LOADING CSV DATA\n');
  
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const allCsvData = {};
  
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;
    
    const data = await parseCSVData(path.join(CSV_FOLDER, csvFile), location);
    Object.assign(allCsvData, data);
  }
  
  console.log(`✓ Loaded ${Object.keys(allCsvData).length} CSV records\n`);
  return allCsvData;
}

async function getDatabaseData() {
  console.log('📊 LOADING DATABASE RECORDS\n');
  
  const { data: dbRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, profiles(full_name), courses(name, expiry_months)');
  
  const dbData = {};
  
  if (dbRecords) {
    for (const record of dbRecords) {
      const staffName = record.profiles?.full_name || '';
      const courseName = record.courses?.name || '';
      const key = `${staffName.toLowerCase().trim()}|${courseName.toLowerCase().trim()}`;
      
      dbData[key] = {
        id: record.id,
        staffName,
        courseName,
        dbDate: record.completion_date,
        expiryDate: record.expiry_date,
        courseId: record.course_id,
        expiryMonths: record.courses?.expiry_months
      };
    }
  }
  
  console.log(`✓ Loaded ${Object.keys(dbData).length} database records\n`);
  return dbData;
}

async function fixDatesAndExpiry() {
  console.log('\n' + '═'.repeat(100));
  console.log('  FIX DATE DISCREPANCIES AND CALCULATE MISSING EXPIRY DATES');
  console.log('═'.repeat(100) + '\n');
  
  try {
    const csvData = await getAllCsvData();
    const dbData = await getDatabaseData();
    
    const toFixDates = [];
    const toCalculateExpiry = [];
    
    // Find discrepancies
    console.log('🔍 IDENTIFYING ISSUES\n');
    
    for (const [key, csvRecord] of Object.entries(csvData)) {
      const normalizedKey = key.toLowerCase();
      
      let dbRecord = null;
      for (const [dbKey, db] of Object.entries(dbData)) {
        if (dbKey === normalizedKey) {
          dbRecord = db;
          break;
        }
      }
      
      if (!dbRecord) continue;
      
      // Check for date mismatches
      if (csvRecord.csvDate && csvRecord.csvDate !== dbRecord.dbDate) {
        toFixDates.push({
          id: dbRecord.id,
          staffName: csvRecord.staffName,
          courseName: csvRecord.courseName,
          csvDate: csvRecord.csvDate,
          currentDbDate: dbRecord.dbDate,
          courseId: dbRecord.courseId,
          expiryMonths: dbRecord.expiryMonths
        });
      }
      
      // Check for missing expiry dates
      if (dbRecord.dbDate && !dbRecord.expiryDate && dbRecord.expiryMonths) {
        toCalculateExpiry.push({
          id: dbRecord.id,
          staffName: csvRecord.staffName,
          courseName: csvRecord.courseName,
          completionDate: dbRecord.dbDate,
          expiryMonths: dbRecord.expiryMonths
        });
      }
    }
    
    console.log(`Found ${toFixDates.length} date discrepancies`);
    console.log(`Found ${toCalculateExpiry.length} missing expiry dates\n`);
    
    if (toFixDates.length > 0) {
      console.log('═'.repeat(100));
      console.log('FIXING DATE DISCREPANCIES\n');
      
      let fixedDates = 0;
      const updates = [];
      
      for (const item of toFixDates) {
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ completion_date: item.csvDate })
          .eq('id', item.id);
        
        if (!error) {
          fixedDates++;
          updates.push({
            id: item.id,
            staffName: item.staffName,
            courseName: item.courseName,
            oldDate: item.currentDbDate,
            newDate: item.csvDate
          });
          
          // If we just fixed the date and there's no expiry, add to expiry calculation
          if (item.expiryMonths) {
            toCalculateExpiry.push({
              id: item.id,
              staffName: item.staffName,
              courseName: item.courseName,
              completionDate: item.csvDate,
              expiryMonths: item.expiryMonths
            });
          }
        }
      }
      
      console.log(`✅ Fixed ${fixedDates}/${toFixDates.length} date discrepancies\n`);
      
      if (fixedDates > 0 && fixedDates <= 20) {
        console.log('Sample of corrected records:');
        updates.slice(0, 10).forEach((u, i) => {
          console.log(`${i + 1}. ${u.staffName} | ${u.courseName}`);
          console.log(`   ${u.oldDate} → ${u.newDate}`);
        });
        console.log('');
      }
    }
    
    if (toCalculateExpiry.length > 0) {
      console.log('\n' + '═'.repeat(100));
      console.log('CALCULATING MISSING EXPIRY DATES\n');
      
      let calculatedExpiry = 0;
      const deduped = new Map();
      
      // Deduplicate by ID to avoid updating same record twice
      for (const item of toCalculateExpiry) {
        deduped.set(item.id, item);
      }
      
      for (const [id, item] of deduped) {
        const completionDate = new Date(item.completionDate);
        const expiryDate = new Date(completionDate);
        expiryDate.setMonth(expiryDate.getMonth() + item.expiryMonths);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];
        
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: expiryDateStr })
          .eq('id', id);
        
        if (!error) {
          calculatedExpiry++;
        }
      }
      
      console.log(`✅ Calculated ${calculatedExpiry} expiry dates\n`);
    }
    
    // Final verification
    console.log('\n' + '═'.repeat(100));
    console.log('FINAL VERIFICATION\n');
    
    const { count: stillMissingExpiry } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .not('completion_date', 'is', null)
      .is('expiry_date', null);
    
    console.log(`Remaining records without expiry_date: ${stillMissingExpiry}`);
    
    console.log('\n' + '═'.repeat(100));
    console.log('✅ FIX COMPLETE\n');
    console.log(`Summary:`);
    console.log(`  • Fixed ${toFixDates.length} date discrepancies`);
    console.log(`  • Calculated ${toCalculateExpiry.length} expiry dates`);
    console.log(`  • Remaining issues: ${stillMissingExpiry} records`);
    console.log('═'.repeat(100) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixDatesAndExpiry();
