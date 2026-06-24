import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfiles() {
  // Check first 20 profiles
  const { data: profiles, error: err1 } = await supabase
    .from('profiles')
    .select('id, full_name')
    .limit(20);

  if (err1) {
    console.error('Error:', err1);
    process.exit(1);
  }

  console.log('\n🔍 First 20 profiles:');
  profiles?.forEach((p, i) => {
    const isBad = p.full_name.includes('N/A') || p.full_name.includes(',') || p.full_name.length > 100;
    const marker = isBad ? '❌' : '✅';
    const shortName = p.full_name.substring(0, 50) + (p.full_name.length > 50 ? '...' : '');
    console.log(`${marker} ${i+1}. "${shortName}"`);
  });

  // Count bad profiles
  const { data: allProfiles, error: err2 } = await supabase
    .from('profiles')
    .select('id, full_name');

  if (err2) {
    console.error('Error fetching all profiles:', err2);
    process.exit(1);
  }

  const badProfiles = (allProfiles || []).filter(p => 
    p.full_name.includes(',') || 
    p.full_name.includes('N/A') || 
    p.full_name.length > 100
  );

  console.log(`\n⚠️  Total profiles: ${allProfiles?.length}`);
  console.log(`❌ Corrupt profiles: ${badProfiles.length}`);

  if (badProfiles.length > 0) {
    console.log(`\nSample corrupt profiles:`);
    badProfiles.slice(0, 3).forEach(p => {
      console.log(`  - "${p.full_name.substring(0, 80)}"`);
    });
  }
}

checkProfiles();
