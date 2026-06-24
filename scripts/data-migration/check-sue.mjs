import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check a specific staff member
const { data: sue, error: sueErr } = await supabase
  .from('profiles')
  .select('id, first_name, last_name')
  .ilike('first_name', 'Sue')
  .ilike('last_name', 'Brown')
  .single();

console.log('Sue Brown:', sue);
if (sueErr) console.log('Sue error:', sueErr);

if (sue) {
  const { data: records, count, error: recErr } = await supabase
    .from('staff_training_matrix')
    .select('*, training_courses(name)', { count: 'exact' })
    .eq('staff_id', sue.id)
    .not('completion_date', 'is', null)
    .limit(10);
  
  if (recErr) console.log('Records error:', recErr);
  
  console.log('\nSue has', count, 'completed training records');
  console.log('Sample:', records?.slice(0, 5).map(r => ({
    course: r.training_courses?.name,
    completed: r.completion_date,
    expires: r.expiry_date
  })));
}

// Also check what the matrix page might be looking for
const { data: matrixSample } = await supabase
  .from('staff_training_matrix')
  .select('*')
  .not('completion_date', 'is', null)
  .limit(3);

console.log('\nRaw matrix sample:', JSON.stringify(matrixSample, null, 2));
