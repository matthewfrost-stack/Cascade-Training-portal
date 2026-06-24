import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMissingExpiryInfo() {
  console.log('Checking records with missing expiry dates and why...\n');

  try {
    // Get some records that don't have expiry_date
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select('id, course_id, completion_date, courses(name, expiry_months)')
      .eq('status', 'completed')
      .is('expiry_date', null)
      .not('completion_date', 'is', null)
      .limit(30);

    console.log('=== RECORDS WITHOUT EXPIRY DATES ===\n');
    
    const noCourseExpiry = new Map();
    
    for (const record of records) {
      const course = record.courses;
      if (!course) {
        console.log(`Record ${record.id}: No course data`);
      } else if (course.expiry_months === null) {
        if (!noCourseExpiry.has(course.name)) {
          noCourseExpiry.set(course.name, 0);
        }
        noCourseExpiry.set(course.name, noCourseExpiry.get(course.name) + 1);
      }
    }

    if (noCourseExpiry.size > 0) {
      console.log('\n=== COURSES WITHOUT EXPIRY SETTING ===\n');
      const sorted = Array.from(noCourseExpiry.entries())
        .sort((a, b) => b[1] - a[1]);
      
      for (const [course, count] of sorted) {
        console.log(`${course}: ${count} records`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMissingExpiryInfo();
