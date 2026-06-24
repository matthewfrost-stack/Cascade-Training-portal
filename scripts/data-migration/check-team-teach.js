require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTeamTeach() {
  const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';
  const file = 'Banks House School Training Matrix - Staff Matrix.csv';
  
  const content = fs.readFileSync(path.join(CSV_DIR, file), 'utf-8');
  const rows = parse(content, { relax_column_count: true });
  
  let headerRow = -1;
  for (let i = 0; i < 10; i++) {
    if ((rows[i][0] || '').toString().trim().toLowerCase() === 'staff name') {
      headerRow = i;
      break;
    }
  }
  
  const course38 = rows[headerRow][38]; // Position 38 in header (0-indexed is 37, but first col is Staff Name so it's 38)
  console.log('CSV Position 38 raw:');
  console.log(JSON.stringify(course38));
  console.log('Length:', course38.length);
  console.log('Char codes:', [...course38].map(c => c.charCodeAt(0)));
  
  // Get DB course at position 38
  const { data: dbCourse } = await supabase
    .from('location_training_courses')
    .select('display_order, training_courses(name)')
    .eq('location_id', '2774c73f-03a5-4816-a3a9-9538ed12ff49') // Banks House School
    .eq('display_order', 38)
    .single();
  
  console.log('\nDB Position 38:');
  console.log(JSON.stringify(dbCourse?.training_courses?.name));
  console.log('Length:', dbCourse?.training_courses?.name?.length);
  console.log('Char codes:', [...(dbCourse?.training_courses?.name || '')].map(c => c.charCodeAt(0)));
  
  // Compare normalized
  const csvNorm = (course38 || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const dbNorm = (dbCourse?.training_courses?.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  
  console.log('\nNormalized comparison:');
  console.log('CSV:', csvNorm);
  console.log('DB:', dbNorm);
  console.log('Match:', csvNorm === dbNorm);
}

checkTeamTeach();
