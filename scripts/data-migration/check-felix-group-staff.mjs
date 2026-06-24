import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get Felix House School and Group locations
const { data: locs } = await supabase
  .from('locations')
  .select('id, name')
  .in('name', ['Felix House School ', 'Group ']);

console.log('Found locations:', locs?.map(l => ({ name: l.name, id: l.id })));

for (const loc of locs || []) {
  const { count: staffCount } = await supabase
    .from('staff_locations')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', loc.id);
  
  const { count: trainingCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('completed_at_location_id', loc.id);
  
  console.log(`\n${loc.name.trim()}:`);
  console.log(`  Staff in staff_locations: ${staffCount}`);
  console.log(`  Training records: ${trainingCount}`);
}
