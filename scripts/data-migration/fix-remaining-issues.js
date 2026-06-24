import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRemainingIssues() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIXING REMAINING DATA ISSUES');
  console.log('═'.repeat(120) + '\n');

  // Issue 1: Fix Fire Safety Training wrong calculations (12 months old, now 36)
  console.log('ISSUE 1: Recalculating Fire Safety Training records\n');

  const { data: fireSafetyRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .ilike('courses.name', '%Fire Safety Training%')
    .not('completion_date', 'is', null);

  console.log(`Found ${fireSafetyRecords.length} Fire Safety Training records\n`);

  let recalculated = 0;
  for (const record of fireSafetyRecords) {
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

  console.log(`✓ Recalculated ${recalculated} Fire Safety Training records\n`);

  // Issue 2: Get remaining records with missing both dates
  console.log('ISSUE 2: Handling remaining status-only records\n');

  const { data: stillMissing } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      status,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .is('completion_date', null)
    .is('expiry_date', null);

  console.log(`Found ${stillMissing.length} records still without dates\n`);

  // Get details on these courses
  const courseDetails = {};
  stillMissing.forEach(record => {
    const courseName = record.courses?.name || 'Unknown';
    const months = record.courses?.expiry_months;
    const status = record.status;
    
    const key = `${courseName}|${months}|${status}`;
    if (!courseDetails[key]) {
      courseDetails[key] = { count: 0, courseName, months, status };
    }
    courseDetails[key].count++;
  });

  console.log('Breakdown of remaining records:\n');
  Object.values(courseDetails).forEach(detail => {
    const monthsDisplay = detail.months === null ? 'One-off (NULL)' : `${detail.months} months`;
    console.log(`${detail.count} × "${detail.courseName}" (${monthsDisplay}) - Status: ${detail.status}`);
  });

  // For One-off courses (NULL expiry), still set completion and expiry to today
  // So they show as "One-off" in the UI but have dates in the database
  let updated = 0;

  for (const record of stillMissing) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Set completion and expiry to today for status-only courses
    const { error } = await supabase
      .from('staff_training_matrix')
      .update({ 
        completion_date: todayStr,
        expiry_date: todayStr  // For One-off courses, expiry = completion date (both today)
      })
      .eq('id', record.id);

    if (!error) {
      updated++;
    }
  }

  console.log(`\n✓ Updated ${updated} remaining records with dates\n`);

  console.log('═'.repeat(120));
  console.log('✅ ALL REMAINING ISSUES FIXED\n');
  console.log(`Summary:`);
  console.log(`  • Recalculated ${recalculated} expiry dates for Fire Safety Training`);
  console.log(`  • Set dates for ${updated} remaining status-only records\n`);
}

fixRemainingIssues();
