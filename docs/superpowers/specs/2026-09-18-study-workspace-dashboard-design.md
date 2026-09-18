# Catalyst Study Plan Workspace Design

## Status

Draft for review. This document describes the approved visual direction and product behavior for the adaptive study dashboard. It does not authorize production implementation yet.

## Summary

Catalyst's dedicated Study Plan workspace will become a student command center that answers four questions:

1. What should I study today?
2. How much time have I spent studying?
3. Am I improving?
4. What classes, tasks, exams, or deadlines are coming next?

The Study Plan workspace will combine data from the existing Classes, Learning, Calendar, Notes, and AI Assistant areas into one actionable overview. The daily study plan remains the primary action, while progress, schedule, and exam context support the decision. The existing Home page remains outside this feature's ownership so it can be developed independently by another contributor.

The visual direction is a calm productivity workspace inspired by the supplied Asana, GetStudy, and learning-dashboard references. It uses Catalyst's existing warm neutral theme instead of the prototype's purple, blue, and pink palette.

## Goals

- Help a student decide what to study next without searching across multiple pages.
- Let the student answer a few questions before generating a daily plan.
- Show a realistic plan based on available time, weak topics, deadlines, exams, review history, and prerequisites.
- Make each recommendation explainable in plain language.
- Let a student create a manual study task without using the recommendation flow.
- Provide a focused study session with pause, resume, completion, and saved progress.
- Show study streak, time studied, topic mastery, today’s schedule, calendar context, task list, and upcoming exams.
- Provide supportive reminders and notifications without guilt-based language.
- Preserve the existing Classes, Learning, Calendar, Notes, AI Assistant, and authentication behavior.

## Non-goals for the MVP

- A full 3D boat or animated guide that follows the student through every page.
- Machine-learning recommendations.
- Team collaboration or shared study plans.
- Complex project-management features such as pipelines, custom attributes, aggregation tables, or drag-and-drop workspaces.
- Certificates, premium upsells, social feeds, or community analytics on the Study Plan page.
- Device push notifications before the in-app notification behavior is validated.
- A separate weekly planning workspace as the primary entry point.

## Product principles

### Study-Plan-first, not assistant-first

The Study Plan page should show useful context immediately. Catalyst may guide the setup and explain recommendations, but users should not have to begin with an open-ended AI chat.

### Recommendation with user control

Catalyst recommends a plan; it does not lock the student into a plan. Users can adjust, skip, reschedule, pause, or create their own task.

### Supportive, not punitive

Notifications should help the student recover and continue. Avoid guilt-based messages such as “You failed today” or “You are falling behind.”

### Explainable by default

Every generated task should include a short reason, such as “Your recent quiz score was low” or “Your CSC430 exam is in four days.”

### Focused information density

The Study Plan workspace should feel like a professional learning workspace: compact rows, clear hierarchy, thin borders, restrained color, and useful density. Decorative elements must not compete with the study plan.

## Information architecture

The existing primary navigation remains:

- Home
- Study Plan
- Classes
- Learning
- Calendar
- Notes
- AI Assistant

Study Plan is a dedicated top-level workspace at `/study-plan`, placed directly below Home in the sidebar. Home remains a separate landing page owned by another feature area and should not be modified as part of this feature.

Future routes may include `/study-plan/setup`, `/study-plan/history`, and `/study-plan/progress`.

Data ownership remains distributed:

- Classes owns courses, topics, and course resources.
- Learning owns quizzes, flashcards, reading, and activity outcomes.
- Calendar owns class events, exams, and deadlines.
- Study Plan owns daily recommendations, tasks, sessions, and task lifecycle.
- Study Plan reads and summarizes these sources.

## Study Plan layout

The desktop layout uses three regions:

```text
┌─────────────┬──────────────────────────────┬──────────────────┐
│ Sidebar     │ Main Study Plan workspace    │ Right panel      │
│             │                              │                  │
│ Home        │ Greeting + actions           │ Today            │
│ Study Plan  │ Stats + study plan           │ Mini calendar    │
│ Classes     │ Progress panels              │ Today schedule   │
│ Learning    │ Task list                    │ Exam schedule    │
│ Calendar    │                              │                  │
│ Notes       │                              │ Exam schedule    │
│ AI Chat     │                              │                  │
└─────────────┴──────────────────────────────┴──────────────────┘
```

