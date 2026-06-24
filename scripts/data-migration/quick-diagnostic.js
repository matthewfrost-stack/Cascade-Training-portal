require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function quickDiagnostic() {
  console.log('Quick database diagnostic...\n');

  try {
    // Use raw SQL for efficiency
    const { data: results, error } = await supabase.rpc('get_training_issues');
    
    if (error && error.code === 'PGRST101') {
      console.log('RPC not found, using alternative approach...\n');
      
      // Alternative: Get summary counts
      const { data: allRecs } = await supabase.from('staff_training_matrix').select('id, completion_date, expiry_date');
      
      let stats = {
        total: allRecs?.length || 0,
        withCompletion: 0,
        withExpiry: 0,
        valid: 0
      };

      for (const rec of (allRecs || [])) {
        if (rec.completion_date) stats.withCompletion++;
        if (rec.expiry_date) stats.withExpiry++;
        if (rec.completion_date && rec.expiry_date) stats.valid++;
      }

      console.log('Database Summary:');
      console.log(`  Total records: ${stats.total}`);
      console.log(`  With completion_date: ${stats.withCompletion}`);
      console.log(`  With expiry_date: ${stats.withExpiry}`);
      console.log(`  Both dates present: ${stats.valid}`);
      console.log(`  Missing completion_date: ${stats.total - stats.withCompletion}`);
      console.log(`  Missing expiry_date (with completion): ${stats.withCompletion - stats.valid}`);
      
      return;
    }

    if (error) throw error;
    
    console.log('Results:', results);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

quickDiagnostic();
