import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStaffOrder() {
  console.log('Checking staff ordering per location...\n');

  try {
    // Get all locations
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    console.log(`Found ${locations.length} locations\n`);

    // Check first location in detail
    const loc = locations[0];
    console.log(`=== ${loc.name} STAFF ORDER ===\n`);

    const { data: staffAtLocation } = await supabase
      .from('staff_locations')
      .select(`
        id,
        staff_id,
        display_order,
        profiles!staff_locations_staff_id_fkey (id, full_name)
      `)
      .eq('location_id', loc.id)
      .order('display_order', { ascending: true });

    if (staffAtLocation && staffAtLocation.length > 0) {
      console.log(`Total staff: ${staffAtLocation.length}\n`);
      
      // Show first 30 in order
      staffAtLocation.slice(0, 30).forEach((sl, i) => {
        const name = sl.profiles?.full_name || 'Unknown';
        const isDivider = name.toLowerCase().includes('maternity') || 
                         name.toLowerCase().includes('sick') ||
                         name.toLowerCase().includes('leave') ||
                         name.includes('---');
        const marker = isDivider ? ' [DIVIDER]' : '';
        console.log(`${i + 1}. Order ${sl.display_order}: ${name}${marker}`);
      });
      
      // Check for potential dividers
      const potentialDividers = staffAtLocation.filter(sl => {
        const name = (sl.profiles?.full_name || '').toLowerCase();
        return name.includes('maternity') || name.includes('sick') || name.includes('leave') || name.includes('---');
      });
      
      if (potentialDividers.length > 0) {
        console.log(`\n⚠️  Found ${potentialDividers.length} potential dividers:`);
        potentialDividers.forEach(sl => {
          console.log(`  - Order ${sl.display_order}: ${sl.profiles?.full_name}`);
        });
      } else {
        console.log('\n✓ No dividers found');
      }
    }

    // Check all locations for divider sections
    console.log(`\n=== DIVIDER ANALYSIS ACROSS ALL LOCATIONS ===\n`);
    
    for (const location of locations.slice(0, 3)) {
      const { data: staff } = await supabase
        .from('staff_locations')
        .select(`
          display_order,
          profiles!staff_locations_staff_id_fkey (full_name)
        `)
        .eq('location_id', location.id)
        .order('display_order', { ascending: true });

      if (staff && staff.length > 0) {
        const dividers = staff.filter(s => {
          const name = (s.profiles?.full_name || '').toLowerCase();
          return name.includes('maternity') || name.includes('sick') || name.includes('leave');
        });

        if (dividers.length > 0) {
          console.log(`${location.name}: ${dividers.length} divider sections`);
          dividers.forEach(d => {
            console.log(`  - Order ${d.display_order}: ${d.profiles?.full_name}`);
          });
        } else {
          console.log(`${location.name}: No divider sections found`);
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStaffOrder();
