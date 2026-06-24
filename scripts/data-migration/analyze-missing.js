import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Count all records without expiry_date
const { data: allMissing } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, course_id, courses!inner(expiry_months)`,
    { count: "exact" }
  )
  .is("expiry_date", null)
  .eq("status", "completed");

if (!allMissing) {
  console.log("Error fetching data");
  process.exit(1);
}

// Count how many are correctly One-off
const oneOffCount = allMissing.filter(
  (r) => r.courses.expiry_months === null
).length;

// Count how many should have dates
const shouldHaveDateCount = allMissing.filter(
  (r) => r.courses.expiry_months !== null
).length;

console.log(`\n=== MISSING EXPIRY DATE ANALYSIS ===`);
console.log(`Total records without expiry_date: ${allMissing.length}`);
console.log(`Correctly marked as One-off (null months): ${oneOffCount}`);
console.log(`Need expiry_date calculated (has months): ${shouldHaveDateCount}`);
console.log(`\n${oneOffCount + shouldHaveDateCount === allMissing.length ? "✅ Analysis complete - All records accounted for" : "⚠️ Mismatch in calculation"}`);
