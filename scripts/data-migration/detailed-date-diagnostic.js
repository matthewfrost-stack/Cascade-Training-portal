#!/usr/bin/env node

/**
 * DETAILED DIAGNOSTIC: Find all remaining date issues
 * 
 * Shows exactly which dates are wrong and why
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

async function parseCSVData(filePath) {
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
        
        if (courseName && value && value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          const key = `${staffName}|${courseName}`;
          const parsed = parseDate(value);
          csvData[key] = {
            staffName,
            courseName,
            csvRaw: value,
            csvDate: parsed,
            csvParts: { day: value.split('/')[0], month: value.split('/')[1], year: value.split('/')[2] }
          };
        }
      }
    }
    
    return csvData;
  } catch (err) {
    console.error(`Error parsing: ${err.message}`);
    return {};
  }
}

async function getAllCsvData() {
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const allCsvData = {};
  
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;
    
    const data = await parseCSVData(path.join(CSV_FOLDER, csvFile));
    Object.assign(allCsvData, data);
  }
  
  return allCsvData;
}

async function getDatabaseRecords() {
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

async function main() {
  console.log('\n' + '═'.repeat(120));
  console.log('  DETAILED DATE DIAGNOSTIC - FIND ALL ISSUES');
  console.log('═'.repeat(120) + '\n');
  
  try {
    console.log('📂 Loading CSV data...');
    const csvData = await getAllCsvData();
    console.log(`✓ Loaded ${Object.keys(csvData).length} CSV date records\n`);
    
    console.log('📊 Loading database...');
    const dbData = await getDatabaseRecords();
    console.log(`✓ Loaded ${Object.keys(dbData).length} database records\n`);
    
    console.log('🔍 Comparing dates in detail...\n');
    console.log('═'.repeat(120) + '\n');
    
    const issues = [];
    const correct = [];
    
    for (const [key, csvRecord] of Object.entries(csvData)) {
      const normalizedKey = key.toLowerCase();
      let dbRecord = null;
      
      // Find matching DB record
      for (const [dbKey, db] of Object.entries(dbData)) {
        if (dbKey === normalizedKey) {
          dbRecord = db;
          break;
        }
      }
      
      if (!dbRecord) continue;
      
      if (csvRecord.csvDate !== dbRecord.dbDate) {
        // Parse dates to compare components
        const csvParts = csvRecord.csvDate.split('-');
        const dbParts = dbRecord.dbDate.split('-');
        
        let issue = 'UNKNOWN';
        if (csvParts[1] !== dbParts[1]) issue = 'MONTH MISMATCH';
        else if (csvParts[2] !== dbParts[2]) issue = 'DAY MISMATCH';
        else if (csvParts[0] !== dbParts[0]) issue = 'YEAR MISMATCH';
        
        issues.push({
          staffName: csvRecord.staffName,
          courseName: csvRecord.courseName,
          csvRaw: csvRecord.csvRaw,
          csvDate: csvRecord.csvDate,
          dbDate: dbRecord.dbDate,
          issue,
          expiryDate: dbRecord.expiryDate,
          id: dbRecord.id
        });
      } else {
        correct.push(key);
      }
    }
    
    console.log(`✅ CORRECT DATES: ${correct.length}`);
    console.log(`⚠️  INCORRECT DATES: ${issues.length}\n`);
    
    if (issues.length > 0) {
      console.log('═'.repeat(120) + '\n');
      console.log('🔴 INCORRECT DATES FOUND:\n');
      
      // Group by issue type
      const byIssue = {};
      for (const issue of issues) {
        if (!byIssue[issue.issue]) byIssue[issue.issue] = [];
        byIssue[issue.issue].push(issue);
      }
      
      for (const [issueType, records] of Object.entries(byIssue)) {
        console.log(`\n${issueType} (${records.length} records):`);
        console.log('─'.repeat(120));
        
        for (const rec of records) {
          console.log(`Staff: ${rec.staffName}`);
          console.log(`Course: ${rec.courseName}`);
          console.log(`CSV Raw: ${rec.csvRaw}`);
          console.log(`CSV Parsed: ${rec.csvDate}`);
          console.log(`DB Current: ${rec.dbDate}`);
          console.log(`Expiry: ${rec.expiryDate}`);
          console.log(`ID: ${rec.id}`);
          console.log('');
        }
      }
      
      console.log('\n' + '═'.repeat(120));
      console.log(`SUMMARY: ${issues.length} records need correction\n`);
    } else {
      console.log('✅ ALL DATES ARE CORRECT!\n');
      console.log('═'.repeat(120) + '\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
