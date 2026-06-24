import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get ALL records without expiry_date that belong to courses WITH expiry_months
const { data: allMissing } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .not("courses.expiry_months", "is", null);

console.log(`Found ${allMissing?.length} records needing expiry date calculation\n`);

if (!allMissing || allMissing.length === 0) {
  console.log("✅ No records need calculation!");
  process.exit(0);
}

// Update one by one to be safe
let calculated = 0;
let skipped = 0;

for (const record of allMissing) {
  if (!record.completion_date || !record.courses.expiry_months) {
    skipped++;
    continue;
  }
  
  const completionDate = new Date(record.completion_date);
  const expiryDate = new Date(completionDate);
  expiryDate.setMonth(expiryDate.getMonth() + record.courses.expiry_months);
  const expiryDateStr = expiryDate.toISOString().split('T')[0];
  
  const { error } = await supabase
    .from("staff_training_matrix")
    .update({ expiry_date: expiryDateStr })
    .eq("id", record.id);
  
  if (error) {
    console.error(`Error updating record ${record.id}:`, error.message);
  } else {
    calculated++;
    if (calculated % 100 === 0) {
      console.log(`✅ ${calculated} records updated...`);
    }
  }
}

console.log(`\n=== COMPLETE ===`);
console.log(`Total expiry dates calculated: ${calculated}`);
console.log(`Skipped: ${skipped}`);
