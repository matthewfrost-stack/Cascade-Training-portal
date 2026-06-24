import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  TEAM TEACH COURSES - DETAILED EXPIRY MONTHS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all Team Teach courses with full details
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .ilike('name', '%team teach%')
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${courses.length} Team Teach courses:\n`);
  
  courses.forEach((course, idx) => {
    const display = course.expiry_months === null ? 'One-Off' : 
                   course.expiry_months === 12 ? '1 year' :
                   course.expiry_months === 24 ? '2 years' :
                   `${course.expiry_months} months`;
    
    console.log(`${idx + 1}. ${course.name}`);
    console.log(`   Expiry Months: ${course.expiry_months}`);
    console.log(`   Display: ${display}`);
    console.log('');
  });

  // Count by months
  const byMonths = {};
  courses.forEach(c => {
    const key = c.expiry_months === null ? 'null' : c.expiry_months;
    byMonths[key] = (byMonths[key] || 0) + 1;
  });

  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY BY EXPIRY MONTHS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  Object.entries(byMonths).forEach(([months, count]) => {
    const display = months === 'null' ? 'null' : 
                   months === '12' ? '1 year' :
                   months === '24' ? '2 years' :
                   `${months} months`;
    console.log(`${months} months (${display}): ${count}`);
  });
}

main().catch(console.error);
