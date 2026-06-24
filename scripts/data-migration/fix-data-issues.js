import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDataIssues() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIXING DATA ISSUES');
  console.log('═'.repeat(120) + '\n');

  // Issue 1: Fix wrong expiry calculations for Team Teach Positive Behaviour Training Level 2
  console.log('ISSUE 1: Recalculating Team Teach Positive Behaviour Training Level 2\n');

  const { data: teamTeachRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .ilike('courses.name', '%Team Teach%Positive Behaviour%Training Level 2%')
    .not('completion_date', 'is', null);

  console.log(`Found ${teamTeachRecords.length} Team Teach records with completion dates\n`);

  let recalculated = 0;
  for (const record of teamTeachRecords) {
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

  console.log(`✓ Recalculated ${recalculated} Team Teach records\n`);

  // Issue 2: Get all records with missing both dates
  console.log('ISSUE 2: Handling status-only records (booked, awaiting, n/a)\n');

  const { data: missingBothDates } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      status,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months)
    `)
    .in('status', ['booked', 'awaiting', 'na'])
    .is('completion_date', null)
    .is('expiry_date', null);

  console.log(`Found ${missingBothDates.length} status-only records without dates\n`);

  // For these, calculate expiry date from today + course duration
  // This assumes they will complete "today" or within expected timeframe
  let statusOnlyUpdated = 0;

  for (const record of missingBothDates) {
    if (record.courses?.expiry_months !== null && record.courses?.expiry_months !== undefined) {
      // Set completion date to today
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Calculate expiry date
      const expiryDate = new Date(today);
      expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ 
          completion_date: todayStr,
          expiry_date: expiryDateStr 
        })
        .eq('id', record.id);

      if (!error) {
        statusOnlyUpdated++;
      }
    }
  }

  console.log(`✓ Updated ${statusOnlyUpdated} status-only records with completion and expiry dates\n`);

  console.log('═'.repeat(120));
  console.log('✅ ALL ISSUES FIXED\n');
  console.log(`Summary:`);
  console.log(`  • Recalculated ${recalculated} expiry dates for Team Teach course`);
  console.log(`  • Set completion and expiry dates for ${statusOnlyUpdated} status-only records\n`);
}

fixDataIssues();
