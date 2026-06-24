require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function debugAtlas() {
  console.log('🔍 Looking for Careskills courses...\n');
  
  // Check courses table
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id, name')
    .ilike('name', '%careskills%');
  
  if (courseError) {
    console.error('❌ Error fetching courses:', courseError);
    return;
  }
  
  console.log(`✅ Found ${courses.length} courses with 'careskills' in name`);
  
  // Check what columns location_courses has
  console.log('\n🔍 Checking location_courses table structure...\n');
  
  const { data: sample, error: sampleError } = await supabase
    .from('location_courses')
    .select('*')
    .limit(1);
  
  if (sampleError) {
    console.error('❌ Error:', sampleError);
    return;
  }
  
  if (sample && sample.length > 0) {
    console.log('location_courses columns:', Object.keys(sample[0]));
  }
  
  // Check all courses to see what names exist
  console.log('\n🔍 All courses in database:\n');
  
  const { data: allCourses, error: allError } = await supabase
    .from('courses')
    .select('name')
    .order('name', { ascending: true });
  
  if (allError) {
    console.error('❌ Error:', allError);
    return;
  }
  
  console.log(`Total courses: ${allCourses.length}`);
  console.log('First 20 courses:');
  allCourses.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name}`);
  });
  
  // Check delivery_type values
  console.log('\n🔍 Delivery types in location_courses:\n');
  
  const { data: locCourses, error: lcError } = await supabase
    .from('location_courses')
    .select('delivery_type')
    .limit(100);
  
  if (lcError) {
    console.error('❌ Error:', lcError);
    return;
  }
  
  const deliveryTypes = [...new Set(locCourses.map(lc => lc.delivery_type))];
  console.log('Unique delivery types:', deliveryTypes);
}

debugAtlas().catch(err => console.error('Fatal error:', err));
