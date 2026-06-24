const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: staff } = await supabase
    .from('profiles')
    .select('full_name')
    .order('full_name');

  const namesToFind = [
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

  console.log('Checking for missing staff in database:\n');
  
  for (const name of namesToFind) {
    const found = staff?.find(s => s.full_name.toLowerCase() === name.toLowerCase());
    if (!found) {
      console.log(`NOT IN DATABASE: "${name}"`);
    } else {
      console.log(`Found: "${found.full_name}"`);
    }
  }

  console.log(`\nTotal staff in database: ${staff?.length}`);
  console.log('\nShowing all staff with similar first names:');
  
  const firstNames = new Set();
  namesToFind.forEach(n => {
    const firstName = n.split(' ')[0].toLowerCase();
    firstNames.add(firstName);
  });

  staff?.filter(s => {
    const first = s.full_name.split(' ')[0].toLowerCase();
    return firstNames.has(first);
  }).forEach(s => {
    console.log(`  "${s.full_name}"`);
  });
})();
