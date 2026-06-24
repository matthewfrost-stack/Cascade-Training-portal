const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStaff() {
  const { data: staff, error } = await supabase
    .from('staff')
    .select('name')
    .limit(100);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample staff names in database:');
  staff.slice(0, 20).forEach(s => console.log(`  "${s.name}"`));
  
  console.log(`\nTotal staff in database: ${staff?.length}`);
  
  // Check for similar names to the missing staff
  const missingNames = ['Toritseju Tetsuwa', 'Olaide Olabode', 'Bolanle Babtola', 'Anthony Okolie', 'Victoria Beeton', 'Deborah Namutebi', 'Daisy Basey-Fisher', 'Ian Bunton', 'Andrew Wright'];
  
  console.log('\nLooking for missing staff...');
  for (const missing of missingNames) {
    const found = staff.find(s => s.name.toLowerCase() === missing.toLowerCase());
    if (found) {
      console.log(`  "${missing}" -> Found as "${found.name}"`);
    } else {
      console.log(`  "${missing}" -> NOT FOUND`);
    }
  }
}

checkStaff();
