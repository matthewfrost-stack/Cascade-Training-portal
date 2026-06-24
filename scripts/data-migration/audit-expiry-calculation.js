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
  console.log('  EXPIRY DATE CALCULATION AUDIT');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Load staff_training_matrix records with courses
  console.log('📊 Loading staff_training_matrix with course details...');
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

  const issues = [];
  const correct = [];

  for (const record of records) {
    const { id, completion_date, expiry_date, courses, profiles } = record;
    
    if (!courses || !courses.expiry_months) continue;

    const expected = addMonthsToISODate(completion_date, courses.expiry_months);
    const stored = expiry_date ? expiry_date.trim() : null;
    const exp = expected ? expected.trim() : null;

    if (exp === stored) {
      correct.push({ id });
    } else {
      issues.push({
        id,
        course: courses?.name || 'Unknown',
        staff: profiles?.full_name || 'Unknown',
        completion_date,
        expiry_months: courses?.expiry_months,
        stored_expiry: stored,
        calculated_expiry: exp,
        match: exp === stored
      });
    }
  }

  console.log(`✅ CORRECT: ${correct.length}`);
  console.log(`❌ INCORRECT: ${issues.length}`);
  console.log('');

  if (issues.length > 0) {
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('  INCORRECT CALCULATIONS (Showing first 30):');
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('');
    issues.slice(0, 30).forEach((issue, idx) => {
      console.log(`${idx + 1}. ${issue.course} | ${issue.staff}`);
      console.log(`   Completion: ${issue.completion_date} + ${issue.expiry_months} months`);
      console.log(`   Stored:     ${issue.stored_expiry}`);
      console.log(`   Should be:  ${issue.calculated_expiry}`);
      console.log('');
    });

    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('  ISSUES SUMMARY');
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    
    // Group by issue type
    const issuesByMonth = issues.filter(i => {
      const storedMonth = i.stored_expiry?.substring(5, 7);
      const calcMonth = i.calculated_expiry?.substring(5, 7);
      return storedMonth !== calcMonth;
    });

    const issuesByYear = issues.filter(i => {
      const storedYear = i.stored_expiry?.substring(0, 4);
      const calcYear = i.calculated_expiry?.substring(0, 4);
      return storedYear !== calcYear;
    });

    const issuesByDay = issues.filter(i => {
      const storedDay = i.stored_expiry?.substring(8, 10);
      const calcDay = i.calculated_expiry?.substring(8, 10);
      return storedDay !== calcDay;
    });

    console.log(`Month mismatches: ${issuesByMonth.length}`);
    console.log(`Year mismatches:  ${issuesByYear.length}`);
    console.log(`Day mismatches:   ${issuesByDay.length}`);
  } else {
    console.log('✅ ALL EXPIRY DATES ARE CORRECTLY CALCULATED!');
  }
}

main().catch(console.error);
