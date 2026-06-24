import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { count } = await supabase
  .from('staff_training_matrix')
  .select('*', { count: 'exact', head: true });

console.log(`\nTotal database records: ${count}`);

const { data: locs } = await supabase
  .from('locations')
  .select('id, name')
  .order('name');

console.log('\nBreakdown by location:\n');
for (const loc of locs || []) {
  const { count: c } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('completed_at_location_id', loc.id);
  console.log(`  ${loc.name.trim().padEnd(25)}: ${c}`);
}
