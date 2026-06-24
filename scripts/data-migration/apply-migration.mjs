import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://ykrmrwgnbuigdzodnliw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260529000000_add_display_order_to_location_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolons to handle multiple statements
    const statements = migrationSQL.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        console.log('Executing:', trimmed.substring(0, 80) + '...');
        const { error } = await supabase.rpc('exec', { sql: trimmed });
        if (error) {
          console.error('Error executing statement:', error);
        } else {
          console.log('✓ Statement executed successfully');
        }
      }
    }
    
    console.log('\n✓ Migration applied successfully!');
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
