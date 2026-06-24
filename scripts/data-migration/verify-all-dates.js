import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function comprehensiveVerification() {
  console.log('\n' + '═'.repeat(120));
  console.log('  COMPREHENSIVE DATA VERIFICATION');
  console.log('═'.repeat(120) + '\n');

  // Get all training records with all relevant data
  const { data: allRecords, error } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      status,
      completion_date,
      expiry_date,
      course_id,
      staff_id,
      courses(id, name, expiry_months),
      profiles(full_name)
    `);

  if (error) {
    console.error('Error fetching records:', error.message);
    return;
  }

  console.log(`Total records: ${allRecords.length}\n`);

  // Analyze data
  const byStatus = {};
  const issues = {
    missingCompletionDate: [],
    missingExpiryDate: [],
    missingBothDates: [],
    wrongExpiryCalculation: [],
    bookedWithoutExpiry: [],
    dataInconsistencies: []
  };

  allRecords.forEach(record => {
    const status = record.status || 'Unknown';
    
    if (!byStatus[status]) {
      byStatus[status] = { total: 0, withCompletion: 0, withExpiry: 0, withBoth: 0 };
    }
    byStatus[status].total++;

    if (record.completion_date) byStatus[status].withCompletion++;
    if (record.expiry_date) byStatus[status].withExpiry++;
    if (record.completion_date && record.expiry_date) byStatus[status].withBoth++;

    // Check for issues
    const courseName = record.courses?.name || 'Unknown';
    const staffName = record.profiles?.full_name || 'Unknown';

    // Issue 1: Missing completion date but has expiry date (might be ok for Booked)
    if (!record.completion_date && record.expiry_date && status !== 'Booked' && status !== 'Awaiting' && status !== 'N/A') {
      issues.missingCompletionDate.push({
        staff: staffName,
        course: courseName,
        status: status
      });
    }

    // Issue 2: Has completion date but missing expiry date
    if (record.completion_date && !record.expiry_date) {
      issues.missingExpiryDate.push({
        staff: staffName,
        course: courseName,
        status: status,
        completionDate: record.completion_date,
        expiryMonths: record.courses?.expiry_months
      });
    }

    // Issue 3: Missing both dates
    if (!record.completion_date && !record.expiry_date) {
      issues.missingBothDates.push({
        staff: staffName,
        course: courseName,
        status: status
      });
    }

    // Issue 4: Check expiry date calculation
    if (record.completion_date && record.expiry_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const calcExpiryDate = new Date(completionDate);
      calcExpiryDate.setMonth(calcExpiryDate.getMonth() + record.courses.expiry_months);
      const calcExpiryStr = calcExpiryDate.toISOString().split('T')[0];

      if (calcExpiryStr !== record.expiry_date) {
        issues.wrongExpiryCalculation.push({
          staff: staffName,
          course: courseName,
          completionDate: record.completion_date,
          expectedExpiry: calcExpiryStr,
          actualExpiry: record.expiry_date,
          months: record.courses.expiry_months
        });
      }
    }

    // Issue 5: Booked status without expiry date
    if (status === 'Booked' && !record.expiry_date && record.courses?.expiry_months !== null) {
      issues.bookedWithoutExpiry.push({
        staff: staffName,
        course: courseName,
        expiryMonths: record.courses?.expiry_months
      });
    }
  });

  // Print status breakdown
  console.log('═'.repeat(120));
  console.log('STATUS BREAKDOWN:\n');

  for (const [status, stats] of Object.entries(byStatus).sort()) {
    const pctCompletion = ((stats.withCompletion / stats.total) * 100).toFixed(1);
    const pctExpiry = ((stats.withExpiry / stats.total) * 100).toFixed(1);
    const pctBoth = ((stats.withBoth / stats.total) * 100).toFixed(1);
    
    console.log(`${status}: ${stats.total} records`);
    console.log(`  • Completion dates: ${stats.withCompletion} (${pctCompletion}%)`);
    console.log(`  • Expiry dates: ${stats.withExpiry} (${pctExpiry}%)`);
    console.log(`  • Both dates: ${stats.withBoth} (${pctBoth}%)\n`);
  }

  // Print issues
  console.log('═'.repeat(120));
  console.log('DATA ISSUES:\n');

  if (issues.missingExpiryDate.length > 0) {
    console.log(`⚠️ MISSING EXPIRY DATES (${issues.missingExpiryDate.length} records):`);
    issues.missingExpiryDate.slice(0, 10).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue.staff} - ${issue.course}`);
      console.log(`     Status: ${issue.status} | Completion: ${issue.completionDate} | Expiry_months: ${issue.expiryMonths}`);
    });
    if (issues.missingExpiryDate.length > 10) {
      console.log(`  ... and ${issues.missingExpiryDate.length - 10} more\n`);
    } else {
      console.log('');
    }
  } else {
    console.log('✓ No missing expiry dates\n');
  }

  if (issues.wrongExpiryCalculation.length > 0) {
    console.log(`⚠️ WRONG EXPIRY CALCULATIONS (${issues.wrongExpiryCalculation.length} records):`);
    issues.wrongExpiryCalculation.slice(0, 10).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue.staff} - ${issue.course}`);
      console.log(`     Completion: ${issue.completionDate} + ${issue.months}mo`);
      console.log(`     Expected: ${issue.expectedExpiry} | Actual: ${issue.actualExpiry}`);
    });
    if (issues.wrongExpiryCalculation.length > 10) {
      console.log(`  ... and ${issues.wrongExpiryCalculation.length - 10} more\n`);
    } else {
      console.log('');
    }
  } else {
    console.log('✓ All expiry calculations are correct\n');
  }

  if (issues.bookedWithoutExpiry.length > 0) {
    console.log(`⚠️ BOOKED STATUS WITHOUT EXPIRY DATES (${issues.bookedWithoutExpiry.length} records):`);
    console.log('   These need expiry dates calculated based on expected completion date\n');
    issues.bookedWithoutExpiry.slice(0, 10).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue.staff} - ${issue.course}`);
      console.log(`     Location: ${issue.location} | Expiry_months: ${issue.expiryMonths}`);
    });
    if (issues.bookedWithoutExpiry.length > 10) {
      console.log(`  ... and ${issues.bookedWithoutExpiry.length - 10} more\n`);
    } else {
      console.log('');
    }
  } else {
    console.log('✓ All booked courses have expiry dates\n');
  }

  if (issues.missingBothDates.length > 0) {
    console.log(`⚠️ MISSING BOTH DATES (${issues.missingBothDates.length} records):`);
    issues.missingBothDates.slice(0, 10).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue.staff} - ${issue.course}`);
      console.log(`     Status: ${issue.status} | Location: ${issue.location}`);
    });
    if (issues.missingBothDates.length > 10) {
      console.log(`  ... and ${issues.missingBothDates.length - 10} more\n`);
    } else {
      console.log('');
    }
  } else {
    console.log('✓ No records with both dates missing\n');
  }

  console.log('═'.repeat(120));
  console.log('SUMMARY:\n');
  console.log(`✓ Total records verified: ${allRecords.length}`);
  console.log(`⚠️ Issues found:`);
  console.log(`  • Missing expiry dates: ${issues.missingExpiryDate.length}`);
  console.log(`  • Wrong calculations: ${issues.wrongExpiryCalculation.length}`);
  console.log(`  • Booked without expiry: ${issues.bookedWithoutExpiry.length}`);
  console.log(`  • Missing both dates: ${issues.missingBothDates.length}`);

  if (issues.missingExpiryDate.length === 0 && 
      issues.wrongExpiryCalculation.length === 0 && 
      issues.bookedWithoutExpiry.length === 0) {
    console.log('\n✅ ALL DATES ARE CORRECT AND COMPLETE\n');
  } else {
    console.log('\n⚠️ ISSUES NEED TO BE ADDRESSED\n');
  }

  console.log('═'.repeat(120) + '\n');

  return issues;
}

comprehensiveVerification();
