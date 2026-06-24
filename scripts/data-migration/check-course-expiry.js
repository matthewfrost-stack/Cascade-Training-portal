const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCourses() {
  try {
    console.log('Checking course expiry_months...\n');
    
    const { data: courses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');
    
    const withExpiry = courses.filter(c => c.expiry_months !== null && c.expiry_months > 0).length;
    const withoutExpiry = courses.filter(c => !c.expiry_months || c.expiry_months === null).length;
    
    console.log(`Total courses: ${courses.length}`);
    console.log(`With expiry_months: ${withExpiry}`);
    console.log(`Without expiry_months: ${withoutExpiry}`);
    
    console.log('\nSample of courses without expiry:');
    courses.filter(c => !c.expiry_months || c.expiry_months === null).slice(0, 5).forEach(c => {
      console.log(`  - ${c.name}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkCourses();
