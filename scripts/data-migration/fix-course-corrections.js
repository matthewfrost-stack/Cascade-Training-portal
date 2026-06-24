import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCourseExpiry() {
  console.log('\n' + '═'.repeat(100));
  console.log('  FIXING COURSE EXPIRY MONTHS');
  console.log('═'.repeat(100) + '\n');

  const corrections = [
    { name: 'Medication Classroom', newMonths: 24, description: '2 years' },
    { name: 'Team Teach\nPositive Behaviour \nTraining Level 2', newMonths: 12, description: '1 year' },
    { name: 'Fire Safety Training', newMonths: 36, description: '36 months' }
  ];

  // Get all courses to find the exact names
  const { data: allCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months');

  const updates = [];

  for (const correction of corrections) {
    // Find exact course (handle potential whitespace/newline differences)
    const course = allCourses.find(c => 
      c.name.trim().replace(/\s+/g, ' ') === correction.name.trim().replace(/\s+/g, ' ')
    );

    if (course) {
      const oldDisplay = course.expiry_months === null ? 'NULL' : `${course.expiry_months}m`;
      const newDisplay = `${correction.newMonths}m`;

      console.log(`${course.name.trim()}`);
      console.log(`  ${oldDisplay} → ${newDisplay} (${correction.description})\n`);

      updates.push({
        id: course.id,
        name: course.name,
        oldMonths: course.expiry_months,
        newMonths: correction.newMonths
      });
    } else {
      console.log(`⚠️ Could not find: ${correction.name}\n`);
    }
  }

  // Apply updates
  console.log('═'.repeat(100));
  console.log('SAVING UPDATES:\n');

  let saved = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from('courses')
      .update({ expiry_months: update.newMonths })
      .eq('id', update.id);

    if (!error) {
      saved++;
      const oldDisplay = update.oldMonths === null ? 'NULL' : `${update.oldMonths}m`;
      const newDisplay = `${update.newMonths}m`;
      console.log(`✓ ${update.name.trim()}: ${oldDisplay} → ${newDisplay}`);
    }
  }

  console.log(`\n✓ Saved ${saved}/${updates.length} courses\n`);

  // Recalculate all expiry dates
  console.log('═'.repeat(100));
  console.log('RECALCULATING EXPIRY DATES:\n');

  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, courses(name, expiry_months)')
    .not('completion_date', 'is', null);

  const updatedCourseIds = new Set(updates.map(u => u.id));
  let recalculated = 0;

  for (const record of allRecords) {
    // Only recalculate for courses we updated
    if (!updatedCourseIds.has(record.course_id)) continue;

    if (record.completion_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const expiryDate = new Date(completionDate);
      expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      if (expiryDateStr !== record.expiry_date) {
        const { error } = await supabase
          .from('staff_training_matrix')
          .update({ expiry_date: expiryDateStr })
          .eq('id', record.id);

        if (!error) {
          recalculated++;
        }
      }
    }
  }

  console.log(`✓ Recalculated ${recalculated} expiry dates\n`);

  console.log('═'.repeat(100));
  console.log('✅ ALL CORRECTIONS APPLIED\n');
}

fixCourseExpiry();
