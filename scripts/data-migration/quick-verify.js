require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Peters House').single();
  
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id, display_order, profiles(full_name)')
    .eq('location_id', loc.id)
    .not('display_order', 'is', null)
    .order('display_order', { ascending: true });
    
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('name, display_order')
    .eq('location_id', loc.id)
    .order('display_order', { ascending: true });
  
  // Combine
  const all = [];
  staffLocs.forEach(sl => all.push({ order: sl.display_order, name: sl.profiles.full_name, type: 'staff' }));
  dividers.forEach(d => all.push({ order: d.display_order, name: d.name, type: 'divider' }));
  all.sort((a, b) => a.order - b.order);
  
  console.log('Peters House - Combined list (order, type, name):');
  all.forEach(item => {
    const icon = item.type === 'divider' ? '[DIV]' : '     ';
    console.log(item.order.toString().padStart(2) + '. ' + icon + ' ' + item.name);
  });
  
  // Now compare with CSV
  console.log('\n\nCSV expected order (skipping header rows):');
  const fs = require('fs');
  const content = fs.readFileSync('/Users/matthewfrost/training-portal/csv-import/Peters House Training Matrix - Staff Matrix.csv', 'utf-8');
  const lines = content.split('\n');
  
  let rowNum = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const name = line.split(',')[0].replace(/"/g, '').trim();
    if (!name) continue;
    if (name.toLowerCase() === 'staff name') continue;
    if (name.toLowerCase().includes('date valid')) continue;
    if (name.toLowerCase().includes('mandatory')) continue;
    if (name.toLowerCase().includes('notes')) continue;
    if (name.includes('->')) continue;
    if (name.toLowerCase().includes('training level')) continue;
    if (name.toLowerCase().includes('modules')) continue;
    if (name.toLowerCase().includes('phase')) continue;
    if (name.toLowerCase().includes('core')) continue;
    if (name.toLowerCase().includes('careskills')) continue;
    if (name.toLowerCase().includes('managers')) continue;
    if (name.trim() === '') continue;
    
    rowNum++;
    console.log(rowNum.toString().padStart(2) + '. ' + name);
    if (rowNum >= 30) break;
  }
}

verify().catch(console.error);
