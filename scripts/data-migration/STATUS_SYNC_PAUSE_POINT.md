# Status Sync Progress - Pause Point

**Date**: 6 February 2026  
**Current Task**: Extracting and syncing status data from CSV files to database

## What Was Completed ✅

1. **Created sync-all-statuses.js** - New script that:
   - Extracts status values from CSV files (Booked, Awaiting training date, N/A, Completed)
   - Maps statuses correctly with case-insensitive matching
   - Parses completion dates when status is 'completed'
   - Calculates expiry dates based on course expiry_months
   - Updates database records with all status and date information
   - Processes one location at a time for verification

2. **Tested and Verified**:
   - ✅ **Armfield House**: 
     - Completed: 1,288
     - Booked: 45
     - Awaiting: 36
     - N/A: 1,101
     - Total: 2,470 records
   
   - ✅ **Banks House School**: 
     - Completed: 979
     - Booked: 49
     - Awaiting: 23
     - N/A: 1,529
     - Total: 2,580 records

## Remaining Work ⏳

Still need to sync statuses for these 11 locations:

1. Banks House
2. Bonetti House
3. Charlton House
4. Cohen House
5. Felix House School
6. Felix House
7. Group
8. Hurst House
9. Moore House
10. Peters House
11. Stiles House

## How to Resume

Run these commands one at a time (or in a loop) when you come back:

```bash
cd /Users/matthewfrost/training-portal

# Option 1: Run each location individually
node sync-all-statuses.js "Banks House"
node sync-all-statuses.js "Bonetti House"
node sync-all-statuses.js "Charlton House"
node sync-all-statuses.js "Cohen House"
node sync-all-statuses.js "Felix House School"
node sync-all-statuses.js "Felix House"
node sync-all-statuses.js "Group"
node sync-all-statuses.js "Hurst House"
node sync-all-statuses.js "Moore House"
node sync-all-statuses.js "Peters House"
node sync-all-statuses.js "Stiles House"

# Option 2: Run all remaining locations in a loop
for location in "Banks House" "Bonetti House" "Charlton House" "Cohen House" "Felix House School" "Felix House" "Group" "Hurst House" "Moore House" "Peters House" "Stiles House"; do
  echo "Processing: $location"
  node sync-all-statuses.js "$location"
  echo ""
done
```

## What Happens Next

After syncing all 11 locations:
1. Run verify-location-data.js to confirm all statuses are correct
2. Check that database has expected distribution:
   - ~16,019 completed records (with dates)
   - ~250+ booked records
   - ~150+ awaiting records
   - ~15,000+ N/A records
3. Verify UI displays correctly with all status types

## Key Files Created
- `/Users/matthewfrost/training-portal/sync-all-statuses.js` - Main status extraction script

## Technical Details

The script works by:
1. Reading CSV file for the specified location
2. Finding course names in row 2 (index 2)
3. Iterating through staff data starting at row 6 (index 6)
4. For each staff-course intersection:
   - Extracting the cell value (date, status keyword, or empty)
   - Determining status: booked/awaiting/completed/na
   - Parsing date if it's a DD/MM/YYYY format
   - Calculating expiry date from completion date
5. Updating database with status, completion_date, and expiry_date

Status determination logic:
- Empty or "N/A" → status='na'
- "Booked" → status='booked'
- "Awaiting training date" (case-insensitive) → status='awaiting'
- Date format (DD/MM/YYYY) or "Completed" → status='completed'
