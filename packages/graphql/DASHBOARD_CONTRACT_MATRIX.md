# Student, Teacher, and Admin dashboard contract matrix

This file is the implementation map between the localized routes in the sibling
`best-react` repository and this API's server-authorized GraphQL operations.
Public signup and social identity exchange are removed. `beginCredentialLogin`
creates the email challenge and `verifyCredentialLogin` returns the short-lived
bearer token only after the code succeeds.

## Authentication

| Frontend state                | Backend operations                                                  |
| ----------------------------- | ------------------------------------------------------------------- |
| Login credentials             | `beginCredentialLogin`                                              |
| Email-code verification       | `verifyCredentialLogin`, `resendCredentialLoginCode`                |
| Admin creates Student/Teacher | `adminProvisionUser` (server-restricted to `STUDENT` and `TEACHER`) |

## Student Workspace

| Frontend route                                                   | Backend operations                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/student`                                                       | `viewer`, `myProfile`, `studentCurrentGroup`, `studentProgress`, `studentSchedule`, `studentAssignments`, `studentAvailableTests`, `myNotifications` |
| `/student/courses` and `/student/courses/[slug]`                 | `studentCurrentGroup`, `publicCourse` for localized catalogue presentation                                                                           |
| `/student/schedule` (My Group)                                   | `studentCurrentGroup`, `studentGroupLessons`, `studentGroupMaterials`, `createStudentLibraryDownloadIntent`                                          |
| `/student/assignments` and `/student/assignments/[assignmentId]` | `studentAssignments`, `studentAssignment`, `submitAssignment`                                                                                        |
| `/student/library` and `/student/library/[slug]`                 | `studentLibraryItems`, `studentLibraryItem`, `createStudentLibraryDownloadIntent`                                                                    |
| `/student/tests` and `/student/tests/[testId]`                   | `studentAvailableTests`, `studentTest`, `startTestAttempt`, `studentAttempt`, `saveAttemptAnswer`, `submitTestAttempt`                               |
| `/student/results` and `/student/results/[attemptId]`            | `studentResults`, `studentAttempt`                                                                                                                   |
| `/student/progress`                                              | `studentProgress`, `studentResults`                                                                                                                  |
| `/student/payments`                                              | `studentTuitionLedger`                                                                                                                               |
| `/student/notifications`                                         | `myNotifications`, `myUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`                                                   |
| `/student/settings`                                              | `myProfile`, `updateMyProfile`                                                                                                                       |

## Teacher Workspace

| Frontend route                       | Backend operations                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/teacher/groups`                    | `teacherGroups`, `createTeacherGroup`, `updateTeacherGroup`, `deleteTeacherGroup`                                                           |
| `/teacher/groups/[slug]`             | `teacherGroup`, `teacherGroupOverview`, `teacherGroupRosterSummary`                                                                         |
| `/teacher/groups/[slug]/students`    | `teacherGroupRoster`, `teacherGroupRosterSummary`, `addStudentToGroup`, `setGroupMembershipParticipationStatus`, `endGroupMembership`       |
| `/teacher/groups/[slug]/materials`   | `teacherGroupMaterials`                                                                                                                     |
| `/teacher/groups/[slug]/assignments` | `teacherGroupAssignments`                                                                                                                   |
| `/teacher/groups/[slug]/tests`       | `teacherTestPapers`, `teacherTestPaper`, `createTeacherPracticeTest`, `teacherTestDraft`, `teacherTestVersion`, `createTestPaperSkillDraft` |

## Operational Admin Workspace

The Admin Attendance, Tests, Results, Locations, Library, Imports, Reports, and
Audit routes and their Admin-only GraphQL contracts were removed on 2026-10-11.

