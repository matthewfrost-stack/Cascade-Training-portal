require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: locations } = await supabase.from('locations').select('id, name').limit(1);
  const locId = locations[0].id;
  console.log('Location:', locations[0].name, locId);
  
  const { data, count, error } = await supabase
    .from('location_training_courses')
    .select('training_course_id', { count: 'exact' })
    .eq('location_id', locId);
    
  console.log('Error:', error);
  console.log('Courses for location:', count);
  console.log('Sample:', data?.slice(0, 3));
})();
