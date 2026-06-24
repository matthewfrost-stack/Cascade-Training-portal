const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearTable() {
  try {
    console.log('Clearing staff_training_matrix table...\n');
    
    // Delete all records
    const { count, error } = await supabase
      .from('staff_training_matrix')
      .delete()
      .neq('id', -1);  // Delete all
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log(`✅ Deleted ${count} records\n`);
    
    // Verify it's empty
    const { count: remaining } = await supabase
      .from('staff_training_matrix')
      .select('id', { count: 'exact', head: true });
    
    console.log(`Records remaining: ${remaining}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

clearTable();
