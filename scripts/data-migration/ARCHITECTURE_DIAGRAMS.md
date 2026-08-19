# Training Portal - Visual Architecture & Flow Diagrams

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   TRAINING PORTAL                        │
│                   (Next.js Application)                  │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼────────┐      ┌──────▼─────────┐
        │   Middleware   │      │  Supabase      │
        │   (Protection) │      │  (Auth/Data)   │
        └────────────────┘      └────────────────┘
                │
        ┌───────▼────────────────┐
        │    Public Routes       │
        ├───────────────────────┤
        │ /login (Auth)         │
        │ /auth/* (Password)    │
        └───────────────────────┘
                │
        ┌───────▼────────────────┐
        │  Protected Routes      │
        ├───────────────────────┤
        │ /dashboard (Landing)  │
        │ /apps/* (Apps)        │
        │ /admin (Admin)        │
        │ /analytics (Stats)    │
        └───────────────────────┘
```

## 📌 Current Booking Calendar Controls

The booking calendar event flow currently includes:

```text
Calendar event card
  ├── Course name
  ├── Training venue
  ├── Time
  └── Booking count / capacity
          │
          ▼
     Booking modal
          ├── Add staff
          └── Roster
                ├── Attendance and lateness
                ├── Export CSV
                └── Settings (admin/scheduler)
                      ├── Date-specific booking limit
                      └── Message shown at top of roster
```

The checklist template is managed from `/admin`. Admins can add, edit, reorder, activate/deactivate, configure invoice-input rows, and remove template items.

## 🔄 User Authentication Flow

```
START
  │
  ▼
┌──────────────┐
│ User opens  │
│ /login      │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Enter Email & Pass   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Supabase Auth Check  │
└──────┬───────────────┘
       │
   ┌───┴────┐
   │        │
   NO       YES
   │        │
   │        ▼
   │    ┌─────────────────┐
   │    │ Password needs  │
   │    │ change?         │
   │    └─────┬───────────┘
   │          │
   │      ┌───┴────┐
   │      │        │
   │      YES      NO
   │      │        │
   │      ▼        ▼
   │  ┌──────┐  ┌──────────┐
   │  │Pwd   │  │Dashboard │
   │  │Change│  │/dashboard│
   │  └──────┘  └──────────┘
   │
   ▼
┌──────────────────┐
│ Show Error Msg   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Try again?       │
│ YES → /login     │
│ NO  → EXIT       │
└──────────────────┘
```

## 🎯 Navigation Flow

```
                    ┌────────────┐
                    │   /login   │
                    └──────┬─────┘
                           │
                           ▼
                    ┌────────────────┐
                    │  /dashboard    │
                    │ (App Selection)│
                    └────┬────────────┘
                         │
              ┌──────────┼──────────┐
              │                     │
              ▼                     ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ Course Expiry    │  │ Booking Calendar │
    │ /apps/expiry-    │  │ /apps/booking-   │
    │  checker         │  │  calendar        │
    │                  │  │                  │
    │ ┌──────────────┐ │  │ ┌──────────────┐ │
    │ │   SIDEBAR    │ │  │ │   SIDEBAR    │ │
    │ ├──────────────┤ │  │ ├──────────────┤ │
    │ │🏠 Dashboard  │ │  │ │🏠 Dashboard  │ │
    │ │📅 Expiry     │◄├──┤►│📅 Expiry     │ │
    │ │📆 Calendar   │ │  │ │📆 Calendar   │ │
    │ │🚪 Sign Out   │ │  │ │🚪 Sign Out   │ │
    │ └──────────────┘ │  │ └──────────────┘ │
    └──────────────────┘  └──────────────────┘
              ▲                     ▲
              └─────────────────────┘
                    (Click to switch)
```

## 📱 Sidebar States

### Desktop (≥ lg breakpoint)

```
┌──────────────────┐
│      HEADER      │ (p-4)
│ Apps    [⟨]     │ (collapse btn)
├──────────────────┤
│ ┌────────────────┐│
│ │🏠 Dashboard    ││ (selected)
│ │📅 Course Expiry││
│ │📆 Booking Cal. ││
│ └────────────────┘│
├──────────────────┤
│   🚪 Sign Out    │
└──────────────────┘

Width: 256px (w-64)
Position: Fixed left
```

### Tablet/Mobile (< lg breakpoint) - Closed

```
Bottom-left corner:
┌────┐
│ ☰  │ (hamburger icon)
└────┘
```

### Tablet/Mobile (< lg breakpoint) - Open

```
┌──────────────────┐
│ Sidebar Overlay  │
│ HEADER   [×]     │ (close btn)
├──────────────────┤
│ Navigation Items │
│ with dividers    │
├──────────────────┤
│   Sign Out       │
└──────────────────┘

Over semi-transparent backdrop
z-index: 50
Animation: slide-in from left
```

## 🎨 Component Tree

```
Layout.tsx
│
├─── page.tsx (CalendarPage)
│    ├─── ScheduleModal
│    ├─── BookingModal
│    ├─── BookingChecklistModal
│    └─── ThemeToggle
│
├─── /dashboard/page.tsx (DashboardPage)
│    ├─── ThemeToggle
│    └─── [App Cards]
│
├─── /apps/expiry-checker/page.tsx
│    ├─── AppSidebar
│    └─── CourseExpiryChecker
│         ├─── Search Controls
│         ├─── Filters
│         └─── Results Table
│
├─── /apps/booking-calendar/page.tsx
│    ├─── AppSidebar
│    └─── CalendarPage (see above)
│
├─── /admin/page.tsx
│    └─── [Admin Features]
│
└─── /analytics/page.tsx
     └─── [Analytics Charts]
```

## 🔐 Protected Routes

```
Middleware Check:
┌──────────────────────┐
│ Request comes in     │
└──────┬───────────────┘
       │
       ▼
┌────────────────────────────┐
│ Is user authenticated?     │
└────┬──────────────────────┬┘
     │                      │
    NO                      YES
     │                      │
     ▼                      ▼
  ALLOW            ┌────────────────────┐
  ONLY:            │ On /login?         │
  /login           └────┬────────────┬──┘
  /auth/*               │            │
                       YES           NO
                       │             │
                       ▼             ▼
                  REDIRECT      ┌─────────────┐
                  /dashboard    │ Allow access│
                                └─────────────┘
```

## 📊 Data Flow

```
User Action in CourseExpiryChecker
        │
        ▼
┌───────────────────────┐
│ Click "Search Expiring"
└────┬──────────────────┘
     │
     ▼
┌──────────────────────────┐
│ fetchExpiringCourses()   │
│ (or API call)            │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Data Source:             │
│ - Mock Data              │ ← Start here
│ - Google Sheets API      │ ← Or here
│ - Custom API Route       │ ← Or here
│ - Supabase              │ ← Or here
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Parse & Format Data      │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ setState(allData)        │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ buildFilterOptions()     │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ renderTable()            │
│ (show results)           │
└──────────────────────────┘
```

## 🎯 Responsive Design

```
Mobile Layout (< 640px):
┌──────────────────┐
│   HEADER         │
├──────────────────┤
│                  │
│   MAIN CONTENT   │
│   (Full Width)   │
│                  │
├──────────────────┤
│ [☰ Sidebar Btn] │
└──────────────────┘


Tablet Layout (640px - 1024px):
┌──────────────────┐
│   HEADER         │
├──────────────────┤
│                  │
│   MAIN CONTENT   │
│   (Full Width)   │
│                  │
└──────────────────┘
  [☰ Sidebar Overlay Available]


Desktop Layout (> 1024px):
┌────┬──────────────────┐
│    │                  │
│ S  │   HEADER         │
│ I  ├──────────────────┤
│ D  │                  │
│ E  │  MAIN CONTENT    │
│ B  │                  │
│ A  │                  │
│ R  │                  │
│    │                  │
└────┴──────────────────┘
(256px) (Rest of screen)
```

## 🎨 Color Scheme

### Light Mode
```
Background:  #ffffff (white)
Text:        #1f2937 (dark gray)
Accent:      #3b82f6 (blue)
Border:      #e5e7eb (light gray)
Hover:       #f3f4f6 (lighter gray)
```

### Dark Mode
```
Background:  #111827 (very dark gray)
Text:        #f3f4f6 (light gray)
Sidebar:     #0f172a (darker)
Accent:      #3b82f6 (blue)
Border:      #374151 (dark gray)
Hover:       #1f2937 (lighter gray)
```

## 📈 Performance Metrics

```
Page Load:
/login        → ~200ms
/dashboard    → ~150ms (cached)
/apps/*       → ~200ms (with sidebar)

Component Render:
AppSidebar    → <50ms
CourseExpiry  → <100ms
Dashboard     → <100ms

Bundle Size Impact:
New Components → ~15KB (minified)
Total App      → ~250KB (minified)
```

---

**Last Updated**: August 19, 2026
**Version**: 1.1.0
