# Calendar Skill

Responsible for verifying the calendar display, color coding, and classroom entry restrictions.

## Core Capabilities

1.  **Role-Based Display**: Verify that events correctly show `teacherName` and `studentName` based on the user's role and event data.
2.  **Color Coding**: Verify that event colors correctly reflect the course status (Upcoming, Ongoing, Finished, etc.).
3.  **Interval Control**: Verify that "Enter Waiting Room" is restricted to 10 minutes before the scheduled start time.

## Verification Steps

### 1. Role and Color Legend Check
- Navigate to `/calendar`.
- **Check**: The "課程狀態標示" (Status Legend) should be visible at the top of the calendar.
- **Check**: Events should be colored according to the legend:
    - `Violet`: 未開始上課 (Upcoming, but started)
    - `Sky`: 即將開始 (Upcoming)
    - `Emerald`: 進行中 (Ongoing)
    - `Slate`: 已結束 (Finished)
    - `Orange`: 中斷 (Interrupted)
    - `Rose`: 缺席 (Absent)
- **Check**: Click an event to open the detail modal. Verify that **Teacher** name and **Student** name are displayed if available.

### 2. Classroom Entry Interval Control
- Identify or create an event in the calendar.
- **Scenario A: More than 10 minutes before start**
    - Open the event detail modal.
    - **Check**: The "進入教室" (Enter Waiting Room) button should be **disabled** (grayed out) with the text "(未開放)".
    - **Check**: Hover over the button to see the tooltip "僅在課程開始前 10 分鐘開放進場".
- **Scenario B: Within 10 minutes of start or during class**
    - Open the event detail modal.
    - **Check**: The "進入教室" (Enter Waiting Room) button should be **active** (Amber color) and clickable.

## Troubleshooting
- **Button not showing**: Ensure the event has a valid `courseId`.
- **Colors not matching**: Check the `status` field of the event in the mock data or API response.
- **Timezone issues**: The interval control uses local time (`Date.now()`). Ensure the system clock is synchronized.
