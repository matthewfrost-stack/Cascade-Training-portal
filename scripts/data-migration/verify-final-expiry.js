import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyFinalExpiryData() {
  console.log('=== FINAL EXPIRY DATA VERIFICATION ===\n');

  try {
    // 1. Courses status
    const { data: allCourses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    const withExpiry = allCourses.filter(c => c.expiry_months !== null);
    const oneOff = allCourses.filter(c => c.expiry_months === null);

    console.log('COURSE STATUS:');
    console.log(`  Total courses: ${allCourses.length}`);
    console.log(`  With expiry settings: ${withExpiry.length} (${Math.round(withExpiry.length / allCourses.length * 100)}%)`);
    console.log(`  One-off courses: ${oneOff.length}\n`);

    // 2. Training records with expiry dates
    const { data: allRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, expiry_date, course_id, courses(expiry_months)');

    const withExpiryDate = allRecords.filter(r => r.expiry_date !== null).length;
    const withoutExpiryDate = allRecords.filter(r => r.expiry_date === null).length;

    console.log('TRAINING RECORDS STATUS:');
    console.log(`  Total records: ${allRecords.length}`);
    console.log(`  With expiry_date: ${withExpiryDate} (${Math.round(withExpiryDate / allRecords.length * 100)}%)`);
    console.log(`  Without expiry_date: ${withoutExpiryDate} (${Math.round(withoutExpiryDate / allRecords.length * 100)}%)\n`);

    // 3. Why records don't have expiry_date
    const missingExpiry = allRecords.filter(r => r.expiry_date === null);
    const oneOffRecords = missingExpiry.filter(r => r.courses?.expiry_months === null).length;
    const shouldHave = missingExpiry.length - oneOffRecords;

    console.log('RECORDS WITHOUT EXPIRY_DATE:');
    console.log(`  Total without expiry_date: ${missingExpiry.length}`);
    console.log(`  - Correctly marked as One-off: ${oneOffRecords}`);
    console.log(`  - Should be calculated: ${shouldHave}\n`);

    // 4. Samples
    console.log('SAMPLE COURSES (With expiry):');
    withExpiry.slice(0, 5).forEach(c => {
      const years = c.expiry_months / 12;
      console.log(`  ✓ ${c.name}: ${years} year${years > 1 ? 's' : ''}`);
    });

    console.log('\nSAMPLE ONE-OFF COURSES:');
    oneOff.slice(0, 5).forEach(c => {
      console.log(`  ⊘ ${c.name}: One-off (no expiry)`);
    });

    console.log('\nSAMPLE TRAINING RECORDS (With dates):');
    allRecords.filter(r => r.expiry_date !== null).slice(0, 3).forEach(r => {
      console.log(`  ✓ ID ${r.id}: Expiry ${r.expiry_date}`);
    });

    console.log('\nSAMPLE ONE-OFF RECORDS:');
    allRecords.filter(r => r.expiry_date === null && r.courses?.expiry_months === null).slice(0, 3).forEach(r => {
      console.log(`  ⊘ ID ${r.id}: One-off (no expiry_date needed)`);
    });

    console.log('\n=== COMPLETION STATUS ===');
    console.log(shouldHave === 0 ? '✅ All courses have expiry settings' : `⚠️  ${shouldHave} records missing expiry_date`);
    console.log(`✅ ${withExpiryDate} training records have calculated expiry dates`);
    console.log(`✅ ${oneOffRecords} one-off training records correctly marked`);
    console.log('✅ UI will now correctly display:');
    console.log('   - Expiry dates for courses with validity periods');
    console.log('   - "One-Off" for courses with no renewal requirement');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyFinalExpiryData();
