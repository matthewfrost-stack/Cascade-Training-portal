const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Group courses by expiry_months
  const { data } = await supabase
    .from('training_courses')
    .select('name, expiry_months');
  
  const byExpiry = {};
  data?.forEach(c => {
    const key = c.expiry_months || 'null';
    if (!byExpiry[key]) byExpiry[key] = [];
    byExpiry[key].push(c.name);
  });
  
  console.log('Courses grouped by expiry_months:');
  Object.keys(byExpiry).sort((a, b) => Number(a) - Number(b)).forEach(exp => {
    console.log('\n  ' + exp + ' months: ' + byExpiry[exp].length + ' courses');
    if (exp === '12') {
      console.log('    (Sample): ' + byExpiry[exp].slice(0, 5).join(', '));
    } else {
      console.log('    ' + byExpiry[exp].slice(0, 10).join(', '));
    }
  });
}

check();
