const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// These are category headers/dividers, not actual staff members
const GARBAGE_NAMES = [
  '(Oxford & Cambridge) - August 2018',
  'Bsc Speech and Language Therapy',
  'Chuck',
  'Compliance',
  'Currently Inactive',
  'Date valid for',
  'Finance',
  'Forest Lead/HLTA',
  'Health and Wellbeing',
  'HR',
  'Inactive Staff',
  'IT',
  'Lead Support',
  'Level 2 MCA,ERSAB',
  'Level 2 Reporting concerns,ERSAB',
  'Level 2,Team Teach Advanced',
  'Level 3',
  'Maintenance',
  'Management',
  'Management and Admin',
  'Maternity Leave',
  'Notes',
  'Operations',
  'Phase 1,Careskills',
  'Phase 2,Careskills',
  'Positive Behaviour',
  'Sickness/Maternity',
  'Sponsorship Lead Support',
  'Staff Name',
  'Staff on Maternity',
  'Staff on Probation',
  'Staff on Sick/Maternity',
  'Staff Team',
  'Stiles Staff',
  'Sustainability',
  'Teachers',
  'Teaching Assistants',
  'Team Leaders',
  'The role of the Manager,ERSAB',
  'Training Advanced',
  'Training Level 2,Team Teach',
  'Volunteers',
  'Workforce/Administration',
  'Bank Staff',
];

(async () => {
  console.log('🧹 CLEANING UP CATEGORY HEADERS / NON-STAFF ENTRIES\n');

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false);

  // Find entries to delete
  const toDelete = allProfiles.filter(p => {
    const name = (p.full_name || '').trim();
    
    // Exact match to garbage names
    if (GARBAGE_NAMES.includes(name)) return true;
    
    // Starts with "Level" or "Phase" or "Training"
    if (/^(Level|Phase|Training|Module)/.test(name)) return true;
    
    // Contains too many commas (CSV data)
    if ((name.match(/,/g) || []).length >= 2) return true;
    
    return false;
  });

  console.log(`Found ${toDelete.length} non-staff entries to remove:\n`);
  toDelete.forEach(p => console.log(`  - "${p.full_name}"`));

  if (toDelete.length === 0) {
    console.log('Nothing to delete!');
    return;
  }

  console.log(`\n🗑️  Soft-deleting ${toDelete.length} entries...\n`);

  let deleted = 0;
  for (const entry of toDelete) {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        full_name: '[DELETED - NOT A PERSON]',
        email: `deleted-${entry.id}@system.local`
      })
      .eq('id', entry.id);

    if (!error) {
      deleted++;
    }
  }

  console.log(`✅ Deleted ${deleted}/${toDelete.length} entries\n`);

  // Final count
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false);

  console.log(`📊 Remaining active staff: ${count}`);
})();
