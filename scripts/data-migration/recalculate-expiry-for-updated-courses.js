import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to add months to a date string (YYYY-MM-DD)
function addMonthsToISODate(isoDateStr, months) {
  if (!isoDateStr || isNaN(months)) return null;
  const date = new Date(isoDateStr);
  if (isNaN(date.getTime())) return null;
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, '0');
  const day = String(result.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  RECALCULATE EXPIRY DATES FOR RECENTLY UPDATED COURSES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all staff_training_matrix records where course expiry_months is now set
  // and completion_date exists but expiry_date is null or wrong
  console.log('Loading records where expiry_date needs to be calculated...');
  
  const { data: records, error } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      completion_date,
      expiry_date,
      courses(id, name, expiry_months),
      profiles(full_name)
    `)
    .not('completion_date', 'is', null)
    .limit(2000);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Loaded ${records.length} records\n`);

  // Find records that need expiry_date calculation
  const toUpdate = [];

  for (const record of records) {
    if (!record.courses || !record.courses.expiry_months || !record.completion_date) {
      continue;
    }

    const expected = addMonthsToISODate(record.completion_date, record.courses.expiry_months);
    const stored = record.expiry_date ? record.expiry_date.trim() : null;
    const exp = expected ? expected.trim() : null;

    // If the calculated value doesn't match stored value, update it
    if (exp && stored !== exp) {
      toUpdate.push({
        id: record.id,
        course: record.courses.name,
        staff: record.profiles?.full_name,
        old_expiry: stored,
        new_expiry: exp
      });
    }
  }

  console.log(`Found ${toUpdate.length} records needing expiry_date updates\n`);

  if (toUpdate.length === 0) {
    console.log('✅ All expiry dates are correct!');
    return;
  }

  console.log('🔧 Updating expiry dates...');
  let updated = 0;

  for (const item of toUpdate) {
    const { error } = await supabase
      .from('staff_training_matrix')
      .update({ expiry_date: item.new_expiry })
      .eq('id', item.id);

    if (error) {
      console.error(`❌ Failed to update ID ${item.id}: ${error.message}`);
    } else {
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated}/${toUpdate.length}...`);
      }
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`✅ UPDATED: ${updated} expiry dates`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Sample of updated records:');
  toUpdate.slice(0, 10).forEach((item, idx) => {
    console.log(`\n${idx + 1}. ${item.course} | ${item.staff}`);
    console.log(`   Old: ${item.old_expiry}`);
    console.log(`   New: ${item.new_expiry}`);
  });
}

main().catch(console.error);
