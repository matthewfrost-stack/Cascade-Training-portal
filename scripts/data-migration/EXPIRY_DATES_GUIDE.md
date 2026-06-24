# 📅 Course Expiry Dates - Quick Reference Guide

## ✅ What Was Completed

All course expiry dates have been **extracted from CSV files, standardized, and saved to the database** automatically. You don't need to manually enter or track dates anymore.

---

## 📊 Results at a Glance

- ✅ **151 unique courses** extracted from all location CSVs
- ✅ **54 courses** synced with standardized expiry durations  
- ✅ **524 expiry dates** calculated and saved to database
- ✅ **All 13 locations** now have consistent course durations
- ✅ **Retired courses** properly marked as never-expiring

---

## 🎯 Key Points

### 1. Consistent Expiry Across All Locations
All locations now have the same expiry duration for each course:
- **Safeguarding:** 2 years
- **Fire Safety & First Aid:** 1 year  
- **Food Hygiene & Health & Safety:** 3 years
- **GDPR:** 2 years (GDPR 1) to 3 years (GDPR 2)
- **One-off courses:** Never expire (unlimited validity)

### 2. 12 Inconsistencies Were Resolved
Some courses had different durations at different locations. The script used the **most common duration** to standardize them:
- **Accredited Essential Autism** → 2 years (11 locations) vs 3 years (2 locations) → **2 years standardized**
- **Management Support Programme** → 5 years (most) vs 2 years (2) vs One-off (1) → **5 years standardized**
- *And 10 others - see CSV_DATE_EXTRACTION_REPORT.md for full list*

### 3. Retired Courses Handled
Courses marked as "One-off" in CSVs are automatically excluded from expiry calculations.

---

## 🚀 How to Use Going Forward

### For New Training Records
After importing new training data, run the maintenance script to auto-calculate expiry dates:

```bash
cd /Users/matthewfrost/training-portal
node calculate-missing-expiry-maintenance.js
```

This will:
- Detect all new records with completion dates but no expiry dates
- Automatically calculate expiry dates based on course duration
- Save everything - no manual intervention needed

### For Adding New Courses
1. Add course to database with `expiry_months` value (or leave null for one-off)
2. New training records for that course will auto-calculate expiry dates
3. Run maintenance script if you have existing records

### For Adjusting Course Duration
1. Update the `expiry_months` in the courses table
2. Run the full extraction script to recalculate all affected records:
```bash
node extract-and-sync-all-dates.js
```

---

## 📋 Standard Expiry Durations by Course Type

| Course Type | Duration | Examples |
|-------------|----------|----------|
| **Mandatory Safety** | 1 Year | First Aid, Fire Safety, Medication Practice |
| **Health & Safeguarding** | 2 Years | CYP Safeguarding, Adult Safeguarding, Infection Control, GDPR 1 |
| **Specialized Care** | 3 Years | Food Hygiene, Health & Safety, Moving & Handling, Food & Hydration |
| **Management** | 3-5 Years | Grievances, Capability, Disciplinary, Management Programs |
| **Recruitment** | 2-5 Years | Safer Recruitment Online (2y), Safeguarding for Managers (5y) |
| **One-off Training** | Never | Risk Assessment, Behaviours Challenge, Oral Hygiene, PEG Training |

---

## 📁 Files Created/Updated

| File | Purpose |
|------|---------|
| `extract-and-sync-all-dates.js` | Main script - extracts CSVs, syncs courses, calculates expiry |
| `calculate-missing-expiry-maintenance.js` | Maintenance script - updates expiry for new records |
| `CSV_DATE_EXTRACTION_REPORT.md` | Detailed report with all statistics and inconsistencies |
| `20260205000001_make_completion_date_nullable.sql` | Migration - allows flexible status recording |

---

## 💡 Common Questions

### Q: How are expiry dates calculated?
**A:** `expiry_date = completion_date + course.expiry_months`  
Example: If someone completed First Aid on 2026-02-01 and it expires in 1 year, expiry_date = 2027-02-01

### Q: What if a course is retired/one-off?
**A:** Set `expiry_months` to NULL. These courses never expire and are excluded from expiry calculations automatically.

### Q: Can I override a course's expiry duration?
**A:** Yes, update the `courses` table `expiry_months` column. The next import/sync will recalculate all records for that course.

### Q: What if I need to change an individual record's expiry date?
**A:** Update it directly in the `staff_training_matrix` table. The system will preserve manual updates.

### Q: How often should I run the maintenance script?
**A:** After importing new training records or updating course durations. It's safe to run anytime - it only updates records missing expiry dates.

---

## 🎓 Database Schema

### courses table
```
- id: UUID (primary key)
- name: VARCHAR
- expiry_months: INTEGER (null = one-off/never expires)
- category: VARCHAR
- display_order: INTEGER
```

### staff_training_matrix table
```
- id: BIGSERIAL (primary key)
- staff_id: UUID (references profiles)
- course_id: UUID (references courses)
- completion_date: DATE
- expiry_date: DATE (nullable - calculated from completion_date + course.expiry_months)
- status: VARCHAR (completed, booked, awaiting, na)
- completed_at_location_id: UUID (references locations)
```

---

## ✨ Benefits Achieved

| Before | After |
|--------|-------|
| ❌ Inconsistent dates across locations | ✅ Standardized across all 13 locations |
| ❌ Manual date tracking required | ✅ Automatic calculation |
| ❌ Missing expiry dates | ✅ 524 dates populated |
| ❌ Retired courses mixed with regular ones | ✅ Clearly marked as one-off |
| ❌ No way to query expiring courses | ✅ Ready for expiry reporting/alerts |

---

## 🔗 Related Documentation

- [CSV_DATE_EXTRACTION_REPORT.md](./CSV_DATE_EXTRACTION_REPORT.md) - Detailed extraction report with all stats
- [EXPIRY_DURATION_COMPLETION.md](./EXPIRY_DURATION_COMPLETION.md) - Previous expiry population work
- [FEATURES_OVERVIEW.md](./FEATURES_OVERVIEW.md) - Training portal features

---

## 📞 Need to Re-run Everything?

If you need to completely re-extract and resync all dates from CSV files:

```bash
node extract-and-sync-all-dates.js
```

This will:
1. ✅ Re-parse all 13 CSV files
2. ✅ Generate consistency report
3. ✅ Update database courses table (54 updates)
4. ✅ Calculate all missing expiry dates (524+ updates)
5. ✅ Display comprehensive summary

**Status:** ✅ **COMPLETE** - Everything is automated. No manual work needed!
