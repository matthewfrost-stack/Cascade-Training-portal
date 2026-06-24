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

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  // Assume DD/MM/YYYY format
  const date = new Date(year, month - 1, day);
  return date.toISOString().split('T')[0];
}

async function resyncFromCSV() {
  console.log('\n' + '═'.repeat(120));
  console.log('  RE-SYNCING DATA FROM CSV FILES (SOURCE OF TRUTH)');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  console.log(`Processing ${csvFiles.length} CSV files...\n`);

  // Track all updates needed
  const updates = {
    coursesNeedOrdering: [],
    recordsToUpdate: [],
    recordsToSetNA: []
  };

  // Process each location's CSV
  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;

    console.log(`Processing: ${location}`);

    try {
      const content = fs.readFileSync(path.join(CSV_FOLDER, csvFile), 'utf-8');
      const records = parse(content);

      // Find key rows
      let staffNameRow = -1;
      let dateValidRow = -1;

      for (let i = 0; i < Math.min(10, records.length); i++) {
        if (records[i][0] === 'Staff Name') {
          staffNameRow = i;
        }
        if (records[i][0] && records[i][0].includes('Date valid for')) {
          dateValidRow = i;
        }
      }

      if (staffNameRow < 0) {
        console.log(`  ⚠️ No "Staff Name" row found\n`);
        continue;
      }

      // Extract course names and order
      const courseNames = records[staffNameRow].slice(1).filter((c, idx) => {
        return c && c.trim().length > 0;
      });

      // Extract expiry durations
      const expiryDurations = {};
      if (dateValidRow >= 0) {
        const durationStrs = records[dateValidRow].slice(1);
        for (let i = 0; i < courseNames.length && i < durationStrs.length; i++) {
          const courseName = courseNames[i].trim();
          const durationStr = (durationStrs[i] || '').trim();
          expiryDurations[courseName] = durationStr;
        }
      }

      console.log(`  ✓ Found ${courseNames.length} courses`);
      console.log(`  ✓ Found expiry info for ${Object.keys(expiryDurations).length} courses\n`);

    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }
  }

  console.log('═'.repeat(120));
  console.log('\nThis requires a full data re-import from CSVs.');
  console.log('Would you like me to proceed with complete re-sync?\n');
  console.log('═'.repeat(120) + '\n');
}

resyncFromCSV();
