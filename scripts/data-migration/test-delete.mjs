import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Check current count
const { count: countBefore } = await supabase
  .from('staff_training_matrix')
  .select('*', { count: 'exact', head: true });

console.log(`Records before delete: ${countBefore}`);

// Try to delete ALL records
const { error: deleteError, count: deletedCount } = await supabase
  .from('staff_training_matrix')
  .delete()
  .neq('id', 0);

if (deleteError) {
  console.error('Delete error:', deleteError);
} else {
  console.log(`Rows attempted to delete: ${deletedCount}`);
}

// Check count after delete
const { count: countAfter } = await supabase
  .from('staff_training_matrix')
  .select('*', { count: 'exact', head: true });

console.log(`Records after delete: ${countAfter}`);
