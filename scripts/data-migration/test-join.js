const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testJoin() {
  try {
    console.log('Testing foreign key join...\n');
    
    const { data, error } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        courses (
          expiry_months
        )
      `)
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .limit(3);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('Result:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testJoin();
