import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCount() {
  const { count, error } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nTotal records: ${count}\n`);

  // Check by location
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  for (const loc of locations || []) {
    const { count: locCount } = await supabase
      .from('staff_training_matrix')
      .select('*', { count: 'exact', head: true })
      .eq('completed_at_location_id', loc.id);
    console.log(`${loc.name.trim()}: ${locCount}`);
  }
}

checkCount();
