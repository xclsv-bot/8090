# Pending Work Orders for XCLSV Core Platform

Submit these to 8090.ai Software Factory.

---

## WO-94: Smart Event Creation with Traffic Predictor Suggestions

### Summary
Enhance the event creation flow to integrate with the Traffic Predictor & Event Optimizer. When creating a new event, show suggested events based on upcoming sports games and historical venue performance.

### In Scope
- Replace basic create modal with smart creation flow (2-panel layout)
- Left panel: Event creation form with required fields
- Right panel: AI-powered suggestions from traffic predictor
- Fetch recommendations from `/api/v1/traffic-prediction/recommendations`
- Fetch upcoming games from `/api/v1/sports-calendar`
- Filter suggestions dynamically as user fills in region, venue, date
- Allow user to click a suggestion to auto-fill the form
- Required fields: Title, Venue, Date, Start Time, End Time, Region (City + State)

### Out of Scope
- Ambassador assignment (WO-95)
- Budget fields (WO-96)
- Notifications (WO-97)

### Acceptance Criteria
- AC-94.1: When user clicks "New Event", show smart creation modal with suggestions panel
- AC-94.2: Suggestions show: event name, venue, date, traffic score (1-100), key sports events
- AC-94.3: As user types in region field, filter suggestions to matching regions in real-time
- AC-94.4: As user selects date, filter suggestions to that date range (+/- 3 days)
- AC-94.5: When user clicks a suggestion, auto-fill all form fields
- AC-94.6: Validate required fields before allowing submission
- AC-94.7: Show loading spinner while fetching suggestions
- AC-94.8: Show "No suggestions available" message when none match filters
- AC-94.9: After successful creation, navigate to the new event's detail page

---

## WO-95: Event Detail Page - Ambassador Assignment Section

### Summary
Add an ambassador assignment section to the event detail page. Show available ambassadors based on their schedule/availability, allow searching and assigning ambassadors, and display conflict warnings.

### In Scope
- New "Ambassadors" card/section on event detail page
- Show currently assigned ambassadors with unassign option
- "Add Ambassador" button opens assignment modal
- Available ambassadors list filtered by:
  - Region match (ambassador's home_region matches event region)
  - Availability (no conflicts with their schedule)
  - Skill level (sortable)
- Search ambassadors by name
- Show warning icon if ambassador has conflicts or hasn't set availability
- Auto-suggest top ambassadors based on region + skill level

### Out of Scope
- Creating new ambassadors
- Editing ambassador profiles
- Budget fields (WO-96)

### Acceptance Criteria
- AC-95.1: Event detail page shows "Team" or "Ambassadors" section
- AC-95.2: Section displays currently assigned ambassadors with name, skill level, status
- AC-95.3: Each assigned ambassador has "Remove" action
- AC-95.4: "Add Ambassador" opens modal with available ambassadors list
- AC-95.5: Available list sorted by: region match first, then skill level
- AC-95.6: Search box filters ambassadors by name
- AC-95.7: Ambassadors with schedule conflicts show warning icon + tooltip
- AC-95.8: Ambassadors without availability set show "No availability" badge
- AC-95.9: Clicking "Assign" adds ambassador to event and refreshes list
- AC-95.10: Show success toast after assignment

---

## WO-96: Event Detail Page - Budget Fields Section

### Summary
Add budget planning fields to the event detail page. Allow entering projected signups, revenue, and all cost categories. Mirror the fields from the Budget vs Actuals import.

### In Scope
- New "Budget" card/section on event detail page
- Editable fields for projections and costs
- Auto-calculate projected revenue and profit
- Fields to include:
  - Projected Signups (number)
  - Dropoff Factor (default 0.65)
  - Projected Revenue (calculated: signups × dropoff × avg CPA)
  - Budget - Staff
  - Budget - Rewards
  - Budget - Travel
  - Budget - Venue
  - Budget - Parking
  - Budget - Setup
  - Budget - Bonus/Kickback
  - Budget - Other 1-4
  - Budget Total (auto-calculated sum)
  - Projected Profit (revenue - total)
  - Notes field
- Save budget to event_budgets table
- Show actuals alongside budget if event is completed

### Out of Scope
- Expense reconciliation
- Ramp integration for actuals
- Financial reports

### Acceptance Criteria
- AC-96.1: Event detail page shows "Budget & Financials" section
- AC-96.2: Section shows input fields for all budget line items
- AC-96.3: Budget Total auto-calculates as sum of all cost fields
- AC-96.4: Projected Revenue auto-calculates from formula
- AC-96.5: Projected Profit shows revenue minus total with color coding (green/red)
- AC-96.6: "Save Budget" button persists to database
- AC-96.7: For completed events, show Actuals column next to Budget
- AC-96.8: Show variance (actual - budget) with highlighting for >20% variance
- AC-96.9: Notes field supports multi-line text

---

## WO-97: Ambassador Notification on Event Status Change

### Summary
Send notifications to assigned ambassadors when an event status changes from "planned" to "scheduled". Notifications should be sent via email (and SMS if phone available).

### In Scope
- Backend hook on event status change
- Trigger notification when status changes: planned → scheduled
- Send email to all assigned ambassadors
- Include in notification:
  - Event name, date, time
  - Venue and address
  - Any special instructions
  - Link to view event (if ambassador app exists)
- Log notification sends in database
- Handle failures gracefully (retry logic)

### Out of Scope
- Push notifications
- In-app notifications
- Notifications for other status changes (can be added later)

### Acceptance Criteria
- AC-97.1: When event status changes from "planned" to "scheduled", system triggers notification
- AC-97.2: All ambassadors assigned to the event receive email
- AC-97.3: Email includes: event title, date, time, venue, city, state
- AC-97.4: Email has clear subject line like "You're scheduled for [Event Name] on [Date]"
- AC-97.5: Notification sends are logged in a notification_logs table
- AC-97.6: Failed sends are retried up to 3 times with exponential backoff
- AC-97.7: Admin can see notification history for an event
- AC-97.8: No duplicate notifications if status is changed back and forth

---

## Suggested Build Order

1. **WO-96** (Budget Fields) — Independent, can build first
2. **WO-95** (Ambassador Assignment) — Independent, can build in parallel
3. **WO-94** (Smart Event Creation) — Depends on existing traffic predictor
4. **WO-97** (Notifications) — Depends on ambassador assignment being used

---

*Generated: 2026-02-21*
