require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIVIDER_LABELS = [
  'team leaders', 'team leader', 'lead support', 'lead supports',
  'support workers', 'support staff', 'management', 'management and admin',
  'admin', 'health and wellbeing', 'waking night', 'waking nights',
  'teachers', 'teaching staff', 'education', 'senior', 'seniors',
  'deputy', 'deputies', 'registered manager', 'managers', 'adult education'
];

function isDividerLabel(name) {
  const lower = name.toLowerCase().trim();
  return DIVIDER_LABELS.some(d => lower === d);
}

(async () => {
  // Get Felix House location
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('name', 'Felix House')
    .single();
  
  // Get staff at Felix House in DB
  const { data: dbStaff } = await supabase
    .from('staff_locations')
    .select('staff_id, profiles(full_name)')
    .eq('location_id', loc.id);
  
  const dbNames = new Set(dbStaff.map(s => s.profiles?.full_name?.toLowerCase().trim()).filter(Boolean));
  
  // Parse Felix House CSV
  const content = fs.readFileSync('/Users/matthewfrost/training-portal/csv-import/Felix House Training Matrix - Staff Matrix.csv', 'utf-8');
  const lines = content.split('\n');
  
  const csvStaff = [];
  for (const line of lines) {
    const cells = line.split(',');
    const name = cells[0]?.trim();
    if (!name) continue;
    if (isDividerLabel(name)) continue;
    
    // Check if has dates
    const hasDate = cells.slice(1, 10).some(c => c && c.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/));
    if (hasDate && name.split(' ').length >= 2) {
      csvStaff.push(name);
    }
  }
  
  console.log('Felix House CSV staff:', csvStaff.length);
  console.log('Felix House DB staff:', dbStaff.length);
  
  // Find CSV staff not in DB
  const notInDb = csvStaff.filter(name => {
    const lower = name.toLowerCase().trim();
    const firstName = lower.split(' ')[0];
    return !Array.from(dbNames).some(dbName => 
      dbName === lower || dbName.startsWith(firstName) || lower.startsWith(dbName.split(' ')[0])
    );
  });
  
  console.log('\nCSV staff not found in Felix House DB:', notInDb.length);
  notInDb.forEach(n => console.log('  -', n));
  
  // Check if they exist elsewhere
  for (const name of notInDb) {
    const firstName = name.split(' ')[0];
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', firstName + '%')
      .limit(1);
    
    if (profile && profile[0]) {
      const { data: locs } = await supabase
        .from('staff_locations')
        .select('locations(name)')
        .eq('staff_id', profile[0].id);
      
      const locNames = locs.map(l => l.locations?.name).filter(Boolean);
      console.log(`  -> ${profile[0].full_name} is at: ${locNames.join(', ')}`);
    }
  }
})();
