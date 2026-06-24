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
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, display_order')
      .order('display_order', { ascending: true });

    console.log(`Total staff members: ${profiles.length}\n`);

    // Group by display_order to find dividers
    const orderMap = {};
    const dividers = [];
    
    profiles.forEach(profile => {
      if (!orderMap[profile.display_order]) {
        orderMap[profile.display_order] = [];
      }
      orderMap[profile.display_order].push(profile);
    });

    console.log('=== STAFF ORDERING ===\n');
    let currentOrder = 0;
    for (const [order, staffList] of Object.entries(orderMap)) {
      const orderNum = parseInt(order);
      
      // Check for gaps that might indicate dividers
      if (orderNum - currentOrder > 1) {
        console.log(`[GAP: orders ${currentOrder + 1}-${orderNum - 1}]`);
      }

      staffList.forEach(staff => {
        const isDivider = staff.name && (
          staff.name.toLowerCase().includes('maternity') ||
          staff.name.toLowerCase().includes('sick') ||
          staff.name.toLowerCase().includes('leave') ||
          staff.name.toLowerCase().includes('---') ||
          staff.name.toLowerCase() === '---'
        );
        
        const marker = isDivider ? '[DIVIDER]' : '';
        console.log(`  Order ${order}: ${staff.name} ${marker}`);
      });

      currentOrder = orderNum;
    }

    // Check for potential locations needing dividers
    console.log('\n=== CHECKING LOCATIONS FOR DIVIDERS ===\n');
    
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name');

    for (const location of locations) {
      const { data: staffAtLocation } = await supabase
        .from('staff_locations')
        .select(`
          id,
          profiles (id, name, display_order)
        `)
        .eq('location_id', location.id)
        .order('display_order', { ascending: true });

      if (staffAtLocation && staffAtLocation.length > 0) {
        console.log(`${location.name}: ${staffAtLocation.length} staff members`);
        
        // Check for suspicious names that might be dividers
        staffAtLocation.forEach(sl => {
          if (sl.profiles && sl.profiles.name) {
            const name = sl.profiles.name.toLowerCase();
            if (name.includes('maternity') || name.includes('sick') || name.includes('leave')) {
              console.log(`  ⚠️  Potential divider: "${sl.profiles.name}"`);
            }
          }
        });
      }
    }

    // Look at a specific location in detail
    console.log('\n=== ARMFIELD HOUSE STAFF DETAIL ===\n');
    const armfield = locations.find(l => l.name === 'Armfield House');
    if (armfield) {
      const { data: staffList } = await supabase
        .from('staff_locations')
        .select(`
          id,
          profiles (id, name, display_order)
        `)
        .eq('location_id', armfield.id)
        .order('display_order', { ascending: true })
        .limit(20);

      if (staffList && staffList.length > 0) {
        staffList.forEach((sl, i) => {
          console.log(`${i + 1}. Order ${sl.profiles.display_order}: ${sl.profiles.name}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStaffOrdering();
