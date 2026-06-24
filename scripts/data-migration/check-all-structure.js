import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllTables() {
  console.log('Checking database structure...\n');

  try {
    // Check what tables exist by attempting to query them
    const tables = ['staff_locations', 'profiles', 'locations', 'staff_training_matrix'];

    for (const table of tables) {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .limit(1);

      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✓ ${table}: ${count} records`);
        if (data && data[0]) {
          console.log(`  Sample columns: ${Object.keys(data[0]).slice(0, 5).join(', ')}`);
        }
      }
    }

    // Now check staff_training_matrix for location info
    console.log('\n=== STAFF IN TRAINING MATRIX ===\n');
    
    const { data: trainingRecords } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        staff_id,
        completed_at_location_id,
        locations (id, name)
      `)
      .limit(5);

    if (trainingRecords && trainingRecords[0]) {
      console.log('Sample record:');
      console.log(JSON.stringify(trainingRecords[0], null, 2));
    }

    // Get unique staff per location from training matrix
    console.log('\n=== STAFF PER LOCATION (from training matrix) ===\n');
    
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    for (const location of locations.slice(0, 2)) {
      const { data: staffAtLoc } = await supabase
        .from('staff_training_matrix')
        .select(`
          staff_id,
          profiles!staff_id (full_name)
        `)
        .eq('completed_at_location_id', location.id)
        .limit(10);

      if (staffAtLoc && staffAtLoc.length > 0) {
        const uniqueStaff = [...new Set(staffAtLoc.map(s => s.profiles?.full_name))];
        console.log(`${location.name}: ${uniqueStaff.length} unique staff`);
        uniqueStaff.slice(0, 5).forEach(name => console.log(`  - ${name}`));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAllTables();
