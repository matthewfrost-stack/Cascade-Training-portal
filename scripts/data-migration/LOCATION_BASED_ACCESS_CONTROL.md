# Location-Based Access Control Implementation

## Overview
Managers and schedulers can now only see training data and staff for their assigned locations. Admins see everything, and staff see only their own records.

## Database Security (RLS - Row Level Security)

### Enabled on:
1. **staff_training_matrix** - Training records
   - Admins: See all records
   - Managers/Schedulers: See only their managed locations
   - Staff: See only their own records
   - Service role: Full access (for imports)

2. **staff_locations** - Staff-location assignments
   - Admins: See all assignments
   - Managers/Schedulers: See staff at their locations
   - Staff: See their own record
   - Service role: Full access

3. **location_courses** - Location-specific courses
   - Users: See courses for their locations
   - Admins: See all
   - Service role: Full access

4. **profiles** - User profiles
   - Users: See staff at their locations and themselves
   - Admins: See all
   - Service role: Full access

5. **locations** - Read-only for all users

## API Endpoints

### 1. GET `/api/training-matrix`
Returns training records filtered by user's role and location.

**Parameters:**
- Authorization header (Bearer token required)

**Response:**
```json
{
  "records": [...],
  "userRole": "manager|scheduler|admin|staff",
  "count": 123
}
```

**Filtering:**
- Admin: All records
- Manager/Scheduler: Only their managed locations
- Staff: Only their own records

### 2. GET `/api/staff/by-location`
Returns staff members accessible to the user.

**Parameters:**
- Authorization header (Bearer token required)

**Response:**
```json
{
  "staff": [...],
  "userRole": "manager|scheduler|admin|staff",
  "count": 45
}
```

**Filtering:**
- Admin: All staff
- Manager/Scheduler: Staff at their managed locations
- Staff: Only themselves

### 3. GET `/api/locations/user-locations`
Returns locations the user has access to.

**Parameters:**
- Authorization header (Bearer token required)

**Response:**
```json
{
  "locations": [
    { "id": "uuid", "name": "Armfield House" },
    { "id": "uuid", "name": "Banks House" }
  ],
  "userRole": "manager|scheduler|admin|staff",
  "count": 2
}
```

**Filtering:**
- Admin: All locations
- Manager/Scheduler: Their managed locations (1-2)
- Staff: Their home location

### 4. GET `/api/courses/by-location?locationId=<id>`
Returns courses available for a specific location (location_courses).

**Response:**
```json
{
  "locationId": "uuid",
  "courses": [...],
  "count": 65
}
```

## Access Control Rules

| Role | See Staff | See Courses | Book Training | Locations |
|------|-----------|------------|---------------|-----------|
| Admin | All staff | All courses | All staff | All (13) |
| Manager | Own locations | Own locations | Own locations | 1-2 |
| Scheduler | Own locations | Own locations | Own locations | 1-2 |
| Staff | Only self | Own location | N/A | Own location |

## Security Features

✅ Database-level enforcement (RLS policies)
✅ API-level filtering based on user role and location
✅ Service role has full access for imports and maintenance
✅ Users can only see staff and training data for their assigned locations
✅ Managers with 1-2 locations can only access those locations

## Migration File

Migration: `20260211000002_enable_location_based_rls.sql`
- Enables RLS on all tables
- Creates policies for each role
- Enables service role bypass for administrative operations

## Notes

- All existing API endpoints should use authorization headers with the user's session token
- The service_role key bypasses RLS for administrative tasks (imports, migrations)
- RLS is enforced at the database level - no data leaks at the API layer
- Users must be assigned to locations via `staff_locations` table to access data
