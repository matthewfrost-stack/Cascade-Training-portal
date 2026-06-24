const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Finding unassigned staff...\n');
  
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, location')
    .eq('is_deleted', false)
    .order('full_name');

  const { data: assignedStaff } = await supabase
    .from('staff_locations')
    .select('staff_id');

  const assignedIds = new Set(assignedStaff?.map(s => s.staff_id) || []);
  const unassigned = allProfiles?.filter(p => !assignedIds.has(p.id)) || [];

  console.log(`Found ${unassigned.length} unassigned staff\n`);
  console.log('Examples of unassigned staff:');
  unassigned.slice(0, 10).forEach(p => {
    console.log(`  - ID: ${p.id}`);
    console.log(`    Name: "${p.full_name}"`);
    console.log(`    Email: "${p.email}"`);
    console.log(`    Location: "${p.location}"`);
    console.log('');
  });

  // Find locations mentioned in the unassigned staff
  const locationSet = new Set();
  unassigned.forEach(p => {
    if (p.location && p.location.trim()) {
      locationSet.add(p.location);
    }
  });

  console.log(`Unique locations stored in unassigned staff profiles:`);
  Array.from(locationSet).sort().forEach(loc => {
    console.log(`  - "${loc}"`);
  });

  // Get actual location IDs
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  const locMap = {};
  locations?.forEach(loc => {
    locMap[loc.name] = loc.id;
  });

  console.log(`\nActual locations in database:`);
  locations?.forEach(loc => {
    console.log(`  - "${loc.name}"`);
  });

  // Now let's create the staff_locations entries for unassigned staff
  console.log(`\n\n🔧 FIXING UNASSIGNED STAFF...\n`);

  let fixed = 0;
  let notFound = 0;
  const notFoundLocations = new Set();

  for (const staff of unassigned) {
    if (!staff.location || !staff.location.trim()) {
      console.log(`⚠️  ${staff.full_name}: No location stored, cannot fix`);
      notFound++;
      continue;
    }

    const locName = staff.location.trim();
    const locId = locMap[locName];

    if (!locId) {
      console.log(`⚠️  ${staff.full_name}: Location "${locName}" not found in database`);
      notFoundLocations.add(locName);
      notFound++;
      continue;
    }

    // Insert into staff_locations
    const { error } = await supabase
      .from('staff_locations')
      .insert({
        staff_id: staff.id,
        location_id: locId
      });

    if (error) {
      console.log(`❌ ${staff.full_name}: ${error.message}`);
      notFound++;
    } else {
      console.log(`✅ ${staff.full_name} → ${locName}`);
      fixed++;
    }
  }

  console.log(`\n\n📊 SUMMARY:`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Failed/Not Found: ${notFound}`);
  if (notFoundLocations.size > 0) {
    console.log(`  Locations not in database: ${Array.from(notFoundLocations).join(', ')}`);
  }
})();
