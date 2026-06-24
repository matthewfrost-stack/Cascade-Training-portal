import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testAwaiting() {
  console.log('\n🔍 Testing Awaiting Training Records\n');

  // Check count of awaiting records
  const { count, error: countError } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'awaiting');

  console.log(`Total awaiting records: ${count}`);

  if (countError) {
    console.error('Count error:', countError);
  }

  // Get sample awaiting records
  const { data, error } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      status,
      completion_date,
      expiry_date,
      completed_at_location_id,
      profiles(full_name),
      courses(name, category),
      locations(name)
    `)
    .eq('status', 'awaiting')
    .limit(5);

  if (error) {
    console.error('Query error:', error);
  } else {
    console.log(`\nSample awaiting records (showing ${(data || []).length}):`);
    (data || []).forEach((record, i) => {
      console.log(`\n${i + 1}. ${record.profiles?.full_name || 'Unknown'}`);
      console.log(`   Course: ${record.courses?.name || 'Unknown'}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Location: ${record.locations?.name || 'Unknown'}`);
      console.log(`   Completion Date: ${record.completion_date}`);
      console.log(`   Expiry Date: ${record.expiry_date}`);
    });
  }
}

testAwaiting();
