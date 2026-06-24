#!/usr/bin/env node

/**
 * FIX SCRIPT: Correct Date Discrepancies
 * 
 * Updates database records to match CSV dates
 */

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

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const allCsvData = {};
  
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;
    
    const data = await parseCSVData(path.join(CSV_FOLDER, csvFile), location);
    Object.assign(allCsvData, data);
  }
  
  return allCsvData;
}

async function getDatabaseData() {
  const { data: dbRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status, profiles(full_name), courses(name)');
  
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
        status: record.status
      };
    }
  }
  
  return dbData;
}

async function findDiscrepancies(csvData, dbData) {
  const discrepancies = [];
  
  for (const [key, csvRecord] of Object.entries(csvData)) {
    const normalizedKey = key.toLowerCase();
    
    let dbRecord = dbData[normalizedKey];
    
    if (!dbRecord) {
      for (const [dbKey, db] of Object.entries(dbData)) {
        if (dbKey === normalizedKey) {
          dbRecord = db;
          break;
        }
      }
    }
    
    if (!dbRecord) continue;
    
    if (csvRecord.csvDate && csvRecord.csvDate !== dbRecord.dbDate) {
      discrepancies.push({
        id: dbRecord.id,
        staffName: csvRecord.staffName,
        courseName: csvRecord.courseName,
        csvDate: csvRecord.csvDate,
        dbDate: dbRecord.dbDate
      });
    }
  }
  
  return discrepancies;
}

async function fixDiscrepancies(discrepancies) {
  console.log(`\n🔧 FIXING ${discrepancies.length} DISCREPANCIES\n`);
  
  let fixed = 0;
  let errors = 0;
  
  for (let i = 0; i < discrepancies.length; i += 50) {
    const batch = discrepancies.slice(i, i + 50);
    
    for (const disc of batch) {
      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ completion_date: disc.csvDate })
        .eq('id', disc.id);
      
      if (!error) {
        fixed++;
      } else {
        errors++;
        console.log(`❌ Error updating ${disc.id}: ${error.message}`);
      }
    }
    
    console.log(`✅ Fixed ${Math.min(fixed, (i + 50))} records...`);
  }
  
  console.log(`\n✅ Completed! Fixed: ${fixed}, Errors: ${errors}\n`);
  return { fixed, errors };
}

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('  FIX DATE DISCREPANCIES');
  console.log('═'.repeat(100) + '\n');
  
  try {
    console.log('📂 Loading CSV data...');
    const csvData = await getAllCsvData();
    console.log(`✓ Loaded ${Object.keys(csvData).length} CSV records\n`);
    
    console.log('📊 Loading database data...');
    const dbData = await getDatabaseData();
    console.log(`✓ Loaded ${Object.keys(dbData).length} database records\n`);
    
    console.log('🔍 Finding discrepancies...');
    const discrepancies = await findDiscrepancies(csvData, dbData);
    console.log(`✓ Found ${discrepancies.length} discrepancies\n`);
    
    if (discrepancies.length === 0) {
      console.log('✅ No discrepancies found! Database matches CSV.\n');
      return;
    }
    
    console.log('Discrepancies to fix:');
    for (const disc of discrepancies.slice(0, 10)) {
      console.log(`  ${disc.staffName} | ${disc.courseName}`);
      console.log(`    CSV: ${disc.csvDate} → DB: ${disc.dbDate}`);
    }
    if (discrepancies.length > 10) {
      console.log(`  ... and ${discrepancies.length - 10} more\n`);
    }
    
    const result = await fixDiscrepancies(discrepancies);
    
    console.log('═'.repeat(100));
    console.log('✅ FIX COMPLETE');
    console.log(`Fixed: ${result.fixed} | Errors: ${result.errors}`);
    console.log('═'.repeat(100) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
