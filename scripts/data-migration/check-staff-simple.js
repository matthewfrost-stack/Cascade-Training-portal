import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStaffOrdering() {
  console.log('Checking staff ordering and dividers...\n');

  try {
    // Get all staff members
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, display_order')
      .order('display_order', { ascending: true });

    if (profileError) throw profileError;

    console.log(`Total staff members: ${profiles.length}\n`);

    // Group by display_order to find dividers
    const orderMap = {};
    
    profiles.forEach(profile => {
      if (!orderMap[profile.display_order]) {
        orderMap[profile.display_order] = [];
      }
      orderMap[profile.display_order].push(profile);
    });

    console.log('=== FIRST 30 STAFF IN ORDER ===\n');
    let count = 0;
    for (const [order, staffList] of Object.entries(orderMap)) {
      if (count >= 30) break;
      
      staffList.forEach(staff => {
        if (count >= 30) return;
        const isDivider = staff.name && (
          staff.name.toLowerCase().includes('maternity') ||
          staff.name.toLowerCase().includes('sick') ||
          staff.name.toLowerCase().includes('leave') ||
          staff.name.toLowerCase().includes('---')
        );
        
        const marker = isDivider ? ' [DIVIDER]' : '';
        console.log(`${count + 1}. Order ${order}: ${staff.name}${marker}`);
        count++;
      });
    }

    // Check locations
    console.log('\n=== LOCATIONS ===\n');
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name')
      .limit(3);

    if (locError) throw locError;

    console.log(`Found ${locations.length} locations\n`);
    locations.forEach(loc => console.log(`- ${loc.name}`));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  }
}

checkStaffOrdering();
