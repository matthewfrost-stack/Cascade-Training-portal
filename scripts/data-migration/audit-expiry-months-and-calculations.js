import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to parse DD/MM/YYYY
function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(p => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(year, month - 1, day);
}

// Helper to add months and return YYYY-MM-DD
function addMonthsToDate(dateStr, months) {
  const date = parseDateString(dateStr);
  if (!date || isNaN(months)) return null;
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, '0');
  const day = String(result.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  EXPIRY MONTHS & CALCULATION AUDIT');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Load database records
  console.log('📊 Loading database records with completion_date...');
  const { data: dbRecords, error: dbError } = await supabase
    .from('staff_training_matrix')
    .select('id, completion_date, expiry_date, expiry_months, course_title, staff_member')
    .not('completion_date', 'is', null)
    .limit(2000);

  if (dbError) {
    console.error('❌ Database error:', dbError);
    return;
  }

  console.log(`✓ Loaded ${dbRecords.length} records with completion_date`);
  console.log('');

  // Audit the calculations
  const issues = [];
  const correct = [];
  const missingExpiry = [];

  for (const record of dbRecords) {
    const { id, completion_date, expiry_date, expiry_months, course_title, staff_member } = record;

    // Check if expiry_months exists
    if (expiry_months === null || expiry_months === undefined) {
      missingExpiry.push({
        id,
        course_title,
        staff_member,
        completion_date,
        expiry_date,
        issue: 'NO EXPIRY_MONTHS SET'
      });
      continue;
    }

    // Calculate what expiry_date SHOULD be
    const expectedExpiry = addMonthsToDate(completion_date, expiry_months);

    // Check if calculation matches
    if (expectedExpiry && expiry_date && expectedExpiry.trim() === expiry_date.trim()) {
      correct.push({ id });
    } else {
      issues.push({
        id,
        course_title,
        staff_member,
        completion_date,
        expiry_months,
        stored_expiry_date: expiry_date,
        calculated_expiry_date: expectedExpiry,
        match: expectedExpiry === expiry_date
      });
    }
  }

  console.log(`✅ CORRECT CALCULATIONS: ${correct.length}`);
  console.log(`❌ INCORRECT CALCULATIONS: ${issues.length}`);
  console.log(`⚠️  MISSING EXPIRY_MONTHS: ${missingExpiry.length}`);
  console.log('');

  if (issues.length > 0) {
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('  INCORRECT CALCULATIONS (Showing first 20):');
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    issues.slice(0, 20).forEach((issue, idx) => {
      console.log(`\n${idx + 1}. ${issue.course_title} | ${issue.staff_member}`);
      console.log(`   Completion Date: ${issue.completion_date}`);
      console.log(`   Expiry Months: ${issue.expiry_months}`);
      console.log(`   Stored in DB: ${issue.stored_expiry_date}`);
      console.log(`   Should Be: ${issue.calculated_expiry_date}`);
    });
  }

  if (missingExpiry.length > 0) {
    console.log('');
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('  RECORDS WITH NO EXPIRY_MONTHS (Showing first 10):');
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    missingExpiry.slice(0, 10).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.course_title} | ${record.staff_member}`);
      console.log(`   Completion Date: ${record.completion_date}`);
      console.log(`   Expiry Date in DB: ${record.expiry_date}`);
    });
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`Total records checked: ${dbRecords.length}`);
  console.log(`Correct: ${correct.length} (${((correct.length / dbRecords.length) * 100).toFixed(1)}%)`);
  console.log(`Incorrect: ${issues.length}`);
  console.log(`Missing expiry_months: ${missingExpiry.length}`);
  console.log('');

  if (issues.length === 0 && missingExpiry.length === 0) {
    console.log('✅ ALL EXPIRY MONTHS AND CALCULATIONS ARE CORRECT!');
  } else {
    console.log('⚠️  Issues found - see details above');
  }
}

main().catch(console.error);
