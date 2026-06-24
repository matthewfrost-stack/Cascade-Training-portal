import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStaffUsage() {
  // Get corrupt profile IDs
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name');

  const badProfiles = (allProfiles || []).filter(p => 
    p.full_name.includes(',') || 
    p.full_name.includes('N/A') || 
    p.full_name.length > 100
  );

  console.log(`\nFound ${badProfiles.length} corrupt profiles\n`);

  if (badProfiles.length === 0) {
    console.log('No corrupt profiles found!');
    process.exit(0);
  }

  // Check if any of these are referenced in staff_training_matrix
  const badIds = badProfiles.map(p => p.id);
  const { count: usedCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .in('staff_id', badIds);

  console.log(`Corrupt profiles used in training matrix: ${usedCount} records`);

  if ((usedCount || 0) > 0) {
    console.log('❌ These corrupt profiles ARE being used - they will cause issues!\n');
    
    // Show samples
    const { data: usageSamples } = await supabase
      .from('staff_training_matrix')
      .select('staff_id, course_id')
      .in('staff_id', badIds)
      .limit(3);

    console.log('Sample usages:');
    usageSamples?.forEach(rec => {
      const profile = badProfiles.find(p => p.id === rec.staff_id);
      console.log(`  - Staff "${profile?.full_name.substring(0, 40)}" used in ${rec.course_id}`);
    });
  } else {
    console.log('✅ These corrupt profiles are NOT used in training matrix - safe to ignore');
  }
}

checkStaffUsage();
