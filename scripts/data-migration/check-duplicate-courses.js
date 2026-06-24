require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name')
    .order('name', { ascending: true });
  
  console.log('Total courses:', courses.length);
  
  console.log('\nCourses with (Careskills) suffix:');
  const careskills = courses.filter(c => c.name.includes('(Careskills)'));
  console.log('Count:', careskills.length);
  careskills.slice(0, 10).forEach(c => console.log(' -', c.name));
  
  console.log('\nCourses without (Careskills) suffix that might have duplicates:');
  const base = courses.filter(c => !c.name.includes('(Careskills)'));
  
  let dupCount = 0;
  base.forEach(b => {
    const baseName = b.name.trim();
    const dup = careskills.find(c => {
      const careName = c.name.replace(' (Careskills)', '').trim();
      return careName.toLowerCase() === baseName.toLowerCase();
    });
    if (dup) {
      dupCount++;
      console.log(` - Base: "${b.name}"`);
      console.log(`   Dup:  "${dup.name}"`);
    }
  });
  console.log('\nTotal duplicate pairs:', dupCount);
}

check().catch(console.error);
