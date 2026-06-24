require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get Group location
  const { data: groupLoc } = await supabase
    .from('locations')
    .select('id, name')
    .eq('name', 'Group')
    .single();
  
  console.log('=== Analyzing Group Location ===\n');
  console.log(`Location: ${groupLoc.name} (${groupLoc.id})\n`);
  
  // Get all staff at Group
  const { data: staffAtGroup } = await supabase
    .from('staff_locations')
    .select('staff_id')
    .eq('location_id', groupLoc.id);
  const staffIds = staffAtGroup.map(s => s.staff_id);
  console.log(`Staff count: ${staffIds.length}\n`);
  
  // Get all courses linked to Group
  const { data: linkedCourses, error } = await supabase
    .from('location_courses')
    .select('course_id')
    .eq('location_id', groupLoc.id);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  // Get course names separately
  const courseIds = linkedCourses.map(c => c.course_id);
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name')
    .in('id', courseIds);
  
  const courseMap = new Map(courses.map(c => [c.id, c.name]));
  
  console.log(`Courses linked: ${linkedCourses.length}\n`);
  
  const noRecords = [];
  const partialRecords = [];
  const fullRecords = [];
  
  for (const lc of linkedCourses) {
    const courseName = courseMap.get(lc.course_id) || 'Unknown';
    const courseId = lc.course_id;
    
    // Count records for this course among Group staff
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select('staff_id, status, completion_date')
      .eq('course_id', courseId)
      .in('staff_id', staffIds);
    
    if (!records || records.length === 0) {
      noRecords.push({ courseId, courseName });
    } else if (records.length < staffIds.length) {
      const withDates = records.filter(r => r.completion_date).length;
      const withNA = records.filter(r => r.status === 'na').length;
      const missing = staffIds.length - records.length;
      partialRecords.push({ courseId, courseName, total: records.length, withDates, withNA, missing });
    } else {
      fullRecords.push({ courseId, courseName, total: records.length });
    }
  }
  
  console.log('=== Courses with NO records (can be unlinked) ===');
  console.log(`Count: ${noRecords.length}\n`);
  for (const c of noRecords) {
    console.log(`  - ${c.courseName}`);
  }
  
  console.log('\n=== Courses with PARTIAL records (need N/A for missing) ===');
  console.log(`Count: ${partialRecords.length}\n`);
  for (const c of partialRecords) {
    console.log(`  - ${c.courseName}`);
    console.log(`    Records: ${c.total}/${staffIds.length}, Dates: ${c.withDates}, N/A: ${c.withNA}, Missing: ${c.missing}`);
  }
  
  console.log('\n=== Courses with FULL records ===');
  console.log(`Count: ${fullRecords.length}\n`);
  
  // Summary
  console.log('\n=== ACTIONS NEEDED ===');
  console.log(`1. Unlink ${noRecords.length} courses with no records`);
  
  let totalMissing = 0;
  for (const c of partialRecords) {
    totalMissing += c.missing;
  }
  console.log(`2. Add ${totalMissing} N/A records for partial courses`);
})();
