require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check if display_order already exists by trying to query it
  const { data, error } = await supabase
    .from('staff_locations')
    .select('display_order')
    .limit(1);
    
  if (error && error.code === '42703') {
    console.log('display_order column does not exist - needs to be added');
  } else if (error) {
    console.log('Other error:', error);
  } else {
    console.log('display_order column exists:', data);
  }
  
  // Check if there's an is_divider column
  const { data: data2, error: error2 } = await supabase
    .from('staff_locations')
    .select('is_divider')
    .limit(1);
    
  if (error2 && error2.code === '42703') {
    console.log('is_divider column does not exist');
  } else {
    console.log('is_divider column exists');
  }
  
  // Check profiles for divider-like names
  const { data: dividers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .or('full_name.ilike.%management%,full_name.ilike.%team leader%,full_name.ilike.%lead support%,full_name.ilike.%staff team%,full_name.ilike.%staff on probation%')
    .eq('is_deleted', false);
    
  console.log('\nDividers found in profiles:', dividers?.length);
  dividers?.forEach(d => console.log('  -', d.full_name));
})();
