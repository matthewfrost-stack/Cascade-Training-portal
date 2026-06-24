import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 CHECKING COURSES WITH EXPIRY_MONTHS\n');
  
  // Check courses with expiry_months
  const { data: coursesWithMonths } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .not('expiry_months', 'is', null)
    .limit(10);
  
  console.log('✅ Courses WITH expiry_months:');
  console.log(`  Found: ${coursesWithMonths?.length} courses`);
  if (coursesWithMonths && coursesWithMonths.length > 0) {
    coursesWithMonths.forEach(c => {
      console.log(`    - ${c.name}: ${c.expiry_months} months`);
    });
  }
  
  // Check courses WITHOUT expiry_months
  const { data: coursesWithoutMonths, count: countWithoutMonths } = await supabase
    .from('courses')
    .select('id, name, expiry_months', { count: 'exact' })
    .or('expiry_months.is.null,expiry_months.eq.0');
  
  console.log(`\n❌ Courses WITHOUT/0 expiry_months: ${countWithoutMonths}`);
  if (coursesWithoutMonths && coursesWithoutMonths.length > 0) {
    coursesWithoutMonths.slice(0, 5).forEach(c => {
      console.log(`    - ${c.name}: ${c.expiry_months}`);
    });
  }
  
  // Check if courses were actually updated
  const teamTeachId = '67825d6a-91f4-4340-a011-d7bc6629e029';
  const { data: teamTeach } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .eq('id', teamTeachId);
  
  console.log(`\n📋 Team Teach course: ${teamTeach?.[0]?.name}`);
  console.log(`   expiry_months: ${teamTeach?.[0]?.expiry_months}`);
  
  // Count totals
  const { count: total } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true });
  
  const { count: withMonths } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .not('expiry_months', 'is', null);
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Total courses: ${total}`);
  console.log(`  Courses WITH expiry_months: ${withMonths}`);
  console.log(`  Courses WITHOUT expiry_months: ${total - (withMonths || 0)}`);
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
