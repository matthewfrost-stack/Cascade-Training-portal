import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the first record to see if there are actual records
const { data, error } = await supabase
  .from('staff_training_matrix')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error);
} else if (!data || data.length === 0) {
  console.log('Database is empty!');
} else {
  console.log('Sample record:');
  console.log(JSON.stringify(data[0], null, 2));
}
