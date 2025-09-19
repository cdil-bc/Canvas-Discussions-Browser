# PRD: Student Claiming & Feedback Status

**Objective:** Allow facilitators to "claim" a student to indicate they are actively providing feedback, preventing duplication of effort and providing real-time visibility into who is responding to which student.

---

## 1. Final Implementation

This document reflects the final implementation after a key architectural pivot. We moved from a granular, thread-level claiming system to a more holistic, student-level one that better matches the facilitator workflow.

### 1.1. Data Model (`convex/schema.ts`)

We created a single `student_statuses` table in Convex. This table "shadows" the student data from Canvas and stores only the real-time status information.

*   **Table:** `student_statuses`
*   **Key Fields:**
    *   `studentId: v.string()`: The Canvas User ID. This is the primary link.
    *   `studentName: v.string()`
    *   `status: v.optional(v.union(v.literal("claimed"), v.literal("completed")))`
    *   `facilitatorName: v.optional(v.string())`
*   **Index:** An index on `studentId` ensures fast lookups.

### 1.2. Backend Functions (`convex/canvas.ts`)

We implemented three core student-centric functions:

1.  `setStudentStatus`: A mutation to create, update, or delete a student's status. It handles all state changes (claiming, completing, unclaiming).
2.  `getStudentStatus`: A query to fetch the status for a single student. This is used on the individual user profile page.
3.  `getAllStudentStatuses`: A query to fetch the statuses for *all* students at once. This is used to efficiently populate the main feedback dashboard.

### 1.3. Frontend Implementation

*   **Claiming UI (`pages/user/[user_name].js`):** The action of claiming was moved to the top of the student's profile page. A single "Claim Student" button (with corresponding "Complete" and "Unclaim" buttons) now appears under the student's name, making the action about the student as a whole.
*   **Dashboard UI (`pages/feedback.js`):** This page now uses the `getAllStudentStatuses` query to get all statuses. It then merges this real-time data with the Canvas data to pass a `claimStatus` prop down to the `StudentBadge` components.
*   **Student Badge (`components/ui/StudentBadge.js`):** This component was updated to accept the `claimStatus` prop. If a student's status is "claimed", the badge changes its background color to yellow (`var(--color-warning)`), providing an at-a-glance indicator on the dashboard.

---

## 2. Lessons Learned & Key Decisions

This section documents the evolution of the feature for future reference.

*   **Initial Idea vs. Final Implementation:** We initially started with a thread-centric data model (`thread_statuses`). The plan was to allow facilitators to claim individual discussion posts. 

*   **The Pivot:** Through discussion, we realized the core workflow was student-centric, not thread-centric. A facilitator reviews a student's collective work, not just one post at a time. This led to a crucial decision to refactor the entire approach before the UI was fully built.

*   **Architectural Choice:** We replaced the `thread_statuses` table with `student_statuses`. This dramatically simplified the logic. Instead of asking, "Does this student have any threads that are claimed?", we can now ask, "What is this student's status?" This is a cleaner, more efficient, and more accurate data model for the problem.

*   **Data Flow Debugging:** When the status wasn't appearing on the dashboard, we traced the data flow from parent to child (`FeedbackPage` -> `TabbedTopicCard` -> `StudentBadgeList` -> `StudentBadge`). We discovered two bugs:
    1.  An intermediate component (`TabbedTopicCard`) was not passing the `claimStatus` prop down to its children.
    2.  The parent page (`FeedbackPage`) was attempting to merge the status data using the wrong key (`student.id` instead of `student.userId`).
    *   **Lesson:** Having a clear understanding of the data shape at each step of the component tree is critical. Logging the props at each level was essential to finding the mismatch.
