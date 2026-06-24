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
  console.log('  FIX ALL INCORRECT EXPIRY DATES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Load staff_training_matrix records with courses
  console.log('📊 Loading all staff_training_matrix records...');
  const { data: records, error: error1 } = await supabase
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

  if (error1) {
    console.error('❌ Error loading records:', error1);
    return;
  }

  console.log(`✓ Loaded ${records.length} records\n`);

  const toFix = [];

  // Identify all incorrect ones
  for (const record of records) {
    const { id, completion_date, expiry_date, courses, profiles } = record;
    
    if (!courses || !courses.expiry_months) continue;

    const expected = addMonthsToISODate(completion_date, courses.expiry_months);
    const stored = expiry_date ? expiry_date.trim() : null;
    const exp = expected ? expected.trim() : null;

    if (exp !== stored) {
      toFix.push({
        id,
        course: courses?.name || 'Unknown',
        staff: profiles?.full_name || 'Unknown',
        old_expiry: stored,
        new_expiry: exp
      });
    }
  }

  console.log(`Found ${toFix.length} records to fix\n`);

  if (toFix.length === 0) {
    console.log('✅ All expiry dates are correct!');
    return;
  }

  // Fix them in batches
  console.log('🔧 Fixing expiry dates...');
  let fixed = 0;
  let failed = 0;

  for (const item of toFix) {
    const { error } = await supabase
      .from('staff_training_matrix')
      .update({ expiry_date: item.new_expiry })
      .eq('id', item.id);

    if (error) {
      console.error(`❌ Failed to fix ID ${item.id}: ${error.message}`);
      failed++;
    } else {
      fixed++;
      if (fixed % 20 === 0) {
        console.log(`  Fixed ${fixed}/${toFix.length}...`);
      }
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${toFix.length}`);
  console.log('');

  if (failed === 0 && fixed > 0) {
    console.log('✅ ALL EXPIRY DATES SUCCESSFULLY CORRECTED!');
    console.log('');
    console.log('Sample of corrected records:');
    toFix.slice(0, 10).forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.course} | ${item.staff}`);
      console.log(`   Old: ${item.old_expiry}`);
      console.log(`   New: ${item.new_expiry}`);
    });
  }
}

main().catch(console.error);