| Frontend route                                      | Backend operations                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/admin`                                            | `adminOperationalOverview`, `myUnreadNotificationCount`                                                         |
| `/admin/requests`                                   | `adminContactRequests`, `adminExamRegistrations`, `adminEventRegistrations` and their reviewed-status mutations |
| `/admin/students` and `/admin/students/[studentId]` | `adminProvisionUser`, `adminUsers(role: STUDENT)`, `adminUser`, `adminDeleteStudent`, `adminSetUserStatus`      |
| `/admin/teachers` and `/admin/teachers/[teacherId]` | `adminProvisionUser`, `adminUsers(role: TEACHER)`, `adminUser`, `adminSetUserStatus`                            |
| `/admin/groups` and `/admin/groups/[slug]`          | `adminGroups`, `adminGroup`                                                                                     |
| `/admin/courses` and `/admin/courses/[slug]`        | `adminCourses`, `adminCourse`, course draft/status mutations                                                    |
| `/admin/events` and `/admin/events/[slug]`          | `adminEvents`, `adminEvent`, `adminEventRegistrations`, event draft/status mutations                            |
| `/admin/schedule`                                   | `adminSchedule`                                                                                                 |
| `/admin/payments` and `/admin/payments/[recordId]`  | `adminTuitionLedger` (read-only; no payment-provider operation)                                                 |
| `/admin/notifications`                              | `myNotifications`, `markNotificationRead`, `markAllNotificationsRead`                                           |
| `/admin/settings`                                   | `myProfile`, `updateMyProfile`                                                                                  |

## Safety boundary

- Every operation above uses server-loaded roles and ownership/scope checks.
- Correct answers never enter Student or Admin payloads.
- Provider-backed AI generation and evaluation are not part of this contract.
- Tuition ledger operations are read-only. Checkout, capture, refunds, payouts,
  and payroll are intentionally absent.
- Parent/Guardian, Super Admin, chat, public signup/password reset,
  certificates, and AI grading are not part of this contract.


## Admin operations expansion (2026-10-11)

| Route | Read contracts | Write contracts |
| --- | --- | --- |
| /admin/groups | adminGroupDirectory, adminDirectoryOptions, adminGroup | adminSaveGroup, adminSetGroupStatus |
| /admin/schedule | adminLessonDirectory | adminSaveLesson, adminSetLessonStatus |
| /admin/payments | adminPaymentDirectory, adminPaymentDetail | Read-only ledger |
| /admin/salary | adminSalaryDirectory | adminSaveSalary, adminFinalizeSalary |
| /admin/settings | myProfile | updateMyProfile, changeMyPassword |

All operations require a current database-resolved Admin role, except the existing
self-profile contracts shared at the transport layer. Admin presentation remains
role-owned. Salary finalization does not execute a payment. Lists paginate on the
server; summary totals apply to the complete filtered result, not the visible page.


## Admin public-content operations (2026-10-11)

| Route | Read contracts | Write contracts |
| --- | --- | --- |
| /admin | adminOverview, recipient-scoped adminOperationalOverview | None |
| /admin/courses | adminCourseCatalog, adminCourse | adminSaveCourseContent, setCourseStatus, adminRemoveCourse |
| /admin/events | adminEventCatalog, adminEvent | adminSaveEventContent, setEventStatus, adminRemoveEvent |
| /admin/exams | adminExamCatalog, adminExamSessionDirectory | adminSaveExam, adminSaveExamSession, adminRemoveExam |
| /admin/requests | adminRequestDirectory (COURSE/EVENT/EXAM) | adminReviewRequest |
| /admin/notifications | adminNoticeDirectory | markNotificationRead, markAllNotificationsRead |

These contracts reuse the existing PostgreSQL public-content, translation,
registration and notification tables; no new migration is required. Contact
submissions remain in Messages. All Admin operations require the database-resolved
ADMIN role. Public registration still requires consent and uses its existing API.

Content edits persist all three translations and nested lists atomically. Course
and event edits compare updatedAt, offering/session edits compare a content
revision, and request reviews compare updatedAt. Public registrations and Admin
capacity changes serialize against the same lock; capacity cannot be lowered
below existing registrations. Archive retains content and registration history.
Public pages retain their existing Next.js revalidation policy (no new Next API
route or server action). Notifications and unread counts are recipient-scoped.

Verification: four Admin editorial GraphQL integration tests cover public reads,
registrations, request review, stale edits, concurrent capacity limits, RBAC,
notification ownership and database persistence. They run with the existing
isolated GraphQL integration harness.
