import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyDeliveryTypes() {
  console.log('\n✅ Verifying Delivery Types in location_courses\n');

  // Get Armfield House location
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('name', 'Armfield House');

  if (!locations || locations.length === 0) {
    console.log('Armfield House location not found');
    return;
  }

  const armfieldId = locations[0].id;

  // Get location courses with delivery types
  const { data: courses, error } = await supabase
    .from('location_courses')
    .select(`
      id,
      delivery_type,
      courses(name)
    `)
    .eq('location_id', armfieldId)
    .order('display_order', { ascending: true })
    .limit(15);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`📍 Armfield House - Sample of ${courses?.length || 0} courses:\n`);
  (courses || []).forEach((course, i) => {
    console.log(`${i + 1}. ${course.courses?.name}`);
    console.log(`   Delivery Type: ${course.delivery_type || 'Not set'}\n`);
  });
}

verifyDeliveryTypes();
