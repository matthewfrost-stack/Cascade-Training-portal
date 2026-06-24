import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get exact "Team Teach Positive Behaviour Training Level 2" courses
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .ilike('name', '%positive behaviour%training level 2%');

  console.log('Team Teach Positive Behaviour Training Level 2 variants:');
  console.log('');
  
  courses.forEach(c => {
    console.log(`ID: ${c.id}`);
    console.log(`Name: "${c.name}"`);
    console.log(`Expiry: ${c.expiry_months}`);
    
    // Check staff assignments
    supabase
      .from('staff_training_matrix')
      .select('profiles(full_name)', { count: 'exact' })
      .eq('course_id', c.id)
      .then(({ count, data }) => {
        console.log(`Staff assignments: ${count}`);
        if (data && data.length > 0) {
          console.log(`  Sample staff: ${data[0].profiles?.full_name || 'Unknown'}`);
        }
      });
    
    console.log('');
  });
}

main().catch(console.error);
