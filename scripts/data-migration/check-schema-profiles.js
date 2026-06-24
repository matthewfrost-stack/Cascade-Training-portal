import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('Checking profiles schema...\n');

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(3);

    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Sample profiles record:');
      console.log(JSON.stringify(profiles[0], null, 2));
      
      console.log('\nAvailable columns:');
      if (profiles[0]) {
        Object.keys(profiles[0]).forEach(key => console.log(`  - ${key}`));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema();
