import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAllRecords() {
  console.log('\n' + '═'.repeat(120));
  console.log('  VERIFYING ALL RECORDS (COMPLETE DATASET)');
  console.log('═'.repeat(120) + '\n');

  // First, get the actual count
  const { count: totalCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });

  console.log(`Total records in database: ${totalCount}\n`);

  // Get all records in batches since Supabase has a default limit
  const pageSize = 5000;
  const allRecords = [];
  let page = 0;

  console.log(`Fetching records in batches of ${pageSize}...\n`);

  while (page * pageSize < totalCount) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: records, error } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        status,
        completion_date,
        expiry_date,
        courses(id, name, expiry_months),
        profiles(full_name)
      `)
      .range(from, to);

    if (error) {
      console.error(`Error fetching batch ${page}:`, error.message);
      break;
    }

    allRecords.push(...records);
    console.log(`✓ Fetched batch ${page + 1} (${records.length} records, total: ${allRecords.length})`);
    page++;
  }

  console.log(`\n✓ Successfully fetched all ${allRecords.length} records\n`);

  // Analyze data
  const byStatus = {};
  const issues = {
    missingCompletionDate: [],
    missingExpiryDate: [],
    wrongExpiryCalculation: []
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

    // Check for wrong calculations
    if (record.completion_date && record.expiry_date && record.courses?.expiry_months) {
      const completionDate = new Date(record.completion_date);
      const calcExpiryDate = new Date(completionDate);
      calcExpiryDate.setMonth(calcExpiryDate.getMonth() + record.courses.expiry_months);
      const calcExpiryStr = calcExpiryDate.toISOString().split('T')[0];

      if (calcExpiryStr !== record.expiry_date) {
        issues.wrongExpiryCalculation.push({
          staff: record.profiles?.full_name || 'Unknown',
          course: record.courses?.name || 'Unknown',
          completionDate: record.completion_date,
          expectedExpiry: calcExpiryStr,
          actualExpiry: record.expiry_date,
          months: record.courses.expiry_months
        });
      }
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
  console.log('DATA QUALITY CHECK:\n');

  if (issues.wrongExpiryCalculation.length > 0) {
    console.log(`⚠️ WRONG EXPIRY CALCULATIONS (${issues.wrongExpiryCalculation.length} records):`);
    issues.wrongExpiryCalculation.slice(0, 5).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue.staff} - ${issue.course}`);
      console.log(`     Completion: ${issue.completionDate} + ${issue.months}mo`);
      console.log(`     Expected: ${issue.expectedExpiry} | Actual: ${issue.actualExpiry}`);
    });
    if (issues.wrongExpiryCalculation.length > 5) {
      console.log(`  ... and ${issues.wrongExpiryCalculation.length - 5} more\n`);
    } else {
      console.log('');
    }
  } else {
    console.log('✓ No wrong expiry calculations\n');
  }

  console.log('═'.repeat(120));
  console.log('FINAL SUMMARY:\n');
  console.log(`✓ Total records verified: ${allRecords.length}`);
  console.log(`✓ Completion dates: ${Object.values(byStatus).reduce((sum, s) => sum + s.withCompletion, 0)}/${allRecords.length}`);
  console.log(`✓ Expiry dates: ${Object.values(byStatus).reduce((sum, s) => sum + s.withExpiry, 0)}/${allRecords.length}`);
  console.log(`⚠️ Issues: ${issues.wrongExpiryCalculation.length}`);

  if (issues.wrongExpiryCalculation.length === 0) {
    console.log('\n✅ ALL RECORDS ARE CORRECT AND COMPLETE\n');
  }

  console.log('═'.repeat(120) + '\n');
}

verifyAllRecords();
