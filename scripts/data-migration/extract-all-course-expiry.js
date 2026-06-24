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

async function extractAllCourseExpiry() {
  console.log('Extracting ALL course expiry data from CSV files (including One-off)...\n');

  try {
    const csvDir = './csv-import';
    const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

    // Map: courseName -> { "One-off" | "X Years" | "X Year" | "Blank" }
    const courseExpiryMap = new Map();

    files.forEach(file => {
      const filePath = path.join(csvDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const records = parse(content, {
        quote: '"',
        relax_column_count: true
      });

      // Row 2 has course names, Row 4 has expiry info
      if (records.length > 4) {
        const courseRow = records[2];
        const expiryRow = records[4];

        if (courseRow && expiryRow) {
          for (let i = 1; i < courseRow.length; i++) {
            const courseName = (courseRow[i] || '').trim();
            const expiryText = (expiryRow[i] || '').trim();

            if (courseName) {
              const normalizedCourseName = courseName.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
              
              if (!courseExpiryMap.has(normalizedCourseName)) {
                courseExpiryMap.set(normalizedCourseName, []);
              }
              
              courseExpiryMap.get(normalizedCourseName).push({
                expiryText,
                location: file.replace(' Training Matrix - Staff Matrix.csv', '').trim()
              });
            }
          }
        }
      }
    });

    console.log(`Extracted ${courseExpiryMap.size} unique courses from CSV\n`);

    // Get all courses from database
    const { data: dbCourses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    console.log(`Found ${dbCourses.length} courses in database\n`);
    console.log('=== UPDATING COURSES WITH MISSING EXPIRY DATA ===\n');

    let updatedCount = 0;
    let skippedCount = 0;

    for (const dbCourse of dbCourses) {
      // Skip if already has expiry_months
      if (dbCourse.expiry_months !== null) {
        continue;
      }

      // Try to find matching CSV course
      let foundExpiry = null;
      const dbCourseLower = dbCourse.name.toLowerCase();

      // Exact match
      for (const [csvCourseName, expiryList] of courseExpiryMap.entries()) {
        if (csvCourseName.toLowerCase() === dbCourseLower) {
          // Get most common expiry value
          const expiryTexts = expiryList.map(e => e.expiryText);
          const textCounts = {};
          expiryTexts.forEach(text => {
            textCounts[text] = (textCounts[text] || 0) + 1;
          });
          
          const mostCommonText = Object.keys(textCounts).reduce((a, b) =>
            textCounts[a] > textCounts[b] ? a : b
          );

          foundExpiry = mostCommonText;
          break;
        }
      }

      // Partial match if no exact match
      if (!foundExpiry) {
        for (const [csvCourseName, expiryList] of courseExpiryMap.entries()) {
          if (dbCourseLower.includes(csvCourseName.toLowerCase()) || 
              csvCourseName.toLowerCase().includes(dbCourseLower)) {
            const expiryTexts = expiryList.map(e => e.expiryText);
            const textCounts = {};
            expiryTexts.forEach(text => {
              textCounts[text] = (textCounts[text] || 0) + 1;
            });
            
            const mostCommonText = Object.keys(textCounts).reduce((a, b) =>
              textCounts[a] > textCounts[b] ? a : b
            );

            foundExpiry = mostCommonText;
            break;
          }
        }
      }

      if (foundExpiry) {
        let expiryMonths = null;

        // Parse the expiry text
        if (foundExpiry.toLowerCase() === 'one-off' || foundExpiry === '' || foundExpiry === 'Blank') {
          expiryMonths = null; // One-off / no expiry
        } else {
          const match = foundExpiry.match(/(\d+)\s*(?:year|yr)/i);
          if (match) {
            expiryMonths = parseInt(match[1]) * 12;
          }
        }

        // Update database
        const { error } = await supabase
          .from('courses')
          .update({ expiry_months: expiryMonths })
          .eq('id', dbCourse.id);

        if (!error) {
          const displayText = expiryMonths === null ? 'One-off' : `${expiryMonths / 12} years`;
          console.log(`✅ ${dbCourse.name}: ${displayText}`);
          updatedCount++;
        } else {
          console.error(`❌ ${dbCourse.name}: ${error.message}`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (no CSV match): ${skippedCount}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

extractAllCourseExpiry();
