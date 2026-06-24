const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get all staff
  const { data: staff, error: staffError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false)
    .order('full_name');

  if (staffError) {
    console.error('Staff error:', staffError);
    return;
  }

  console.log(`\n📊 Total staff in database: ${staff?.length || 0}`);
  console.log('\nFirst 20 staff:');
  staff?.slice(0, 20).forEach(s => console.log(`  - ${s.full_name}`));

  // Get locations
  const { data: locs, error: locError } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  if (locError) {
    console.error('Location error:', locError);
    return;
  }

  console.log(`\n📍 Locations in daconst { createClient } = require('@supabase/supabase-js');
require('dotenv').conf);require('dotenv').config();

const supabase = createClienoc
const supabase = createCl
    process.env.NEXT_PUBLIC_SUPil  process.env.SUPABASE_SERVICE_ROLE_KEit);

async function check() {
  // Get ng
h >  // Get all staff
  co\n  const { data: sLO    .from('profiles')
    .select('id, full_name')
    .eqon    .select('id, fulat    .eq('is_deleted', falsecs    .order('full_name');

 pN
  if (staffError) {
 g(`     console.error(s?    return;
  }

  console.log(`\n📊 Total /   }

  caff_
 cat  console.log('\nFirst 20 staff:');
  staff?.slice(0, 20).forEach(s =>as  staff?.slice(0, 20).forEach(s => .
  // Get locations
  const { data: locs, error: locError } = await s
    const { data: lif  slError) {
    console.log('Staff locations error:', sl    .select('id, name }    .order('name');

 ? 
  if (locError) {ons    consol${staffLocs?.length || 0}`);
}

check();
