const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugQuery() {
  try {
    console.log('Checking what data looks like...\n');
    
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        completion_date,
        course_id,
        expiry_date
      `)
      .not('completion_date', 'is', null)
      .is('expiry_date', null)
      .limit(5);
    
    console.log('Sample records:');
    console.log(JSON.stringify(records, null, 2));
    
    // Get the course info for the first one
    if (records && records.length > 0) {
      const { data: course } = await supabase
        .from('courses')
        .select('id, name, expiry_months')
        .eq('id', records[0].course_id)
        .single();
      
      console.log('\nCourse info:');
      console.log(JSON.stringify(course, null, 2));
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

debugQuery();
