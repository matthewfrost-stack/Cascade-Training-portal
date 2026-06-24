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
  
  console.log('=== Adding N/A Records for Missing Group Entries ===\n');
  
  // Get all staff at Group
  const { data: staffAtGroup } = await supabase
    .from('staff_locations')
    .select('staff_id')
    .eq('location_id', groupLoc.id);
  const staffIds = staffAtGroup.map(s => s.staff_id);
  console.log(`Staff count: ${staffIds.length}`);
  
  // Get all courses linked to Group
  const { data: linkedCourses } = await supabase
    .from('location_courses')
    .select('course_id')
    .eq('location_id', groupLoc.id);
  
  const courseIds = linkedCourses.map(c => c.course_id);
  console.log(`Courses linked: ${courseIds.length}\n`);
  
  let totalCreated = 0;
  
  for (const courseId of courseIds) {
    // Get existing records for this course
    const { data: existingRecords } = await supabase
      .from('staff_training_matrix')
      .select('staff_id')
      .eq('course_id', courseId)
      .in('staff_id', staffIds);
    
    const existingStaffIds = new Set(existingRecords?.map(r => r.staff_id) || []);
    
    // Find staff without records
    const missingStaffIds = staffIds.filter(id => !existingStaffIds.has(id));
    
    if (missingStaffIds.length > 0) {
      // Create N/A records for missing staff
      const newRecords = missingStaffIds.map(staffId => ({
        staff_id: staffId,
        course_id: courseId,
        status: 'na',
        completion_date: null,
        expiry_date: null
      }));
      
      const { error } = await supabase
        .from('staff_training_matrix')
        .insert(newRecords);
      
      if (error) {
        console.log(`Error adding records for course ${courseId}: ${error.message}`);
      } else {
        totalCreated += missingStaffIds.length;
        process.stdout.write('.');
      }
    }
  }
  
  console.log(`\n\nCreated ${totalCreated} N/A records`);
  
  // Verify
  const { count } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .in('staff_id', staffIds);
  
  console.log(`\nGroup now has ${count} records (expected: ${staffIds.length * courseIds.length})`);
})();
