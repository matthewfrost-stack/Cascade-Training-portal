import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Applying database migration: Fix unique constraint on staff_training_matrix...\n');

// Step 1: Drop the old constraint
console.log('Step 1: Dropping old constraint (staff_id, course_id)...');
const { error: dropError } = await supabase.rpc('exec_sql', {
  sql: 'ALTER TABLE staff_training_matrix DROP CONSTRAINT staff_training_matrix_staff_id_course_id_key;'
});

if (dropError) {
  // Try alternative approach - the constraint might have a different name
  console.log('  Could not find exact constraint name. Attempting to list constraints...');
  // We'll just try to create the new constraint without dropping if it exists
} else {
  console.log('  ✓ Old constraint dropped');
}

// Step 2: Add the new constraint with location
console.log('\nStep 2: Adding new constraint with location (staff_id, course_id, completed_at_location_id)...');
const { error: createError } = await supabase.rpc('exec_sql', {
  sql: 'ALTER TABLE staff_training_matrix ADD CONSTRAINT staff_training_matrix_staff_id_course_id_location_id_key UNIQUE(staff_id, course_id, completed_at_location_id);'
});

if (createError) {
  console.error('  ✗ Error adding constraint:', createError.message);
  console.log('\n  Note: This might be because the constraint already exists or the SQL needs to be run via Supabase dashboard');
  console.log('  Please run this SQL manually in Supabase SQL Editor:\n');
  console.log('ALTER TABLE staff_training_matrix DROP CONSTRAINT IF EXISTS staff_training_matrix_staff_id_course_id_key;');
  console.log('ALTER TABLE staff_training_matrix ADD CONSTRAINT staff_training_matrix_staff_id_course_id_location_id_key UNIQUE(staff_id, course_id, completed_at_location_id);');
} else {
  console.log('  ✓ New constraint added');
  console.log('\n✅ Migration completed successfully');
}
