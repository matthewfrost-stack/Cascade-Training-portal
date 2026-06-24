const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanAndVerify() {
  try {
    console.log('Checking records without completion_date...\n');
    
    const { data: noDateRecords, error } = await supabase
      .from('staff_training_matrix')
      .select('id, staff_id, course_id, status, completion_date', { count: 'exact' })
      .is('completion_date', null)
      .limit(10);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log(`Sample of records without completion_date:`);
    console.log(noDateRecords);
    
    // Get total count
    const { count } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .is('completion_date', null);
    
    console.log(`\nTotal records without completion_date: ${count}`);
    
    // Get total records with dates
    const { count: withDates } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true })
      .not('completion_date', 'is', null);
    
    console.log(`Total records with completion_date: ${withDates}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

cleanAndVerify();
