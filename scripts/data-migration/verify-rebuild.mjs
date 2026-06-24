import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all locations
const { data: locations } = await supabase.from('locations').select('id, name').order('name');

console.log('Verifying rebuild completeness:\n');

for (const loc of locations || []) {
  const locName = loc.name.trim();
  
  // Get staff in staff_locations for this location
  const { count: staffCount } = await supabase
    .from('staff_locations')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', loc.id);

  // Get courses that have training data
  const { data: courseIds } = await supabase
    .from('staff_training_matrix')
    .select('course_id', { distinct: true })
    .eq('completed_at_location_id', loc.id);
  
  const uniqueCourses = new Set(courseIds?.map(c => c.course_id) || []);

  // Get total training records
  const { count: trainingCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('completed_at_location_id', loc.id);

  // Get completed vs na status
  const { count: completedCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .eq('completed_at_location_id', loc.id)
    .eq('status', 'completed');

  console.log(`${locName.padEnd(25)}: ${trainingCount} records (${staffCount} staff, ${uniqueCourses.size} courses)`);
  console.log(`${''.padEnd(25)}  ${completedCount} completed, ${trainingCount - completedCount} na`);
}

console.log('\n✅ Database rebuild verification complete');
