import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addDatesToStatusOnly() {
  console.log('\n' + '═'.repeat(120));
  console.log('  ADDING DATES TO ALL STATUS-ONLY RECORDS');
  console.log('═'.repeat(120) + '\n');

  const statuses = ['booked', 'awaiting', 'na'];
  const today = new Date().toISOString().split('T')[0];

  for (const status of statuses) {
    console.log(`${status.toUpperCase()}:`);

    // Get all records without completion dates
    const { data: recordsWithoutDates } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        courses(expiry_months)
      `)
      .eq('status', status)
      .is('completion_date', null);

    console.log(`  Found ${recordsWithoutDates.length} records without completion_date`);

    if (recordsWithoutDates.length === 0) {
      console.log(`  ✓ All ${status} records already have dates\n`);
      continue;
    }

    // Add completion and expiry dates
    let updated = 0;

    for (const record of recordsWithoutDates) {
      let expiryDate = today;
      
      // If course has expiry_months, calculate expiry date
      if (record.courses?.expiry_months) {
        const expiryDateObj = new Date(today);
        expiryDateObj.setMonth(expiryDateObj.getMonth() + record.courses.expiry_months);
        expiryDate = expiryDateObj.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('staff_training_matrix')
        .update({
          completion_date: today,
          expiry_date: expiryDate
        })
        .eq('id', record.id);

      if (!error) {
        updated++;
      }
    }

    console.log(`  ✓ Updated ${updated} records\n`);
  }

  console.log('═'.repeat(120));
  console.log('✅ ALL STATUS-ONLY RECORDS NOW HAVE DATES\n');
}

addDatesToStatusOnly();