### Header

The header contains:

- Greeting, such as “Good afternoon, Khai.”
- Current date.
- Workspace search placeholder.
- Notification bell with unread indicator.
- User avatar/profile control.

Primary actions appear directly below or beside the header:

- `+ Create task`
- `Plan my study session`

### Summary cards

The first row contains three compact metrics:

1. **Study streak** — consecutive days with an active study session.
2. **Hours studied** — total active study time for the selected period.
3. **Topic mastery** — aggregate mastery across the student’s actionable topics.

The cards use the existing Catalyst palette:

- Canvas: `#FAFAF8`
- Container: `#FFFFFF`
- Warm surface: `#F5F0EB`
- Primary gold: `#B08957`
- Text: `#3D3A34`
- Muted text: `#8A8477`
- Success sage: `#6B8F5E`
- Error/caution coral: `#C2685A`

Avoid purple, bright blue, and pink as primary Study Plan surfaces.

### Progress panels

The main area includes:

- **Hours spent:** a simple daily bar chart with week/month selection.
- **Performance:** a mastery gauge or score summary with a link to details.
- **Reason:** the panel should name the weakest actionable topic when available.

The performance metric represents topic mastery, not a grade. The label should be “Topic mastery” or “Learning performance,” not “Score,” unless the value is an actual course grade.

### Today's study plan

The study plan is the main functional panel. It shows up to three tasks for the current day.

Each row contains:

- Status indicator.
- Task name.
- Course and topic context.
- Short recommendation reason.
- Estimated minutes.
- Primary action: `Start`, `Resume`, or `Completed`.

Example:

```text
Today's study plan                         60 min · Adjust

✓ Review SQL joins                          20 min · Completed
  CSC430 · Weak topic

○ Read Lesson 7.2                           20 min · Start
  CSC430 · Exam in 4 days

○ Take a practice quiz                      20 min · Start
  Check your mastery
```

### Right panel

The right panel contains compact context blocks:

1. **Mini calendar** — current date and deadline markers.
2. **Today’s schedule** — fixed classes and planned study sessions.
3. **Task list** — a quick completion view for today.
4. **Exam schedule** — upcoming exams and assignments with time remaining.

Fixed commitments and flexible study tasks should be visually distinguishable, but they can be shown in the same chronological schedule.

## User flows

### First plan of the day

```text
Study Plan with no plan
  → Plan my study session
  → Choose available time
  → Choose goal
  → Choose course/topic or Let Catalyst choose
  → Optional activity preference
  → Generate plan
  → Review plan and reasons
  → Start first task or adjust plan
```

The setup asks only the minimum needed information:

- Available time: 15, 30, 60, or 90+ minutes.
- Main goal: exam preparation, weak-topic review, assignment, or general progress.
- Course/topic: selected course/topic or `Let Catalyst choose`.
- Optional preferred activity: quiz, flashcards, reading, explanation, or automatic choice.

When a plan already exists, the Study Plan page displays it immediately. The user does not repeat setup every time they open the page. `Adjust` allows changing available time or focus.

### Manual task creation

`+ Create task` opens a compact modal or popover.

Required MVP fields:

- Task title.
- Course.
- Activity type: quiz, flashcards, reading, or AI explanation.
- Duration.
- Scheduled date.

Optional MVP field:

- Reminder time.

The created task appears in Today’s study plan or the selected date’s task list. Manual tasks use the same task lifecycle as recommended tasks, but their source is `manual` rather than `recommended`.

### Starting a task

```text
Start task
  → Navigate to related activity
  → Create active study session
  → Show persistent focus bar
  → Pause, resume, or exit
  → Complete activity
  → Record active minutes and outcome
  → Update task status and mastery
  → Show supportive completion message
```

The app uses a soft focus mode. It should encourage focus but never trap the student. The student can pause or exit, and progress is saved.

### Focus bar

While a task is active, show a persistent bar:

```text
Studying: Review SQL joins · 18:42 remaining
[Pause] [Exit and save]
```

The timer counts active study time, not time while paused. Leaving the target activity should pause or ask the user whether to pause, depending on the existing navigation behavior.

## Task and session state model

The task status remains aligned with the existing adaptive study-plan domain contract:

```text
recommended → in_progress → completed
                    │             │
                    │             └→ mastery update
                    │
                    ├→ skipped
                    └→ rescheduled
```

