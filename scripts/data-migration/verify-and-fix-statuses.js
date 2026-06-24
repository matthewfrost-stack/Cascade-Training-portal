import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyStatuses() {
  console.log('Verifying status values in database...\n');

  try {
    // Get all unique status values
    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('status');

    const statusCounts = {};
    allRecords.forEach(record => {
      const status = record.status || 'null';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('=== CURRENT STATUS DISTRIBUTION ===\n');
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`${status}: ${count} records`);
    }

    // Look for problematic records
    console.log('\n=== CHECKING FOR INCONSISTENCIES ===\n');

    // Get "Awaiting Date" records (should be status 'awaiting')
    const { data: awaitingRows } = await supabase
      .from('staff_training_matrix')
      .select('id, status, completion_date, expiry_date')
      .ilike('status', '%awaiting%')
      .limit(10);

    if (awaitingRows && awaitingRows.length > 0) {
      console.log('Awaiting records found:');
      awaitingRows.forEach(r => {
        console.log(`  ID ${r.id}: status="${r.status}"`);
      });
    } else {
      console.log('✓ No malformed "awaiting" status values');
    }

    // Get "N/A" records (should be status 'na')
    const { data: naRows } = await supabase
      .from('staff_training_matrix')
      .select('id, status, completion_date, expiry_date')
      .ilike('status', '%n/a%')
      .limit(10);

    if (naRows && naRows.length > 0) {
      console.log('N/A records found:');
      naRows.forEach(r => {
        console.log(`  ID ${r.id}: status="${r.status}"`);
      });
    } else {
      console.log('✓ No malformed "N/A" status values');
    }

    // Get "Booked" records (should be status 'booked')
    const { data: bookedRows } = await supabase
      .from('staff_training_matrix')
      .select('id, status, completion_date, expiry_date')
      .ilike('status', '%booked%')
      .limit(10);

    if (bookedRows && bookedRows.length > 0) {
      console.log('Booked records found:');
      bookedRows.forEach(r => {
        console.log(`  ID ${r.id}: status="${r.status}"`);
      });
    } else {
      console.log('✓ No malformed "booked" status values');
    }

    // Sample of each status type
    console.log('\n=== SAMPLE RECORDS BY STATUS ===\n');
    
    const statuses = ['completed', 'awaiting', 'booked', 'na'];
    for (const status of statuses) {
      const { data: samples } = await supabase
        .from('staff_training_matrix')
        .select('id, status, completion_date, expiry_date')
        .eq('status', status)
        .limit(3);

      if (samples && samples.length > 0) {
        console.log(`Status: "${status}"`);
        samples.forEach(s => {
          console.log(`  ID ${s.id}: completion=${s.completion_date}, expiry=${s.expiry_date}`);
        });
      } else {
        console.log(`Status: "${status}" - No records found`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyStatuses();
