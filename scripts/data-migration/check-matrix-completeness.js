require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: locations } = await supabase.from('locations').select('id, name');
  
  console.log('=== Matrix Completeness Check ===\n');
  
  let totalExpected = 0;
  let totalRecords = 0;
  
  for (const loc of locations.sort((a,b) => a.name.localeCompare(b.name))) {
    const { count: staffCount } = await supabase
      .from('staff_locations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    const { count: courseCount } = await supabase
      .from('location_courses')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    // Get staff IDs at this location
    const { data: staffAtLoc } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', loc.id);
    const staffIds = staffAtLoc.map(s => s.staff_id);
    
    // Count training records for these staff
    const { count: recordCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .in('staff_id', staffIds);
    
    const expectedCells = staffCount * courseCount;
    const coverage = expectedCells > 0 ? ((recordCount / expectedCells) * 100).toFixed(0) : 0;
    const missing = expectedCells - recordCount;
    
    totalExpected += expectedCells;
    totalRecords += recordCount;
    
    const status = missing <= 0 ? '✅' : (coverage >= 95 ? '🟡' : '❌');
    console.log(`${status} ${loc.name}`);
    console.log(`   Staff: ${staffCount}, Courses: ${courseCount}, Expected: ${expectedCells}`);
    console.log(`   Records: ${recordCount}, Coverage: ${coverage}%, Missing: ${missing > 0 ? missing : 0}`);
    console.log();
  }
  
  console.log('=== TOTALS ===');
  console.log(`Expected cells: ${totalExpected}`);
  console.log(`Actual records: ${totalRecords}`);
  console.log(`Overall coverage: ${((totalRecords / totalExpected) * 100).toFixed(1)}%`);
  console.log(`Missing: ${totalExpected - totalRecords > 0 ? totalExpected - totalRecords : 0}`);
})();
