import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAllCourses() {
  console.log('\n' + '═'.repeat(100));
  console.log('  ALL COURSES WITH EXPIRY_MONTHS');
  console.log('═'.repeat(100) + '\n');

  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching courses:', error.message);
    return;
  }

  console.log(`Found ${courses.length} courses:\n`);

  // Group by expiry duration for easy review
  const grouped = {};

  courses.forEach(course => {
    const duration = course.expiry_months === null ? 'One-off (NULL)' : `${course.expiry_months} months (${(course.expiry_months / 12).toFixed(1)} years)`;
    
    if (!grouped[duration]) {
      grouped[duration] = [];
    }
    grouped[duration].push(course.name);
  });

  // Sort by duration
  const durationOrder = ['One-off (NULL)', '12 months (1.0 years)', '24 months (2.0 years)', '36 months (3.0 years)', '48 months (4.0 years)', '60 months (5.0 years)'];
  
  for (const duration of durationOrder) {
    if (grouped[duration]) {
      console.log(`\n${duration} - ${grouped[duration].length} courses:`);
      console.log('─'.repeat(100));
      grouped[duration].forEach((name, idx) => {
        console.log(`  ${idx + 1}. ${name}`);
      });
    }
  }

  // Handle any other durations not in the standard list
  for (const [duration, courses] of Object.entries(grouped)) {
    if (!durationOrder.includes(duration)) {
      console.log(`\n${duration} - ${courses.length} courses:`);
      console.log('─'.repeat(100));
      courses.forEach((name, idx) => {
        console.log(`  ${idx + 1}. ${name}`);
      });
    }
  }

  // Also output as CSV format for easy copying
  console.log('\n\n' + '═'.repeat(100));
  console.log('  CSV FORMAT (for easy copying):');
  console.log('═'.repeat(100) + '\n');
  
  console.log('Course Name,Expiry_months,Duration');
  courses.forEach(course => {
    const duration = course.expiry_months === null ? 'One-off' : `${course.expiry_months / 12} years`;
    console.log(`"${course.name}",${course.expiry_months || 'NULL'},${duration}`);
  });

  console.log('\n');
}

getAllCourses();
