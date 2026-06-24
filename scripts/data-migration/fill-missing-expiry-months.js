import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  UPDATE ALL COURSES WITH NULL EXPIRY_MONTHS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all courses with NULL expiry_months
  const { data: nullCourses, error } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .is('expiry_months', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${nullCourses.length} courses with NULL expiry_months\n`);

  // Default assignment based on course type
  const updateMap = new Map();

  nullCourses.forEach(course => {
    const name = course.name.toLowerCase();
    let months = 12; // default

    // Assign based on training type
    if (name.includes('prevention') || name.includes('prevent')) months = 12;
    else if (name.includes('safeguarding') || name.includes('coshh')) months = 24;
    else if (name.includes('medication') || name.includes('moving') || name.includes('handling')) months = 12;
    else if (name.includes('first aid')) months = 36;
    else if (name.includes('level') && name.includes('diploma')) months = 24;
    else if (name.includes('awareness')) months = 24;
    else if (name.includes('refresher')) months = 12;
    else if (name.includes('workshop')) months = 12;
    else if (name.includes('induction') || name.includes('training')) months = 12;
    else if (name.includes('only')) months = 24; // Manager/OFSTED/Leader only
    else months = 12; // Default to 1 year

    updateMap.set(course.id, { name: course.name, months });
  });

  console.log('PROPOSED UPDATES:\n');
  
  let count = 0;
  updateMap.forEach((data, id) => {
    count++;
    console.log(`${count}. ${data.name}`);
    console.log(`   → ${data.months} months\n`);
  });

  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  APPLYING ${updateMap.size} UPDATES`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════\n');

  // Apply updates in batches
  let updated = 0;
  const ids = Array.from(updateMap.keys());

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    
    for (const id of batch) {
      const { months } = updateMap.get(id);
      const { error: updateError } = await supabase
        .from('courses')
        .update({ expiry_months: months })
        .eq('id', id);

      if (updateError) {
        console.error(`❌ Failed to update ${id}: ${updateError.message}`);
      } else {
        updated++;
      }
    }

    if (updated % 20 === 0) {
      console.log(`Updated ${updated}/${ids.length}...`);
    }
  }

  console.log(`\n✅ UPDATED: ${updated}/${ids.length} courses`);
}

main().catch(console.error);
