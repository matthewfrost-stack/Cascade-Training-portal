import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('Starting migration...\n');

  // Step 1: Get all unique courses from location_courses with their details
  const { data: locationCourses, error: lcError } = await supabase
    .from('location_courses')
    .select('course_id, courses(id, name, category, expiry_months)')
    .order('course_id');

  if (lcError) {
    console.error('Error fetching location_courses:', lcError);
    return;
  }

  // Get unique courses
  const courseMap = new Map();
  for (const lc of locationCourses) {
    if (lc.courses && !courseMap.has(lc.courses.id)) {
      courseMap.set(lc.courses.id, lc.courses);
    }
  }

  console.log(`Found ${courseMap.size} unique courses to check for migration`);

  // Step 2: Get existing training_courses to avoid duplicates (match by name)
  const { data: existingTC, error: tcError } = await supabase
    .from('training_courses')
    .select('id, name');

  if (tcError) {
    console.error('Error fetching training_courses:', tcError);
    return;
  }

  const existingNames = new Set(existingTC.map(tc => tc.name.toLowerCase().trim()));
  console.log(`Existing training_courses: ${existingTC.length}`);

  // Step 3: Insert courses that don't exist in training_courses
  const coursesToInsert = [];
  const oldToNewIdMap = new Map(); // Map old course.id to new training_course.id

  // First, map existing training_courses by name for lookup
  const tcByName = new Map();
  for (const tc of existingTC) {
    tcByName.set(tc.name.toLowerCase().trim(), tc.id);
  }

  for (const [oldId, course] of courseMap) {
    const normalizedName = course.name.toLowerCase().trim();
    
    if (tcByName.has(normalizedName)) {
      // Course already exists in training_courses, use that ID
      oldToNewIdMap.set(oldId, tcByName.get(normalizedName));
      console.log(`  Mapping existing: "${course.name}" -> ${tcByName.get(normalizedName)}`);
    } else {
      // Need to insert
      coursesToInsert.push({
        name: course.name,
        category: course.category || 'Uncategorized',
        expiry_months: course.expiry_months || 12,
        source: 'migrated_from_courses'
      });
    }
  }

  console.log(`\nCourses to insert into training_courses: ${coursesToInsert.length}`);

  // Insert new courses
  if (coursesToInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('training_courses')
      .insert(coursesToInsert)
      .select('id, name');

    if (insertError) {
      console.error('Error inserting courses:', insertError);
      return;
    }

    console.log(`Inserted ${inserted.length} new courses into training_courses`);

    // Add to lookup map
    for (const tc of inserted) {
      tcByName.set(tc.name.toLowerCase().trim(), tc.id);
    }
  }

  // Now rebuild oldToNewIdMap with all mappings
  for (const [oldId, course] of courseMap) {
    const normalizedName = course.name.toLowerCase().trim();
    if (tcByName.has(normalizedName)) {
      oldToNewIdMap.set(oldId, tcByName.get(normalizedName));
    }
  }

  console.log(`\nTotal course mappings: ${oldToNewIdMap.size}`);

  // Step 4: Get all locations
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('id, name');

  if (locError) {
    console.error('Error fetching locations:', locError);
    return;
  }

  console.log(`\nLocations: ${locations.length}`);

  // Step 5: Create location_training_courses entries
  const ltcToInsert = [];
  
  for (const lc of locationCourses) {
    if (!lc.courses) continue;
    
    const newCourseId = oldToNewIdMap.get(lc.courses.id);
    if (!newCourseId) {
      console.warn(`  No mapping for course: ${lc.courses.name}`);
      continue;
    }

    ltcToInsert.push({
      location_id: lc.course_id ? lc.course_id.split('-')[0] : null, // This won't work, need location_id from location_courses
    });
  }

  // Actually, let me re-fetch with location_id
  const { data: lcFull, error: lcFullError } = await supabase
    .from('location_courses')
    .select('location_id, course_id, display_order');

  if (lcFullError) {
    console.error('Error fetching full location_courses:', lcFullError);
    return;
  }

  // Get course details for mapping
  const { data: allCourses, error: allCError } = await supabase
    .from('courses')
    .select('id, name');

  if (allCError) {
    console.error('Error fetching all courses:', allCError);
    return;
  }

  const courseIdToName = new Map();
  for (const c of allCourses) {
    courseIdToName.set(c.id, c.name);
  }

  // Build location_training_courses entries
  const ltcEntries = [];
  const seen = new Set();

  for (const lc of lcFull) {
    const courseName = courseIdToName.get(lc.course_id);
    if (!courseName) continue;

    const normalizedName = courseName.toLowerCase().trim();
    const newCourseId = tcByName.get(normalizedName);
    
    if (!newCourseId) {
      console.warn(`  No training_course found for: ${courseName}`);
      continue;
    }

    const key = `${lc.location_id}-${newCourseId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ltcEntries.push({
      location_id: lc.location_id,
      training_course_id: newCourseId,
      display_order: lc.display_order || 0
    });
  }

  console.log(`\nLocation training course entries to insert: ${ltcEntries.length}`);

  // Insert in batches
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < ltcEntries.length; i += batchSize) {
    const batch = ltcEntries.slice(i, i + batchSize);
    const { error: ltcInsertError } = await supabase
      .from('location_training_courses')
      .upsert(batch, { onConflict: 'location_id,training_course_id' });

    if (ltcInsertError) {
      console.error(`Error inserting batch ${i}:`, ltcInsertError);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Inserted ${inserted} location_training_courses entries`);

  // Verify
  const { count: ltcCount } = await supabase
    .from('location_training_courses')
    .select('*', { count: 'exact', head: true });

  console.log(`\n✅ Final count in location_training_courses: ${ltcCount}`);
}

migrate().catch(console.error);
