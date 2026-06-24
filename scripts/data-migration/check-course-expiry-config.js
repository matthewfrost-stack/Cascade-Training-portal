import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCourseExpiry() {
  console.log('\n' + '═'.repeat(120));
  console.log('  CHECKING COURSE EXPIRY_MONTHS CONFIGURATION');
  console.log('═'.repeat(120) + '\n');

  try {
    // Get all courses with their expiry_months
    const { data: courses } = await supabase
      .from('courses')
      .select('id, name, expiry_months')
      .order('name');

    console.log(`Total courses: ${courses.length}\n`);

    // Group by expiry_months
    const byExpiry = {};
    courses.forEach(c => {
      const key = c.expiry_months === null ? 'NULL' : c.expiry_months;
      if (!byExpiry[key]) byExpiry[key] = [];
      byExpiry[key].push(c);
    });

    console.log('Courses grouped by expiry_months:\n');
    for (const [expiry, courseList] of Object.entries(byExpiry)) {
      const displayExpiry = expiry === 'NULL' ? 'NO EXPIRY SET' : `${expiry} months`;
      console.log(`${displayExpiry} (${courseList.length} courses):`);
      courseList.slice(0, 10).forEach(c => {
        console.log(`  • ${c.name}`);
      });
      if (courseList.length > 10) {
        console.log(`  ... and ${courseList.length - 10} more`);
      }
      console.log('');
    }

    // Check how expiry_months affects training records
    console.log('\n' + '═'.repeat(120));
    console.log('IMPACT ON TRAINING RECORDS:\n');

    const { data: trainingSample } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        expiry_date,
        courses(name, expiry_months),
        profiles(full_name)
      `)
      .not('completion_date', 'is', null)
      .limit(20);

    console.log('Sample training records and their expiry calculations:\n');

    trainingSample.slice(0, 10).forEach((rec, idx) => {
      const staff = rec.profiles?.full_name || 'Unknown';
      const course = rec.courses?.name || 'Unknown';
      const completion = rec.completion_date;
      const expiry = rec.expiry_date;
      const expiryMonths = rec.courses?.expiry_months;

      // Verify calculation
      if (completion && expiryMonths) {
        const completionDate = new Date(completion);
        const calcExpiry = new Date(completionDate);
        calcExpiry.setMonth(calcExpiry.getMonth() + expiryMonths);
        const calcExpiryStr = calcExpiry.toISOString().split('T')[0];

        const matches = calcExpiryStr === expiry ? '✓' : '⚠️';
        console.log(`${idx + 1}. ${staff} - ${course}`);
        console.log(`   Completion: ${completion} | Expiry_months: ${expiryMonths}`);
        console.log(`   DB Expiry: ${expiry} | Calculated: ${calcExpiryStr} ${matches}`);
      } else {
        console.log(`${idx + 1}. ${staff} - ${course}`);
        console.log(`   Completion: ${completion} | Expiry_months: ${expiryMonths || 'NULL'}`);
        console.log(`   DB Expiry: ${expiry}`);
      }
      console.log('');
    });

    // Check for NULL expiry_months that are causing issues
    const { data: coursesWithoutExpiry } = await supabase
      .from('courses')
      .select('id, name, expiry_months')
      .is('expiry_months', null);

    console.log('\n' + '═'.repeat(120));
    console.log(`⚠️  COURSES WITH NULL EXPIRY_MONTHS (${coursesWithoutExpiry.length}):\n`);

    // Check how many training records use these courses
    for (const course of coursesWithoutExpiry.slice(0, 10)) {
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id);

      console.log(`${course.name}: ${count} training records`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCourseExpiry();
