import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDuplicateAndAdjustments() {
  console.log('\n' + '═'.repeat(100));
  console.log('  FIXING DUPLICATE AND USER ADJUSTMENTS');
  console.log('═'.repeat(100) + '\n');

  // First, find the duplicate "Team Teach Positive Behaviour Training Level 2"
  const { data: teamTeachCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .ilike('name', '%Team Teach%Positive Behaviour%Training Level 2%');

  console.log('Found Team Teach Positive Behaviour Training Level 2 entries:');
  teamTeachCourses.forEach(course => {
    const months = course.expiry_months === null ? 'NULL' : `${course.expiry_months}m`;
    console.log(`  ID: ${course.id} | Expiry: ${months}`);
  });

  if (teamTeachCourses.length > 1) {
    console.log('\n⚠️ Found duplicate! Keeping 12m version, deleting 24m version...\n');

    const toDelete = teamTeachCourses.find(c => c.expiry_months === 24);
    const toKeep = teamTeachCourses.find(c => c.expiry_months === 12);

    if (toDelete) {
      console.log(`Deleting duplicate with ID ${toDelete.id} (24m version)...`);
      
      // First, get all staff records pointing to this course
      const { data: recordsToMove } = await supabase
        .from('staff_training_matrix')
        .select('id, course_id')
        .eq('course_id', toDelete.id);

      if (recordsToMove.length > 0) {
        console.log(`Found ${recordsToMove.length} records pointing to the 24m version`);
        console.log(`Updating them to point to the 12m version (ID: ${toKeep.id})...\n`);

        // Update all records to point to the correct course
        const { error: updateError } = await supabase
          .from('staff_training_matrix')
          .update({ course_id: toKeep.id })
          .eq('course_id', toDelete.id);

        if (!updateError) {
          console.log(`✓ Updated ${recordsToMove.length} records\n`);
        }
      }

      // Delete the duplicate course
      const { error: deleteError } = await supabase
        .from('courses')
        .delete()
        .eq('id', toDelete.id);

      if (!deleteError) {
        console.log(`✓ Deleted duplicate course (ID: ${toDelete.id})\n`);
      }
    }
  }

  console.log('═'.repeat(100));
  console.log('NEXT STEPS:\n');
  console.log('Please tell me which OTHER courses you manually adjusted.');
  console.log('I need to know:');
  console.log('  1. Course name');
  console.log('  2. What you changed it TO (the correct value in months or years)\n');
  console.log('Examples:');
  console.log('  - "Grievance Refresher" should be 36 months (not 12)');
  console.log('  - "Disciplinary Workshop" should be 24 months (not 36)');
  console.log('\nOnce you provide the list, I\'ll update all of them at once.\n');
  console.log('═'.repeat(100) + '\n');
}

fixDuplicateAndAdjustments();
