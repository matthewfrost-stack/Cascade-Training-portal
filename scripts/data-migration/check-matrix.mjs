import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { count: totalCount } = await supabase
  .from('staff_training_matrix')
  .select('*', { count: 'exact', head: true });

const { count: completedCount } = await supabase
  .from('staff_training_matrix')
  .select('*', { count: 'exact', head: true })
  .not('completion_date', 'is', null);

const { data: sample } = await supabase
  .from('staff_training_matrix')
  .select(`
    id,
    completion_date,
    expiry_date,
    created_at,
    profiles!inner(first_name, last_name),
    training_courses!inner(name)
  `)
  .not('completion_date', 'is', null)
  .order('created_at', { ascending: false })
  .limit(5);

console.log('=== STAFF TRAINING MATRIX STATUS ===');
console.log('Total records:', totalCount);
console.log('Records with completion dates:', completedCount);
console.log('\nSample recent records:');
sample?.forEach(r => {
  console.log(`  ${r.profiles.first_name} ${r.profiles.last_name} - ${r.training_courses.name}`);
  console.log(`    Completed: ${r.completion_date}, Expires: ${r.expiry_date}`);
});
