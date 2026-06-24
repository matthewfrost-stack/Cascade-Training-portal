#!/bin/bash
export NEXT_PUBLIC_SUPABASE_URL=https://ykrmrwgnbuigdzodnliw.supabase.co
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrcm1yd2duYnVpZ2R6b2RubGl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDgzMCwiZXhwIjoyMDg0MDM2ODMwfQ.wlJhJ4dN1y94WgLoiBU0pWvqf0AkdW06XE7jtU_1Rcc"

node --input-type=module << 'EONODE'
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get first location
const { data: locations } = await supabase
  .from('locations')
  .select('id, name')
  .order('name')
  .limit(1);

const loc = locations[0];
console.log(`\n📊 ANALYZING: ${loc.name}\n`);

// Load CSV for this location
const csvPath = `/Users/matthewfrost/training-portal/csv-import/${loc.name}.csv`;
console.log(`CSV Path: ${csvPath}`);
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvRecords = parse(csvContent, { skip_empty_lines: true });

// Extract courses from CSV (row 2, 0-indexed row 1)
const csvCourseRow = csvRecords[1];
const csvCourses = csvCourseRow.slice(1).map(c => c.trim()).filter(c => c);
console.log(`\n✅ CSV File:`);
console.log(`   Row 2 has ${csvCourses.length} courses`);
console.log(`   First 10: ${csvCourses.slice(0, 10).join(', ')}`);

// Get database info
const { data: allStaffTraining } = await supabase
  .from('staff_training_matrix')
  .select('staff_id, course_id, completion_date')
  .eq('completed_at_location_id', loc.id);

// Get unique courses in DB
const dbCourseSet = new Set();
const coursesWithDates = new Set();
const coursesWithoutDates = new Set();

allStaffTraining?.forEach(rec => {
  dbCourseSet.add(rec.course_id);
  if (rec.completion_date) {
    coursesWithDates.add(rec.course_id);
  } else {
    coursesWithoutDates.add(rec.course_id);
  }
});

console.log(`\n📊 Database State:`);
console.log(`   Total records: ${allStaffTraining?.length || 0}`);
console.log(`   Unique courses: ${dbCourseSet.size}`);
console.log(`   Courses with dates: ${coursesWithDates.size}`);
console.log(`   Courses without dates: ${coursesWithoutDates.size}`);

// Get course details
const { data: courseList } = await supabase
  .from('courses')
  .select('id, name')
  .in('id', Array.from(dbCourseSet));

const courseMap = {};
courseList?.forEach(c => {
  courseMap[c.id] = c.name;
});

// Get staff list
const { data: staffList } = await supabase
  .from('staff_locations')
  .select('staff_id, profiles(full_name)')
  .eq('location_id', loc.id);

const staffCount = staffList?.length || 0;
console.log(`   Staff members: ${staffCount}`);
console.log(`   Expected records (staff × courses): ${staffCount} × ${csvCourses.length} = ${staffCount * csvCourses.length}`);
console.log(`   ⚠️  ACTUAL records: ${allStaffTraining?.length || 0}`);

const expectedPerStaff = csvCourses.length;
const actualPerStaffAvg = staffCount > 0 ? Math.round((allStaffTraining?.length || 0) / staffCount) : 0;

console.log(`   ⚠️  Expected per staff: ${expectedPerStaff}, Actual avg: ${actualPerStaffAvg}`);

if (actualPerStaffAvg < expectedPerStaff) {
  console.log(`   ❌ MISSING ${expectedPerStaff - actualPerStaffAvg} courses per staff!`);
}

// Check if specific staff is missing courses
if (staffList && staffList.length > 0) {
  const firstStaff = staffList[0];
  const staffName = firstStaff.profiles?.full_name || 'Unknown';
  
  const { data: staffCourses } = await supabase
    .from('staff_training_matrix')
    .select('course_id')
    .eq('completed_at_location_id', loc.id)
    .eq('staff_id', firstStaff.staff_id);
  
  console.log(`\n🔍 Sample Staff: ${staffName}`);
  console.log(`   Records in DB: ${staffCourses?.length || 0} (expected: ${csvCourses.length})`);
  
  if ((staffCourses?.length || 0) < csvCourses.length) {
    const haveRecords = new Set(staffCourses?.map(s => s.course_id) || []);
    const missingCourseIds = Array.from(dbCourseSet).filter(id => !haveRecords.has(id));
    
    console.log(`   ❌ Missing ${missingCourseIds.length} courses:`);
    missingCourseIds.slice(0, 5).forEach(id => {
      console.log(`      - ${courseMap[id] || id}`);
    });
    if (missingCourseIds.length > 5) {
      console.log(`      ... and ${missingCourseIds.length - 5} more`);
    }
  }
}

console.log('\n');

EONODE
