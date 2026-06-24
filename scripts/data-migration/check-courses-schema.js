import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Checking courses table schema...\n');
  
  // Get all columns
  const { data, error } = await supabase
    .from('courses')
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

  // Get a sample record
  const { data: sample } = await supabase
    .from('courses')
    .select('*')
    .limit(2);

  if (sample && sample.length > 0) {
    console.log('Sample courses:');
    sample.forEach((course, idx) => {
      console.log(`\n${idx + 1}. ${course.name}`);
      console.log(JSON.stringify(course, null, 2));
    });
  }
}

main().catch(console.error);
