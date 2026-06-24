require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get Group location
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('name', 'Group')
    .single();

  // Get staff at Group
  const { data: staffLocs, error: staffErr } = await supabase
    .from('staff_locations')
    .select('staff_id')
    .eq('location_id', loc.id);

  if (staffErr) {
    console.error('Staff error:', staffErr);
    return;
  }

  // Get staff names
  const staffIds = staffLocs.map(s => s.staff_id);
  const { data: staffMembers, error: smErr } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', staffIds);
  
  if (smErr) {
    console.error('Profiles error:', smErr);
    return;
  }
  
  const staffMap = new Map((staffMembers || []).map(s => [s.id, s.full_name]));

  // Get courses for Group
  const { data: locCourses } = await supabase
    .from('location_courses')
    .select('course_id')
    .eq('location_id', loc.id);

  const courseIds = locCourses.map(c => c.course_id);
  
  // Get course names
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name')
    .in('id', courseIds);
  const courseMap = new Map(courses.map(c => [c.id, c.name]));

  console.log('=== Group Matrix Analysis ===\n');
  console.log('Staff:', staffLocs.length);
  console.log('Courses:', courseIds.length);
  console.log('Expected cells:', staffLocs.length * courseIds.length);

  // Check each staff member for missing courses
  let totalMissing = 0;
  const staffWithMissing = [];

  for (const sl of staffLocs) {
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select('course_id')
      .eq('staff_id', sl.staff_id);

    const recordCourseIds = new Set(records.map(r => r.course_id));
    const missingCourses = courseIds.filter(c => !recordCourseIds.has(c));

    if (missingCourses.length > 0) {
      totalMissing += missingCourses.length;
      staffWithMissing.push({
        name: staffMap.get(sl.staff_id) || 'Unknown',
        staffId: sl.staff_id,
        missing: missingCourses.length,
        missingIds: missingCourses
      });
    }
  }

  console.log('\nStaff with missing courses:', staffWithMissing.length);
  console.log('Total missing cells:', totalMissing);

  if (staffWithMissing.length > 0) {
    console.log('\n=== Staff Missing Courses ===');
    for (const s of staffWithMissing.slice(0, 10)) {
      console.log(`\n${s.name}: missing ${s.missing} courses`);
      // Show which courses
      for (const cid of s.missingIds.slice(0, 5)) {
        console.log(`  - ${courseMap.get(cid) || cid}`);
      }
      if (s.missingIds.length > 5) {
        console.log(`  ... and ${s.missingIds.length - 5} more`);
      }
    }
  }
})();