Behavior:

- `recommended`: task is available but not started.
- `in_progress`: an active session exists.
- `completed`: task activity ended successfully; outcome is recorded when available.
- `skipped`: user intentionally removes the task from today’s active plan.
- `rescheduled`: user moves the task to a future date.

Pause is a `StudySession` state rather than a `StudyTask` status. A paused session keeps its task in `in_progress`, saves elapsed active minutes, and remains resumable unless the user explicitly skips or reschedules it.

## Notification and support behavior

The MVP includes an in-app notification center opened from the bell icon. Device/browser push notifications are a later phase.

### Notification types

- Upcoming session reminder: “Your SQL review starts in 10 minutes.”
- Focus support: “You’ve been studying for 25 minutes. Take a short break or continue?”
- Completion encouragement: “Nice work. You completed your first task today.”
- Recovery: “Your progress is saved. Continue yesterday’s task today?”
- Deadline reminder: “Your CSC430 exam is in four days. SQL joins needs review.”

Each actionable notification should provide a direct action, such as `Open study plan`, `Start session`, or `Reschedule`.

Notification preferences should eventually let the user control reminders. The MVP may provide a single reminder preference in the task creation form and a basic notification settings entry.

## Catalyst coach

Catalyst remains the existing AI assistant identity. The 3D boat is not required for the Study Plan MVP.

For this phase, Catalyst appears as:

- An optional `Ask Catalyst` action.
- Small contextual guidance during setup.
- Supportive copy in focus and completion states.
- A future visual mascot slot that can be replaced by a 2D or 3D asset.

The coach must not compete with the task list or notification center, and it must have a hide/disable option.

## Data requirements

The design depends on the following domain entities:

```text
StudyTask
- id
- userId
- title
- courseId
- topicId
- activityType
- estimatedMinutes
- scheduledDate
- status
- source: recommended | manual
- reason[]
- reminderAt?
- createdAt
- updatedAt
```

```text
StudySession
- id
- taskId
- userId
- startedAt
- pausedAt?
- completedAt?
- activeMinutes
- status
```

```text
Notification
- id
- userId
- type
- title
- message
- actionUrl?
- scheduledAt
- readAt?
```

The existing adaptive study-plan design already defines topic mastery, priority scoring, plan generation, Firestore persistence, and task lifecycle APIs. This dashboard design consumes those contracts rather than duplicating their logic.

## Responsive behavior

Desktop:

- Three-column layout with sidebar, main content, and right context panel.

Tablet:

- Collapse the right panel below the main content.
- Keep the study plan and primary actions visible without horizontal scrolling.

Mobile:

- Use a single-column layout.
- Move calendar and exam schedule below Today’s plan.
- Keep the active focus bar fixed above the bottom safe area.
- Use a menu button for primary navigation.

## Accessibility and quality requirements

- Use semantic buttons and form labels for all actions.
- Do not use color alone to communicate status.
- Provide text labels for mastery and deadline urgency.
- Maintain readable contrast for the Catalyst warm palette.
- Provide accessible names for the notification bell, profile, chart controls, and task actions.
- Support keyboard navigation through the create-task modal and notification panel.
- Respect reduced-motion preferences.
- Ensure fixed focus bars do not hide keyboard focus or content.
- Use vector icons from the existing icon system rather than emoji as structural controls.

## MVP acceptance criteria

- A student can create a daily plan by answering a short setup flow.
- The Study Plan page displays no more than three recommended tasks.
- Every recommended task has a human-readable reason.
- A student can manually create a task.
- A task can be started, paused, resumed, completed, skipped, or rescheduled.
- Active study minutes are tracked separately from paused time.
- Completion can update topic mastery and the remaining plan.
- The Study Plan page shows streak, hours studied, topic mastery, hours chart, study plan, calendar, today’s schedule, task list, and exam schedule.
- In-app notifications can display reminders, encouragement, deadline warnings, and recovery actions.
- The notification copy remains supportive and non-judgmental.
- Existing navigation and learning flows continue to work.

## Out of scope for this design review

This spec does not yet define:

- Exact Firestore security-rule changes.
- Exact recommendation weights.
- Browser push implementation.
- The final 3D boat asset or animation system.
- Full analytics/reporting pages.
- The implementation task breakdown.

Those should be addressed in the implementation plan after this spec is approved.
