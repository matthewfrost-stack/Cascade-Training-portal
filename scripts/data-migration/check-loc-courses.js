require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('Checking which courses are used in each location...\n');

  try {
    // Get all unique course-location combinations from training records
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select('course_id, completed_at_location_id');

    const coursesByLocation = {};
    const locationCourses = {};

    for (const rec of records) {
      if (!rec.course_id || !rec.completed_at_location_id) continue;

      if (!coursesByLocation[rec.completed_at_location_id]) {
        coursesByLocation[rec.completed_at_location_id] = new Set();
      }
      if (!locationCourses[rec.course_id]) {
        locationCourses[rec.course_id]require('dotenv').config({ path: '.env.local' });
const { createClient } = require(c.const { createClient } = require('@supabase/supa.a
const supabase = createClient(
  process.env.NEXT_PUBLICion  process.env.NEXT_PUBLIC_SUP d  process.env.SUPABASE_SERVICE_ROLE_KE(');

async function checkSchema() {
  cns
 {   console.log('Checking whichas
  try {
    // Get all unique course-location combinations from trainCAT    //;
    const { data: records } = await supabase
      .from('staff_traininc       .from('staff_training_matrix')
      co      .select('course_id, completed);
    const coursesByLocation = {};
    const locatioloc    const locationCourses = {};
g(
    for (const rec of records`);      if (!rec.course_id || !re'=
      if (!coursesByLocation[rec.completed_at_location_id]) {
  
            coursesByLocation[rec.completed_at_location_id] = neou      }
      if (!locationCourses[rec.course_id]) {
        loc cour      fi        locationCourses[rec.course_id]requiUnconst { createClient } = require(c.const { createClient } = require('@supaba} catch (errconst supabase = creaor('Error:', error.message);
  }
}

checkSchema();
