const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const missingStaff = [
  'Toritseju Tetsuwa',
  'Olaide Olabode',
  'Bolanle Babtola',
  'Anthony Okolie',
  'Victoria Beeton',
  'Deborah Namutebi',
  'Daisy Basey-Fisher',
  'Ian Bunton',
  'Andrew Wright'
];

(async () => {
  console.log('Adding missing staff members...\n');
  
  for (const name of missingStaff) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', name)
      .single()
      .catch(() => ({ data: null }));
    
    if (existing) {
      console.log(`✓ "${name}" already exists`);
      continue;
    }
    
    // Create new profile
    const { data, error } = await supabase
      .from('profiles')
      .insert([{ 
        full_name: name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@training.local`,
        role: 'staff'
      }])
      .select();
    
    if (error) {
      console.log(`✗ Error adding "${name}": ${error.message}`);
    } else {
      console.log(`✓ Added "${name}" (ID: ${data[0].id})`);
    }
  }
  
  console.log('\nDone!');
})();
