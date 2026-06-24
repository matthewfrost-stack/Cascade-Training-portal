const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: dbStaff } = await supabase
    .from('profiles')
    .select('full_name');

  console.log('Sample staff names in database:');
  dbStaff?.slice(0, 20).forEach(s => console.log(`  "${s.full_name}"`));
  
  console.log('\nLooking for:');
  const toFind = ['Toritseju Tetsuwa', 'Olaide Olabode', 'Bolanle Babtola', 'Anthony Okolie'];
  toFind.forEach(name => {
    const found = dbStaff?.find(s => s.full_name.toLowerCase() === name.toLowerCase());
    console.log(`  "${name}" -> ${found ? 'FOUND' : 'NOT FOUND'}`);
  });
})();
