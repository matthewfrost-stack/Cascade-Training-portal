require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get first location
  const { data: locations } = await supabase.from('locations').select('id, name').limit(1);
  const locId = locations[0].id;
  console.log('Testing location:', locations[0].name, locId);
  
  // Replicate the exact query from page.tsx
  const { data: locationCoursesData, error: locationCoursesError } = await supabase
    .from('location_training_courses')
    .select(`
      training_course_id,
      display_order,
      training_courses(id, name, category, expiry_months)
    `)
    .eq('location_id', locId)
    .order('display_order', { ascending: true, nullsFirst: false });

  console.log('Error:', locationCoursesError);
  console.log('Data length:', locationCoursesData?.length);
  
  // Check first few items
  if (locationCoursesData && locationCoursesData.length > 0) {
    console.log('First course:', locationCoursesData[0]);
    console.log('training_courses nested:', locationCoursesData[0].training_courses);
  }
  
  // Map like in the code
  const filteredCourses = locationCoursesData?.map((lc) => ({
    id: lc.training_courses?.id,
    name: lc.training_courses?.name,
  })) || [];
  
  console.log('\nMapped courses sample:', filteredCourses.slice(0, 3));
  console.log('Any null ids?', filteredCourses.filter(c => !c.id).length);
})();
