# Learning Workspace Redesign

**Date:** October 13, 2026  
**Status:** Approved for implementation planning (amended 2026-10-13: landing stats strip, 60-day streak lookback)  
**Branch:** `Iris_UI_Redesign_page_quizz_flashcard`

## Purpose

Make the Learning workspace easier to understand without removing the features or behaviors already implemented. The current hero presents “Explore classes” and “Start study plan” as destinations, but both buttons only switch an internal `activeView` on the same page. The redesign replaces that ambiguous interaction with a Learning landing page and two real route destinations.

Success means that a student can immediately choose between class-centered learning and plan-centered study, use browser Back predictably, resume recent work quickly, and still access every existing action in the appropriate destination.

## Information Architecture

The Learning area uses three routes:

- `/learning` — Learning landing page
- `/learning/classes` — Explore Classes page
- `/learning/study-plan` — Study Plan page

The main sidebar continues to use one Learning entry. It remains visually active for all three routes. Each child page includes a visible “Learning home” return link and uses normal Next.js route navigation so browser history and deep links work predictably.

## Learning Landing Page

The landing page is a calm decision surface rather than a dashboard containing every Learning feature.

Content order:

1. Page heading and short instruction.
2. Two large, fully clickable destination cards:
   - **Explore your classes** — opens `/learning/classes`.
   - **Start your study plan** — opens `/learning/study-plan`; if no usable plan exists, the existing setup flow opens within the Study Plan route.
