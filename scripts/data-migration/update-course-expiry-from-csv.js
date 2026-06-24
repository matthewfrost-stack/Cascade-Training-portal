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

const csvDir = './csv-import';
const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

console.log('Extracting course expiry information from CSV files...\n');

// Map to store: courseName -> { locationName -> expiryMonths }
const courseExpiryMap = new Map();

files.forEach(file => {
  const filePath = path.join(csvDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const records = parse(content, {
    quote: '"',
    relax_column_count: true
  });

  const locationName = file.replace(' Training Matrix - Staff Matrix.csv', '').trim();
  console.log(`Processing: ${locationName}`);

  // Row 2 has course names
  // Row 4 has validity duration (e.g., "2 Years", "1 Year", "One-off", blank)
  if (records.length > 4) {
    const courseRow = records[2]; // Row with course names
    const expiryRow = records[4]; // Row with "Date valid for" (expiry info)

    if (courseRow && expiryRow) {
      // Start from column 1 (skip Staff Name column 0)
      for (let i = 1; i < courseRow.length; i++) {
        const courseName = (courseRow[i] || '').trim();
        const expiryText = (expiryRow[i] || '').trim();

        if (courseName) {
          // Normalize course name (remove newlines)
          const normalizedCourseName = courseName.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Parse expiry: "2 Years" -> 24, "1 Year" -> 12, "One-off" -> null, blank -> null
          let expiryMonths = null;
          if (expiryText.toLowerCase() === 'one-off' || expiryText === '') {
            expiryMonths = null; // One-off or blank
          } else {
            const match = expiryText.match(/(\d+)\s*(?:year|yr)/i);
            if (match) {
              expiryMonths = parseInt(match[1]) * 12;
            }
          }

          if (!courseExpiryMap.has(normalizedCourseName)) {
            courseExpiryMap.set(normalizedCourseName, {});
          }
          courseExpiryMap.get(normalizedCourseName)[locationName] = {
            months: expiryMonths,
            text: expiryText
          };
        }
      }
    }
  }

  console.log(`  Extracted ${Object.keys(courseExpiryMap).length} courses so far`);
});

console.log(`\n=== EXTRACTED COURSES ===\n`);
console.log(`Total unique courses: ${courseExpiryMap.size}\n`);

// Display summary
let count = 0;
for (const [courseName, locations] of courseExpiryMap.entries()) {
  if (count < 5) {
    console.log(`${courseName}:`);
    for (const [loc, data] of Object.entries(locations)) {
      console.log(`  ${loc}: ${data.text || 'One-off'} (${data.months ? data.months + ' months' : 'null'})`);
    }
    count++;
  }
}

// Now update the courses table with the most common expiry duration for each course
console.log(`\n=== UPDATING DATABASE ===\n`);

async function updateCoursesWithExpiry() {
  try {
    // Get all courses from the database
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, name');

    if (courseError) throw courseError;

    console.log(`Found ${courses.length} courses in database\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const course of courses) {
      // Find matching course in our map (case-insensitive, fuzzy match)
      let matchedCourse = null;
      const courseLower = course.name.toLowerCase();
      
      for (const [csvCourseName] of courseExpiryMap.entries()) {
        if (csvCourseName.toLowerCase() === courseLower) {
          matchedCourse = csvCourseName;
          break;
        }
      }

      if (!matchedCourse) {
        // Try partial match
        for (const [csvCourseName] of courseExpiryMap.entries()) {
          if (courseLower.includes(csvCourseName.toLowerCase()) || csvCourseName.toLowerCase().includes(courseLower)) {
            matchedCourse = csvCourseName;
            break;
          }
        }
      }

      if (matchedCourse) {
        const locationData = courseExpiryMap.get(matchedCourse);
        
        // Find most common expiry duration across locations
        const expiryValues = Object.values(locationData).map(d => d.months);
        const mostCommon = expiryValues.reduce((acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        }, {});
        
        const expiryMonths = Object.keys(mostCommon).reduce((a, b) => 
          mostCommon[a] > mostCommon[b] ? a : b
        );
        
        // Update course
        const { error: updateError } = await supabase
          .from('courses')
          .update({ 
            expiry_months: expiryMonths === 'null' ? null : parseInt(expiryMonths)
          })
          .eq('id', course.id);

        if (updateError) {
          console.error(`❌ Error updating ${course.name}:`, updateError.message);
        } else {
          const expiryText = expiryMonths === 'null' ? 'One-off' : `${parseInt(expiryMonths) / 12} years`;
          console.log(`✅ ${course.name}: ${expiryText}`);
          updatedCount++;
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

await updateCoursesWithExpiry();
