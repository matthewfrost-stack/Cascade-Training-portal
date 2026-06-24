require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const locations = ['Banks House School', 'Felix House School', 'Group'];

async function check() {
  for (const locName of locations) {
    console.log('\n===', locName, '===');
    
    // Find CSV file
    const csvDir = '/Users/matthewfrost/training-portal/csv-import';
    const files = fs.readdirSync(csvDir);
    const csvFile = files.find(f => f.toLowerCase().includes(locName.toLowerCase().split(' ')[0]) && f.endsWith('.csv'));
    
    if (!csvFile) {
      console.log('No CSV file found');
      continue;
    }
    
    const content = fs.readFileSync(`${csvDir}/${csvFile}`, 'utf-8');
    const rows = parse(content, { relax_column_count: true });
    
    // Find header row
    let headerRowIndex = -1;
    for (let i = 0; i < 10; i++) {
      if ((rows[i]?.[0] || '').toString().trim().toLowerCase() === 'staff name') {
        headerRowIndex = i;
        break;
      }
    }
    
    // Get unique courses from CSV
    const seenCourses = new Set();
    const csvCourses = [];
    rows[headerRowIndex].slice(1).forEach(c => {
      const name = (c || '').toString().trim();
      const normalized = name.replace(/\s+/g, ' ').toLowerCase();
      if (name && !seenCourses.has(normalized)) {
        seenCourses.add(normalized);
        csvCourses.push(name);
      }
    });
    
    console.log('CSV unique courses:', seenCourses.size);
    
    // Get DB courses for this location
    const { data: location } = await supabase.from('locations').select('id').eq('name', locName).single();
    const { data: dbCourses } = await supabase
      .from('location_training_courses')
      .select('display_order, training_course:training_courses(name)')
      .eq('location_id', location.id)
      .order('display_order');
    
    console.log('DB courses:', dbCourses.length);
    
    // Find missing courses
    const dbCourseNames = dbCourses.map(c => c.training_course.name.toLowerCase().replace(/\s+/g, ' '));
    console.log('\nMissing from DB:');
    csvCourses.forEach((name, i) => {
      const norm = name.toLowerCase().replace(/\s+/g, ' ');
      if (!dbCourseNames.includes(norm)) {
        console.log(`  Position ${i+1}: "${name}"`);
      }
    });
    
    // Check orders
    const orders = dbCourses.map(c => c.display_order).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < orders.length; i++) {
      if (orders[i] !== orders[i-1] + 1) {
        gaps.push(`Gap: ${orders[i-1]} -> ${orders[i]}`);
      }
    }
    if (gaps.length > 0) {
      console.log('\nDisplay order gaps:', gaps.join(', '));
    }
  }
}

check();
