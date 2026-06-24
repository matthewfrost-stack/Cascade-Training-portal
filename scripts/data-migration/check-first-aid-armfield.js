#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFirstAidArmfield() {
  try {
    console.log('Fetching First Aid course ID...');
    const { data: courses, error: courseError } = await supabase
      .from('training_courses')
      .select('id, name')
      .ilike('name', '%first aid%');
    
    if (courseError) {
      console.error('Error fetching courses:', courseError);
      return;
    }

    console.log('Found courses:', courses);
    if (!courses || courses.length === 0) {
      console.log('No First Aid course found');
      return;
    }

    const firstAidCourse = courses[0];
    console.log(`\nFirst Aid course ID: ${firstAidCourse.id}`);

    // Get Armfield location
    console.log('\nFetching Armfield location...');
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name')
      .ilike('name', '%armfield%');
    
    if (locError) {
      console.error('Error fetching locations:', locError);
      return;
    }

    console.log('Found locations:', locations);
    if (!locations || locations.length === 0) {
      console.log('No Armfield location found');
      return;
    }

    const armfieldLocation = locations[0];
    console.log(`\nArmfield location ID: ${armfieldLocation.id}`);

    // Get staff at Armfield
    console.log('\nFetching staff at Armfield...');
    const { data: staffLocs, error: staffError } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(id, full_name)')
      .eq('location_id', armfieldLocation.id)
      .limit(5);
    
    if (staffError) {
      console.error('Error fetching staff:', staffError);
      return;
    }

    console.log('Found staff:', staffLocs?.length);

    // Check First Aid records for Armfield staff
    console.log(`\nChecking First Aid records for Armfield location (${armfieldLocation.id})...`);
    const { data: trainingRecords, error: trainingError } = await supabase
      .from('staff_training_matrix')
      .select('*')
      .eq('course_id', firstAidCourse.id)
      .eq('completed_at_location_id', armfieldLocation.id)
      .limit(10);
    
    if (trainingError) {
      console.error('Error fetching training records:', trainingError);
      return;
    }

    console.log(`\nFound ${trainingRecords?.length || 0} First Aid records at Armfield:`);
    if (trainingRecords && trainingRecords.length > 0) {
      trainingRecords.forEach(record => {
        console.log(`  - Staff ${record.staff_id}: status=${record.status}, completion_date=${record.completion_date}, expiry_date=${record.expiry_date}`);
      });
    } else {
      console.log('  (No records found)');
    }

    // Also check location_training_courses to see if First Aid is assigned to Armfield
    console.log(`\nChecking if First Aid is in Armfield's course list...`);
    const { data: locCourses, error: locCourseError } = await supabase
      .from('location_training_courses')
      .select('*')
      .eq('location_id', armfieldLocation.id)
      .eq('training_course_id', firstAidCourse.id);
    
    if (locCourseError) {
      console.error('Error checking location courses:', locCourseError);
    } else {
      console.log(`Found ${locCourses?.length || 0} entries in location_training_courses`);
      if (locCourses && locCourses.length > 0) {
        console.log('Entry:', locCourses[0]);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkFirstAidArmfield();
