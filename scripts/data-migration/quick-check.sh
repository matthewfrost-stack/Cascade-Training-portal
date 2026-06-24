#!/bin/bash
export NEXT_PUBLIC_SUPABASE_URL=https://ykrmrwgnbuigdzodnliw.supabase.co
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrcm1yd2duYnVpZ2R6b2RubGl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDgzMCwiZXhwIjoyMDg0MDM2ODMwfQ.wlJhJ4dN1y94WgLoiBU0pWvqf0AkdW06XE7jtU_1Rcc"

node --input-type=module << 'EONODE'
import { createClient } from '@supabase/supabase-js';

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
console.log(`\nChecking location: ${loc.name}\n`);

// Check how many courses are in database for this location
const { data: allRecords, error: err1 } = await supabase
  .from('staff_training_matrix')
  .select('course_name')
  .eq('location_id', loc.id);

if (err1) {
  console.error('Error fetching records:', err1);
  process.exit(1);
}

const uniqueCourses = [...new Set((allRecords || []).map(r => r.course_name))].sort();
console.log(`Database has ${uniqueCourses.length} unique courses:`);
uniqueCourses.slice(0, 15).forEach((c, i) => console.log(`  ${i+1}. ${c}`));
if (uniqueCourses.length > 15) console.log(`  ... and ${uniqueCourses.length - 15} more`);

// Check total records
console.log(`\nTotal staff_training_matrix records for ${loc.name}: ${(allRecords || []).length}`);

// Check staff count
const { data: staffRecs } = await supabase
  .from('staff_training_matrix')
  .select('profile_id')
  .eq('location_id', loc.id);

const uniqueStaff = [...new Set((staffRecs || []).map(r => r.profile_id))];
console.log(`Total staff members: ${uniqueStaff.length}`);
console.log(`Expected records (staff × courses): ${uniqueStaff.length} × ${uniqueCourses.length} = ${uniqueStaff.length * uniqueCourses.length}`);
console.log(`Actual records: ${(allRecords || []).length}`);
console.log(`Gap: ${(uniqueStaff.length * uniqueCourses.length) - (allRecords || []).length} records missing`);

EONODE
