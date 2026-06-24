require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: locs } = await supabase.from('locations').select('id, name');
  const locMap = new Map(locs.map(l => [l.name, l.id]));
  
  const pairs = [
    ['Stiles House', 'Felix House'],
    ['Hurst House', 'Banks House School']
  ];
  
  for (const [loc1, loc2] of pairs) {
    console.log(`\n=== Checking shared staff: ${loc1} <-> ${loc2} ===`);
    
    const { data: staff1 } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(full_name)')
      .eq('location_id', locMap.get(loc1));
    
    const { data: staff2 } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(full_name)')
      .eq('location_id', locMap.get(loc2));
    
    const ids1 = new Set(staff1.map(sl => sl.staff_id));
    const ids2 = new Set(staff2.map(sl => sl.staff_id));
    
    // Find shared staff
    const shared = staff1.filter(sl => ids2.has(sl.staff_id));
    console.log('Shared staff:', shared.length);
    shared.forEach(sl => console.log('  -', sl.profiles?.full_name));
    
    // Find staff only in loc1
    const only1 = staff1.filter(sl => !ids2.has(sl.staff_id));
    console.log(`\n${loc1} only:`, only1.length);
    
    // Find staff only in loc2
    const only2 = staff2.filter(sl => !ids1.has(sl.staff_id));
    console.log(`${loc2} only:`, only2.length);
  }
})();
