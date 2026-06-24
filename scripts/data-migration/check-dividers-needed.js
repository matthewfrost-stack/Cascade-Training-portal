import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDividersNeeded() {
  console.log('Analyzing staff dividers across all locations...\n');

  try {
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    // Keywords currently detected in code
    const currentKeywords = [
      'management', 'team leader', 'lead support', 'staff team', 'staff on probation',
      'inactive staff', 'teachers', 'teaching assistants', 'operations', 'sustainability',
      'health and wellbeing', 'compliance', 'adult education', 'admin', 'hlta', 'forest'
    ];

    // Additional dividers that might be needed
    const additionalKeywords = [
      'maternity', 'sick', 'on leave', 'leave', 'awaiting', 'absent',
      'bank staff', 'agency', 'temporary', 'contractors'
    ];

    console.log('=== CURRENT DIVIDER KEYWORDS ===');
    currentKeywords.forEach(k => console.log(`  • ${k}`));

    console.log('\n=== CHECKING FOR MISSING DIVIDERS ===\n');

    for (const location of locations) {
      const { data: allStaffAtLocation } = await supabase
        .from('staff_locations')
        .select('staff_id, profiles!staff_id (full_name)')
        .eq('location_id', location.id);

      if (!allStaffAtLocation || allStaffAtLocation.length === 0) continue;

      // Extract unique staff names
      const staffNames = allStaffAtLocation
        .map((sl) => sl.profiles?.full_name)
        .filter(Boolean)
        .sort();

      // Check for current dividers
      const foundCurrentDividers = staffNames.filter(name =>
        currentKeywords.some(kw => name.toLowerCase().includes(kw))
      );

      // Check for additional dividers
      const foundAdditionalDividers = staffNames.filter(name =>
        additionalKeywords.some(kw => name.toLowerCase().includes(kw))
      );

      if (foundCurrentDividers.length > 0 || foundAdditionalDividers.length > 0) {
        console.log(`${location.name}:`);
        
        if (foundCurrentDividers.length > 0) {
          console.log(`  Current dividers (${foundCurrentDividers.length}):`);
          foundCurrentDividers.forEach(name => console.log(`    ✓ ${name}`));
        }
        
        if (foundAdditionalDividers.length > 0) {
          console.log(`  Additional dividers NEEDED (${foundAdditionalDividers.length}):`);
          foundAdditionalDividers.forEach(name => console.log(`    ⚠️  ${name}`));
        }
      } else if (staffNames.length > 0) {
        console.log(`${location.name}: ${staffNames.length} staff, no dividers found`);
      }
    }

    // Check what dividers actually exist in profiles
    console.log('\n=== CHECKING ACTUAL STAFF NAMES ===\n');

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('full_name')
      .ilike('full_name', '%management%')
      .or('full_name.ilike.%team leader%,full_name.ilike.%maternity%,full_name.ilike.%sick%,full_name.ilike.%leave%');

    if (allProfiles && allProfiles.length > 0) {
      console.log(`Found ${allProfiles.length} potential divider staff:`);
      allProfiles.forEach(p => console.log(`  - ${p.full_name}`));
    } else {
      console.log('No divider staff names found in profiles');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDividersNeeded();
