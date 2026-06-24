require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Peters House').single();
  
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name')
    .ilike('name', '%team teach%');
  
  console.log('Team Teach courses in DB:', courses.length);

  console.log('\nLinked to Peters House:');
  for (const course of courses) {
    const { data: link } = await supabase
      .from('location_training_courses')
      .select('*')
      .eq('location_id', loc.id)
      .eq('training_course_id', course.id)
      .single();
    
    const { count } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id)
      .eq('completed_at_location_id', loc.id);
    
    const linked = link ? 'Y' : 'N';
    const shortName = course.name.replace(/\n/g, ' ').substring(0, 50);
    console.log(' ' + linked + ' ' + shortName + ' - Records: ' + count);
  }
}
check().catch(console.error);
