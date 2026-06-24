import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDataSample() {
  console.log('\n' + '═'.repeat(120));
  console.log('  TRAINING PORTAL DATA VERIFICATION - SAMPLE VIEW');
  console.log('═'.repeat(120) + '\n');

  try {
    // Get sample staff and their training
    console.log('📋 SAMPLE TRAINING RECORDS WITH DATES AND EXPIRY:\n');
    
    const { data: samples } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        expiry_date,
        status,
        profiles(full_name),
        courses(name, expiry_months),
        locations(name)
      `)
      .not('completion_date', 'is', null)
      .order('completion_date', { ascending: false })
      .limit(15);

    if (samples && samples.length > 0) {
      samples.forEach((record, idx) => {
        const staff = record.profiles?.full_name || 'Unknown';
        const course = record.courses?.name || 'Unknown';
        const location = record.locations?.name || 'Unknown';
        const completion = record.completion_date || 'N/A';
        const expiry = record.expiry_date || 'N/A';
        const status = record.status || 'unknown';
        const expiryMonths = record.courses?.expiry_months;
        
        // Calculate if expired
        const today = new Date().toISOString().split('T')[0];
        const isExpired = expiry && expiry < today ? '⚠️ EXPIRED' : expiry && expiry > today ? '✓ Valid' : '-';

        console.log(`${idx + 1}. ${staff}`);
        console.log(`   Location: ${location}`);
        console.log(`   Course: ${course}`);
        console.log(`   Completion: ${completion} | Expiry: ${expiry} ${isExpired}`);
        console.log(`   Expiry Duration: ${expiryMonths ? expiryMonths + ' months' : 'One-off'}`);
        console.log(`   Status: ${status}`);
        console.log('');
      });
    }

    // Summary statistics
    console.log('\n' + '═'.repeat(120));
    console.log('📊 SUMMARY STATISTICS:\n');

    const { data: allRecords, count } = await supabase
      .from('staff_training_matrix')
      .select('id, completion_date, expiry_date, status', { count: 'exact' })
      .limit(1);

    console.log(`Total training records: ${count}`);

    // By status
    const { data: byStatus } = await supabase
      .from('staff_training_matrix')
      .select('status');

    const statusCounts = {};
    byStatus?.forEach(r => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    console.log('\nBy Status:');
    for (const [status, cnt] of Object.entries(statusCounts)) {
      const icon = status === 'completed' ? '✓' : status === 'booked' ? '📅' : status === 'awaiting' ? '⏳' : '⊘';
      console.log(`  ${icon} ${status}: ${cnt}`);
    }

    // Expiry status
    const { data: expiredCheck } = await supabase
      .from('staff_training_matrix')
      .select('expiry_date')
      .not('expiry_date', 'is', null);

    const today = new Date().toISOString().split('T')[0];
    const expired = expiredCheck?.filter(r => r.expiry_date < today).length || 0;
    const valid = expiredCheck?.filter(r => r.expiry_date >= today).length || 0;

    console.log('\nExpiry Status (for records with dates):');
    console.log(`  ✓ Valid (not expired): ${valid}`);
    console.log(`  ⚠️ Expired: ${expired}`);

    // Courses with NULL expiry_months
    const { data: courseStatus } = await supabase
      .from('courses')
      .select('name, expiry_months');

    const oneOff = courseStatus?.filter(c => c.expiry_months === null).length || 0;
    const withExpiry = courseStatus?.filter(c => c.expiry_months !== null).length || 0;

    console.log('\nCourse Types:');
    console.log(`  ✓ Courses with expiry setting: ${withExpiry}`);
    console.log(`  ⊘ One-off courses (no expiry): ${oneOff}`);

    // Data completeness
    console.log('\n' + '═'.repeat(120));
    console.log('✅ DATA COMPLETENESS CHECK:\n');

    const { count: withBothDates } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .not('completion_date', 'is', null)
      .not('expiry_date', 'is', null);

    const { count: withCompletionOnly } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .not('completion_date', 'is', null)
      .is('expiry_date', null);

    const { count: withoutBothDates } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .is('completion_date', null);

    console.log(`Records with BOTH completion & expiry dates: ${withBothDates} ✓`);
    console.log(`Records with completion but NO expiry: ${withCompletionOnly} ${withCompletionOnly > 0 ? '⚠️' : '✓'}`);
    console.log(`Records without completion date (status-only): ${withoutBothDates} ✓`);

    console.log('\n' + '═'.repeat(120));
    console.log('✅ ALL DATA CHECKS COMPLETE\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDataSample();
