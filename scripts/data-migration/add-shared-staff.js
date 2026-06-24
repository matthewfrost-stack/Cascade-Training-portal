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

// Pairs of locations that share staff
const sharedPairs = [
  ['Stiles House', 'Felix House'],
  ['Hurst House', 'Banks House School']
];

const locationFiles = {
  'Stiles House': 'Stiles House Training Matrix - Staff Matrix.csv',
  'Felix House': 'Felix House Training Matrix - Staff Matrix.csv',
  'Hurst House': 'Hurst House Training Matrix - Staff Matrix.csv',
  'Banks House School': 'Banks House School Training Matrix - Staff Matrix.csv'
};

(async () => {
  console.log('=== Adding Missing Shared Staff ===\n');
  
  const { data: locations } = await supabase.from('locations').select('id, name');
  const locMap = new Map(locations.map(l => [l.name, l.id]));
  
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false);
  
  // Create name lookup
  const nameToId = new Map();
  for (const p of allProfiles) {
    if (p.full_name) {
      nameToId.set(p.full_name.toLowerCase().trim(), p.id);
      // Also add by first name
      const firstName = p.full_name.split(' ')[0].toLowerCase();
      if (!nameToId.has(firstName)) {
        nameToId.set(firstName, p.id);
      }
    }
  }
  
  for (const [loc1, loc2] of sharedPairs) {
    console.log(`\nProcessing: ${loc1} <-> ${loc2}`);
    
    for (const locName of [loc1, loc2]) {
      const locId = locMap.get(locName);
      const csvFile = locationFiles[locName];
      const csvPath = `/Users/matthewfrost/training-portal/csv-import/${csvFile}`;
      
      if (!fs.existsSync(csvPath)) continue;
      
      // Get current staff at location
      const { data: currentStaff } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .eq('location_id', locId);
      const currentIds = new Set(currentStaff.map(s => s.staff_id));
      
      // Parse CSV for staff names
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');
      
      let added = 0;
      let displayOrder = currentStaff.length + 100; // Start after existing staff
      
      for (const line of lines) {
        const cells = line.split(',');
        const name = cells[0]?.trim();
        if (!name) continue;
        if (isDividerLabel(name)) continue;
        
        const hasDate = cells.slice(1, 10).some(c => c && c.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/));
        if (!hasDate && name.split(' ').length < 2) continue;
        
        // Find staff ID
        const lower = name.toLowerCase().trim();
        const firstName = lower.split(' ')[0];
        
        let staffId = nameToId.get(lower);
        if (!staffId) {
          // Try exact first+last match
          for (const [key, id] of nameToId) {
            if (key.startsWith(firstName) && key.includes(lower.split(' ').pop())) {
              staffId = id;
              break;
            }
          }
        }
        
        if (staffId && !currentIds.has(staffId)) {
          // Add to this location
          const { error } = await supabase
            .from('staff_locations')
            .insert({
              staff_id: staffId,
              location_id: locId,
              display_order: displayOrder++
            });
          
          if (!error) {
            added++;
            currentIds.add(staffId);
            console.log(`  Added ${name} to ${locName}`);
          }
        }
      }
      
      if (added > 0) {
        console.log(`  -> Added ${added} staff to ${locName}`);
      }
    }
  }
  
  console.log('\n=== Done ===');
})();
