import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStaffOrderingInUI() {
  console.log('Checking staff display order in training matrix UI...\n');

  try {
    // Get locations
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    console.log(`Found ${locations.length} locations\n`);

    // Check first location
    const armfield = locations.find(l => l.name === 'Armfield House');
    if (armfield) {
      console.log(`=== ${armfield.name} ===\n`);

      // Get all unique staff at this location from training matrix
      const { data: allRecords } = await supabase
        .from('staff_training_matrix')
        .select(`
          staff_id,
          profiles!staff_id (id, full_name, display_order)
        `)
        .eq('completed_at_location_id', armfield.id);

      if (allRecords && allRecords.length > 0) {
        // Get unique staff with their display_order
        const staffMap = new Map();
        allRecords.forEach(record => {
          if (record.profiles && !staffMap.has(record.profiles.id)) {
            staffMap.set(record.profiles.id, {
              id: record.profiles.id,
              name: record.profiles.full_name,
              order: record.profiles.display_order
            });
          }
        });

        // Sort by display_order
        const sortedStaff = Array.from(staffMap.values()).sort((a, b) => a.order - b.order);

        console.log(`Total unique staff: ${sortedStaff.length}\n`);
        console.log('Staff in order:');
        sortedStaff.forEach((staff, i) => {
          const isDivider = staff.name.toLowerCase().includes('maternity') || 
                           staff.name.toLowerCase().includes('sick') ||
                           staff.name.toLowerCase().includes('leave') ||
                           staff.name.includes('---');
          const marker = isDivider ? ' [DIVIDER]' : '';
          console.log(`${i + 1}. Order ${staff.order}: ${staff.name}${marker}`);
        });

        // Check if there are any missing dividers
        console.log('\n=== CHECKING FOR MISSING DIVIDERS ===');
        console.log('Looking for staff names that should be dividers...\n');

        const suspiciousNames = ['maternity', 'sick', 'leave', 'on leave', 'awaiting', 'absent'];
        const staffWithSuspiciousNames = sortedStaff.filter(s => {
          const nameLower = s.name.toLowerCase();
          return suspiciousNames.some(sus => nameLower.includes(sus));
        });

        if (staffWithSuspiciousNames.length > 0) {
          console.log('Found potential divider entries:');
          staffWithSuspiciousNames.forEach(staff => {
            console.log(`  - Order ${staff.order}: ${staff.name}`);
          });
        } else {
          console.log('No divider entries found - may need to add them manually');
        }
      }
    }

    // Check all locations for gaps in display_order
    console.log('\n=== CHECKING ALL LOCATIONS FOR ORDER GAPS ===\n');

    for (const location of locations) {
      const { data: allRecords } = await supabase
        .from('staff_training_matrix')
        .select(`profiles!staff_id (display_order)`)
        .eq('completed_at_location_id', location.id);

      if (allRecords && allRecords.length > 0) {
        const orders = new Set(allRecords.map(r => r.profiles?.display_order).filter(o => o !== null));
        const maxOrder = Math.max(...orders);
        
        // Check for gaps
        const allOrders = Array.from(orders).sort((a, b) => a - b);
        const gaps = [];
        
        for (let i = 0; i < allOrders.length - 1; i++) {
          if (allOrders[i + 1] - allOrders[i] > 1) {
            gaps.push(`${allOrders[i]}-${allOrders[i + 1]}`);
          }
        }

        if (gaps.length > 0) {
          console.log(`${location.name}: ${gaps.length} order gaps: ${gaps.join(', ')}`);
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStaffOrderingInUI();
