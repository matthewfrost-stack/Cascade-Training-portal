const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log('Cleaning up location_training_courses...');
  
  // Delete all location_training_courses with display_order = 0
  const { data: oldRecords, error: fetchError } = await supabase
    .from('location_training_courses')
    .select('id')
    .eq('display_order', 0);
  
  console.log('Records with display_order = 0:', oldRecords?.length || 0);
  
  if (oldRecords && oldRecords.length > 0) {
    const { error } = await supabase
      .from('location_training_courses')
      .delete()
      .eq('display_order', 0);
    
    if (error) {
      console.error('Error deleting:', error);
    } else {
      console.log('Deleted old records with display_order = 0');
    }
  }
  
  // Now check the first 15 courses again
  const { data } = await supabase
    .from('location_training_courses')
    .select('display_order, training_courses(name)')
    .eq('location_id', '62dca354-f597-4c7a-96f5-6a9308eafb35')
    .order('display_order')
    .limit(15);
  
  console.log('\nArmfield House courses after cleanup (first 15):');
  data?.forEach(c => {
    console.log(`  ${c.display_order}. ${c.training_courses?.name}`);
  });
}

cleanup();