3. **Continue where you left off** — a compact resume row shown only when a valid recent class activity or plan task exists. It displays the activity title, course context, remaining time when available, and one Resume action.
4. A compact streak badge showing the current streak and linking conceptually to the detailed streak presentation on the Study Plan page.
5. A compact at-a-glance stats strip (current streak, study time this week, topics mastered, today's progress). **Amended 2026-10-13 by the product owner:** the four `StatCards` values must survive the redesign in a smaller single-row form; the landing page may lose the four large tiles but not the information. The streak value here comes from the real streak model, not the former 0/1 placeholder.

The landing page does not show the full recommendation list, course mastery grid, plan workspace, or custom study material controls.

## Explore Classes Page

This page prioritizes course context and mastery.

Content order:

1. Page heading and Learning-home return link.
2. **Today’s course focus** using the most relevant recent or active course topic. Its action opens the existing course learning destination.
3. **Recent Focus** near the top using the existing chicken-based `WeeklyChickenChart`, including its current data, daily average, weekday presentation, empty state, and “View daily totals” control.
4. **Course mastery** with the existing class cards/list selector, mastery values, progress indicators, empty state, and class navigation.
5. **Recommended for you** below the primary course content. Existing actions remain available: Add to plan, Dismiss, and Practice this weak spot.

Custom Study Material is intentionally absent. Quiz, flashcard, and related one-off creation remain in the existing Discover experience, which already provides a dedicated interface for those tasks.

## Study Plan Page

This page prioritizes planning, task execution, and study consistency.

Content order:

1. Page heading and Learning-home return link.
2. **Today’s Study Plan** header, progress metrics, plan progress, and all existing actions: Add task, Get suggestions, Start next task, and Clear plan.
3. **Plan Workspace** with the existing List, Board, and Schedule views and all existing task actions, including start, continue, pause, complete, skip, reschedule, and delete where currently available.
4. **Focus Mode** with the existing timer recommendation and session behavior.
5. A large **study streak card** paired with Recent Focus.
6. **Recent Focus** using the existing chicken-based `WeeklyChickenChart` and all current behavior.
7. **Recommended for you** below the plan and focus tools, retaining Add to plan, Dismiss, and Practice this weak spot.

Completed-plan, empty-plan, auto-plan, and setup states remain available on this route. Opening a task-specific Learning URL must select the Study Plan destination and preserve the current task highlight behavior.

## Streak Design

The streak uses an original scalable SVG rather than an emoji or raster icon.

- Two-tone flame: orange outer flame and warm-yellow inner flame.
- Compact badge on the Learning landing page.
- Large card on the Study Plan page with seven weekday indicators, current streak count, and a brief motivational message.
- The streak is read from at most the previous 60 local days of study sessions (**amended 2026-10-13** to bound Firestore read cost); a streak longer than the window reports as the window length.
- Completed and incomplete days use text or symbols in addition to color.
- The SVG is decorative when equivalent visible text is present; the streak value remains available to assistive technology as a complete phrase.
- Any optional flame motion must be subtle and disabled by `prefers-reduced-motion`.

## Illustration Assets

Create two original illustrations after the final card proportions are implemented:

- **Explore Classes:** a student browsing books, course cards, or learning topics.
- **Study Plan:** a student organizing tasks with a calendar and focus timer.

The reference images inform warmth, friendliness, and composition only. The new artwork must not reproduce reference characters. Use transparent PNG or WebP for detailed character artwork and SVG for simple decorative shapes, icons, and backgrounds. Assets must reserve text-safe space, include explicit dimensions or aspect ratios, and avoid layout shift. Meaningful images receive descriptive alternative text; purely decorative artwork uses empty alternative text.

## Component and Data Boundaries

The existing `/learning` page currently owns data loading, planning state, suggestions, mastery data, modals, and all content views. The implementation should separate page composition while keeping shared behavior centralized.

- A shared Learning workspace layer owns authentication-dependent data, plan state, enrolled classes, suggestions, mastery, notifications, modals, and action callbacks.
- Route pages compose focused sections from existing components rather than duplicating business logic.
- Existing components such as `ClassGrid`, `PlanSection`, `FocusModeCard`, `WeeklyChickenChart`, `LearningSuggestionCard`, setup modals, and task views retain their current behavior.
- Shared recommendation rendering remains one reusable component so actions and error states do not drift between routes.
- Resume-target selection is derived from existing plan/task and course activity data. If no valid target exists, the landing page omits the resume row without leaving an empty placeholder.

## Loading and Error Behavior

Each route provides a stable loading state that reserves the major layout regions. Existing auto-plan status messages and action-specific errors remain close to the relevant controls.

- A failed Learning data load shows a clear message and retry action without hiding global navigation.
- An unavailable resume target is removed rather than shown as a disabled dead end.
- A missing or deleted class destination returns the user to Explore Classes with an explanatory message.
- Async buttons remain disabled while saving and expose visible progress.
- Route changes preserve browser history and do not silently reset plan or view state.

## Responsive and Accessibility Requirements

- Destination cards use two columns on wide screens and stack on narrow screens.
- Plan workspace and supporting cards collapse to a single readable column on smaller viewports.
- No horizontal page scrolling at supported breakpoints.
- Keyboard order follows visual order; the entire destination card has one clear interactive target.
- All interactive controls have visible focus, hover, pressed, loading, and disabled states.
- Normal text meets WCAG AA contrast, and meaning is never conveyed by color alone.
- Route changes move focus to the main page heading for screen-reader orientation.
- Existing controls keep their accessible names and semantics after relocation.
- Generated artwork never blocks text scaling or interactive targets.

## Verification

Implementation verification must cover:

- Navigation from `/learning` to both child routes and predictable browser Back behavior.
- Sidebar Learning active state on all Learning routes.
- Conditional resume row with valid and absent resume targets.
- Existing recommendation actions on both contextual placements.
- Existing Course Mastery cards/list view and class navigation.
- Existing plan setup, empty, active, completed, and auto-plan states.
- List, Board, and Schedule plan views and existing task actions.
- Focus Mode behavior and task-specific deep links.
- Chicken-based Recent Focus behavior and “View daily totals.”
- Streak values, weekday states, accessible labeling, and reduced-motion behavior.
- Responsive layouts at small phone, tablet, laptop, and large desktop widths.
- Keyboard-only navigation, focus visibility, heading hierarchy, and contrast.

## Out of Scope

This redesign does not change the study recommendation algorithm, mastery calculation, plan-generation logic, task/session behavior, Firebase data model, or Discover workflows. It does not remove any existing Learning action. It changes information architecture, page composition, navigation, visual hierarchy, and supporting artwork.
