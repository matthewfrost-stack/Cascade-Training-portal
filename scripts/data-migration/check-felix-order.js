require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  // Get Felix House location_id
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Felix House').single();
  console.log('Felix House ID:', loc.id);
  
  // Check if Victoria Beeton exists anywhere
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Victoria%Beeton%');
  console.log('\nVictoria Beeton profiles:', profiles);
  
  // If she exists, check where she's assigned
  if (profiles && profiles.length > 0) {
    const { data: assignments } = await supabase
      .from('staff_locations')
      .select('location_id, display_order, locations(name)')
      .eq('profile_id', profiles[0].id);
    console.log('Her location assignments:', assignments);
  }
  
  // Check staff at Felix House around position 37
  const { data: staff } = await supabase
    .from('staff_locations')
    .select('display_order, profile_id, profiles(full_name)')
    .eq('location_id', loc.id)
    .gte('display_order', 34)
    .lte('display_order', 45)
    .order('display_order');
  console.log('\nFelix House staff around position 37:');
  staff.forEach(s => console.log(`  ${s.display_order}: ${s.profiles.full_name}`));
  
  // Check Felix CSV for Victoria Beeton position
  const fs = require('fs');
  const csvPath = '/Users/matthewfrost/training-portal/csv-import/Felix House Training Matrix - Staff Matrix.csv';
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  console.log('\nFelix CSV around position 37:');
  let staffIndex = 0;
  for (let i = 0; i < lines.length && staffIndex < 45; i++) {
    const firstCell = lines[i].split(',')[0].replace(/"/g, '').trim();
    if (!firstCell || firstCell.includes('Staff Name') || firstCell.includes('Notes')) continue;
    
    const lower = firstCell.toLowerCase();
    const isDivider = ['management', 'team leaders', 'lead support'].includes(lower);
    
    staffIndex++;
    if (staffIndex >= 34 && staffIndex <= 45) {
      console.log(`  ${staffIndex}: ${firstCell} ${isDivider ? '(DIVIDER)' : ''}`);
    }
  }
}

check();
