import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('\n🔄 Applying delivery_type migration\n');

  try {
    // Check if column already exists
    const { data, error: checkError } = await supabase
      .rpc('check_column_exists', {
        table_name: 'location_courses',
        column_name: 'delivery_type'
      })
      .single();

    // For now, just try to add the column
    // Note: This will fail silently if it already exists
    const { error: migrationError } = await supabase
      .from('location_courses')
      .select('delivery_type')
      .limit(1);

    if (migrationError?.code === '42703') {
      // Column doesn't exist, need to create it
      console.log('Column does not exist yet. Please run this SQL in Supabase dashboard:\n');
      console.log(`
ALTER TABLE location_courses
ADD COLUMN delivery_type VARCHAR(50) DEFAULT 'Face to Face';

CREATE INDEX idx_location_courses_delivery_type ON location_courses(delivery_type);
      `);
    } else if (!migrationError) {
      console.log('✅ Column already exists!');
    } else {
      console.log('Error checking column:', migrationError);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

applyMigration();
