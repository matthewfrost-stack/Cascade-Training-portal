require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMissing() {
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Peters House').single();
  
  // Check Chloe Rutland's records
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('full_name', 'Chloe Rutland')
    .single();
  
  console.log('Chloe Rutland profile ID:', profile.id);
  
  // Get all her training records
  const { data: allTraining } = await supabase
    .from('staff_training_matrix')
    .select('course_id, completion_date, status, training_courses(name)')
    .eq('staff_id', profile.id);
  
  console.log('All training records for Chloe Rutland:', allTraining?.length || 0);
  allTraining?.forEach(t => {
    const date = t.completion_date ? new Date(t.completion_date).toLocaleDateString('en-GB') : t.status || 'none';
    console.log('  -', t.training_courses?.name, ':', date);
  });
  
  // Check for courses with "Safeguarding" in name
  const safeguarding = allTraining?.filter(t => t.training_courses?.name?.toLowerCase().includes('safeguard'));
  console.log('\nSafeguarding-related courses:', safeguarding?.length || 0);
  safeguarding?.forEach(t => {
    const date = t.completion_date ? new Date(t.completion_date).toLocaleDateString('en-GB') : t.status || 'none';
    console.log('  -', t.training_courses?.name, ':', date);
  });
  
  // Also check Edward Owusu-Ansah
  console.log('\n---\n');
  const { data: profile2 } = await supabase
    .from('profiles')
    .select('id')
    .eq('full_name', 'Edward Owusu-Ansah')
    .single();
  
  console.log('Edward Owusu-Ansah profile ID:', profile2.id);
  
  const { data: allTraining2 } = await supabase
    .from('staff_training_matrix')
    .select('course_id, completion_date, status, training_courses(name)')
    .eq('staff_id', profile2.id);
  
  console.log('All training records for Edward Owusu-Ansah:', allTraining2?.length || 0);
  const safeguarding2 = allTraining2?.filter(t => t.training_courses?.name?.toLowerCase().includes('safeguard'));
  console.log('Safeguarding-related courses:', safeguarding2?.length || 0);
  safeguarding2?.forEach(t => {
    const date = t.completion_date ? new Date(t.completion_date).toLocaleDateString('en-GB') : t.status || 'none';
    console.log('  -', t.training_courses?.name, ':', date);
  });
}

checkMissing().catch(console.error);
