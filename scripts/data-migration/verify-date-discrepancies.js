#!/usr/bin/env node

/**
 * VERIFICATION SCRIPT: Check Date Discrepancies
 * 
 * Compares dates from CSV files with database records
 * to identify any mismatches
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

function normalizeName(name) {
  if (!name) return null;
  return name.toLowerCase().trim();
}

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
    
    // Find course header row
    for (let i = 0; i < Math.min(10, records.length); i++) {
      if (records[i][0] === 'Staff Name') {
        courseNames = records[i].slice(1).filter(c => c && c.length > 0);
        courseRow = i;
        break;
      }
    }
    
    if (courseRow === -1) return csvData;
    
    // Parse staff data
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
  console.log('📂 SCANNING CSV FILES\n');
  
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const allCsvData = {};
  
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;
    
    const data = await parseCSVData(path.join(CSV_FOLDER, csvFile), location);
    Object.assign(allCsvData, data);
    
    console.log(`✓ ${location}: ${Object.keys(data).length} records`);
  }
  
  console.log(`\nTotal CSV records: ${Object.keys(allCsvData).length}\n`);
  return allCsvData;
}

async function getDatabaseData() {
  console.log('📊 CHECKING DATABASE\n');
  
  const { data: dbRecords, error } = await supabase
    .from('staff_training_matrix')
    .select('id, staff_id, course_id, completion_date, expiry_date, status, profiles(full_name), courses(name)')
    .not('completion_date', 'is', null);
  
  if (error) {
    console.error(`Error fetching database: ${error.message}`);
    return {};
  }
  
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
  
  console.log(`Total DB records with completion_date: ${Object.keys(dbData).length}\n`);
  return dbData;
}

async function compareData(csvData, dbData) {
  console.log('🔍 COMPARING DATA\n');
  console.log('═'.repeat(100) + '\n');
  
  const discrepancies = [];
  const matched = [];
  const csvOnly = [];
  const dbOnly = [];
  
  // Check CSV records in database
  for (const [key, csvRecord] of Object.entries(csvData)) {
    const normalizedKey = key.toLowerCase();
    
    // Find matching DB record (case-insensitive)
    let dbRecord = dbData[normalizedKey];
    
    if (!dbRecord) {
      // Try to find by normalized names
      for (const [dbKey, db] of Object.entries(dbData)) {
        if (dbKey === normalizedKey) {
          dbRecord = db;
          break;
        }
      }
    }
    
    if (!dbRecord) {
      csvOnly.push({ key, ...csvRecord });
      continue;
    }
    
    // Compare dates
    if (csvRecord.csvDate && csvRecord.csvDate !== dbRecord.dbDate) {
      discrepancies.push({
        staffName: csvRecord.staffName,
        courseName: csvRecord.courseName,
        location: csvRecord.location,
        csvDate: csvRecord.csvDate,
        csvValue: csvRecord.csvValue,
        dbDate: dbRecord.dbDate,
        expiryDate: dbRecord.expiryDate,
        id: dbRecord.id
      });
    } else if (csvRecord.csvDate === dbRecord.dbDate) {
      matched.push(key);
    }
  }
  
  // Check DB records not in CSV
  for (const [key, dbRecord] of Object.entries(dbData)) {
    if (!csvData[key] && !Object.keys(csvData).some(k => k.toLowerCase() === key)) {
      dbOnly.push({ key, ...dbRecord });
    }
  }
  
  return {
    discrepancies,
    matched,
    csvOnly,
    dbOnly
  };
}

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('  DATE VERIFICATION & DISCREPANCY CHECKER');
  console.log('═'.repeat(100) + '\n');
  
  try {
    const csvData = await getAllCsvData();
    const dbData = await getDatabaseData();
    const comparison = await compareData(csvData, dbData);
    
    console.log('\n📋 COMPARISON RESULTS\n');
    console.log('═'.repeat(100) + '\n');
    
    console.log(`✅ Matched records: ${comparison.matched.length}`);
    console.log(`⚠️  Discrepancies found: ${comparison.discrepancies.length}`);
    console.log(`❓ CSV-only records: ${comparison.csvOnly.length}`);
    console.log(`❓ DB-only records: ${comparison.dbOnly.length}\n`);
    
    if (comparison.discrepancies.length > 0) {
      console.log('\n🔴 DATE DISCREPANCIES FOUND:\n');
      console.log('═'.repeat(100) + '\n');
      
      for (const disc of comparison.discrepancies) {
        console.log(`Staff: ${disc.staffName}`);
        console.log(`Course: ${disc.courseName}`);
        console.log(`Location: ${disc.location}`);
        console.log(`CSV Value: ${disc.csvValue}`);
        console.log(`CSV Date: ${disc.csvDate}`);
        console.log(`DB Date: ${disc.dbDate}`);
        console.log(`Expiry: ${disc.expiryDate || '(none)'}`);
        console.log(`Record ID: ${disc.id}`);
        console.log('─'.repeat(100) + '\n');
      }
    } else {
      console.log('\n✅ NO DISCREPANCIES FOUND - All dates match!\n');
    }
    
    if (comparison.csvOnly.length > 0 && comparison.csvOnly.length <= 20) {
      console.log('\n📄 CSV-ONLY RECORDS (in CSV but not in DB with completion_date):\n');
      for (const record of comparison.csvOnly.slice(0, 20)) {
        console.log(`${record.staffName} | ${record.courseName} | ${record.csvValue}`);
      }
      console.log('');
    }
    
    if (comparison.dbOnly.length > 0 && comparison.dbOnly.length <= 20) {
      console.log('\n💾 DB-ONLY RECORDS (in DB but not in CSV):\n');
      for (const record of comparison.dbOnly.slice(0, 20)) {
        console.log(`${record.staffName} | ${record.courseName} | ${record.dbDate}`);
      }
      console.log('');
    }
    
    console.log('\n' + '═'.repeat(100));
    if (comparison.discrepancies.length === 0) {
      console.log('✅ VERIFICATION COMPLETE - Database matches CSV files!');
    } else {
      console.log(`⚠️  VERIFICATION COMPLETE - ${comparison.discrepancies.length} discrepancies found`);
      console.log('\nTo fix discrepancies, record IDs are listed above.');
      console.log('You can manually update them or run a fix script.');
    }
    console.log('═'.repeat(100) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
