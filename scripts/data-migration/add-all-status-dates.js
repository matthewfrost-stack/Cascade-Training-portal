import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addAllStatusOnlyDates() {
  console.log('\n' + '═'.repeat(120));
  console.log('  ADDING DATES TO ALL REMAINING STATUS-ONLY RECORDS');
  console.log('═'.repeat(120) + '\n');

  const today = new Date().toISOString().split('T')[0];

  // Get ALL records without completion dates (any status)
  const { data: allWithoutDates } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      status,
      courses(expiry_months)
    `)
    .is('completion_date', null);

  console.log(`Found ${allWithoutDates.length} total records without completion_date\n`);

  // Group by status
  const byStatus = {};
  allWithoutDates.forEach(rec => {
    if (!byStatus[rec.status]) byStatus[rec.status] = [];
    byStatus[rec.status].push(rec);
  });

  // Update each group
  let totalUpdated = 0;

  for (const [status, records] of Object.entries(byStatus)) {
    console.log(`Updating ${status}: ${records.length} records`);

    let updated = 0;
    for (const record of records) {
      let expiryDate = today;
      
      // If course has expiry_months, calculate expiry date
      if (record.courses?.expiry_months) {
        const expiryDateObj = new Date(today);
        expiryDateObj.setMonth(expiryDateObj.getMonth() + record.courses.expiry_months);
        expiryDate = expiryDateObj.toISOString().split('T')[0];
      }
      // If NULL (One-off), set expiry = completion (today)

      const { error } = await supabase
        .from('staff_training_matrix')
        .update({
          completion_date: today,
          expiry_date: expiryDate
        })
        .eq('id', record.id);

      if (!error) {
        updated++;
        totalUpdated++;
      }
    }
    console.log(`✓ Updated ${updated}\n`);
  }

  console.log('═'.repeat(120));
  console.log(`✅ UPDATED ${totalUpdated} RECORDS WITH DATES\n`);
}

addAllStatusOnlyDates();
