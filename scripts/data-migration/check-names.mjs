import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: staff } = await supabase.from('staff').select('name').limit(20);
console.log('Sample staff names:');
staff.forEach(s => console.log(s.name));
