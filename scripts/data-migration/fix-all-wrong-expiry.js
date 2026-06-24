import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAllWrongExpiry() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FIXING ALL WRONG EXPIRY DATES');
  console.log('═'.repeat(120) + '\n');

  // Get ALL records with completion dates and courses
  const pageSize = 1000;
  const allRecords = [];
  let page = 0;
  let hasMore = true;

  console.log(`Fetching all records with completion_date...\n`);

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        expiry_date,
        courses(id, name, expiry_months)
      `)
      .not('completion_date', 'is', null)
      .range(from, to);

    if (!records || records.length === 0) {
      hasMore = false;
    } else {
      allRecords.push(...records);
      page++;
    }
  }

  console.log(`✓ Fetched ${allRecords.length} records\n`);

  // Identify wrong records
  const toUpdate = [];

  allRecords.forEach(record => {
    if (record.completion_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const calcExpiryDate = new Date(completionDate);
      calcExpiryDate.setMonth(calcExpiryDate.getMonth() + record.courses.expiry_months);
      const calcExpiryStr = calcExpiryDate.toISOString().split('T')[0];

      if (calcExpiryStr !== record.expiry_date) {
        toUpdate.push({
          id: record.id,
          newExpiryDate: calcExpiryStr,
          oldExpiryDate: record.expiry_date,
          course: record.courses.name,
          months: record.courses.expiry_months
        });
      }
    }
  });

  console.log(`Found ${toUpdate.length} records to update\n`);

  // Group by change type
  const byChange = {};
  toUpdate.forEach(rec => {
    const oldDate = new Date(rec.oldExpiryDate);
    const newDate = new Date(rec.newExpiryDate);
    const diffDays = Math.round((newDate - oldDate) / (1000 * 60 * 60 * 24));
    const diffYears = Math.round(diffDays / 365);
    
    const key = `${diffDays > 0 ? '+' : ''}${diffDays} days (${diffYears > 0 ? '+' : ''}${diffYears} years)`;
    if (!byChange[key]) byChange[key] = [];
    byChange[key].push(rec);
  });

  console.log('Changes to make:\n');
  for (const [change, records] of Object.entries(byChange)) {
    console.log(`${change}: ${records.length} records`);
  }
  console.log('');

  // Apply all updates
  console.log('═'.repeat(120));
  console.log('APPLYING UPDATES:\n');

  let updated = 0;
  const batchSize = 100;

  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = toUpdate.slice(i, i + batchSize);
    
    for (const record of batch) {
      const { error } = await supabase
        .from('staff_training_matrix')
        .update({ expiry_date: record.newExpiryDate })
        .eq('id', record.id);

      if (!error) {
        updated++;
      }
    }

    console.log(`  Updated ${Math.min(updated, i + batchSize)}/${toUpdate.length}`);
  }

  console.log(`\n✓ Successfully updated ${updated}/${toUpdate.length} records\n`);

  console.log('═'.repeat(120));
  console.log('✅ ALL EXPIRY DATES FIXED\n');
}

fixAllWrongExpiry();
