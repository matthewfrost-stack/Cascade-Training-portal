import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Checking staff_training_matrix schema...\n');
  
  // Get all columns
  const { data, error } = await supabase
    .from('staff_training_matrix')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data && data.length > 0) {
    const columns = Object.keys(data[0]);
    console.log('Available columns:');
    columns.forEach(col => {
      console.log(`  - ${col}`);
    });
  }

  console.log('\n---\n');

  // Get a sample record with all fields
  const { data: sample } = await supabase
    .from('staff_training_matrix')
    .select('*')
    .not('completion_date', 'is', null)
    .limit(1);

  if (sample && sample.length > 0) {
    console.log('Sample record with completion_date:');
    console.log(JSON.stringify(sample[0], null, 2));
  }
}

main().catch(console.error);
