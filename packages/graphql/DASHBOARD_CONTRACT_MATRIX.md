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
| `/student/schedule`                                              | `studentSchedule`, `studentLesson`                                                                                                                   |
| `/student/assignments` and `/student/assignments/[assignmentId]` | `studentAssignments`, `studentAssignment`, `submitAssignment`                                                                                        |
| `/student/library` and `/student/library/[slug]`                 | `studentLibraryItems`, `studentLibraryItem`, `createStudentLibraryDownloadIntent`                                                                    |
| `/student/tests` and `/student/tests/[testId]`                   | `studentAvailableTests`, `studentTest`, `startTestAttempt`, `studentAttempt`, `saveAttemptAnswer`, `submitTestAttempt`                               |
| `/student/results` and `/student/results/[attemptId]`            | `studentResults`, `studentAttempt`                                                                                                                   |
| `/student/progress`                                              | `studentProgress`, `studentResults`                                                                                                                  |
| `/student/payments`                                              | `studentTuitionLedger`                                                                                                                               |
| `/student/notifications`                                         | `myNotifications`, `myUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`                                                   |
| `/student/settings`                                              | `myProfile`, `updateMyProfile`                                                                                                                       |

## Teacher Workspace

| Frontend route                       | Backend operations                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/teacher/groups`                    | `teacherGroups`, `createTeacherGroup`, `updateTeacherGroup`, `deleteTeacherGroup`                                                                               |
| `/teacher/groups/[slug]`             | `teacherGroup`, `teacherGroupOverview`, `teacherGroupRosterSummary`                                                                                             |
| `/teacher/groups/[slug]/students`    | `teacherGroupRoster`, `teacherGroupRosterSummary`, `addStudentToGroup`, `setGroupMembershipParticipationStatus`, `endGroupMembership`, `requestStudentTransfer` |
| `/teacher/groups/[slug]/materials`   | `teacherGroupMaterials`                                                                                                                                         |
| `/teacher/groups/[slug]/assignments` | `teacherGroupAssignments`                                                                                                                                       |
| `/teacher/groups/[slug]/tests`       | `teacherTestPapers`, `teacherTestPaper`, `createTeacherPracticeTest`, `teacherTestDraft`, `teacherTestVersion`, `createTestPaperSkillDraft`                     |
| `/teacher/transfer-requests`         | `teacherTransferRequests`                                                                                                                                       |

## Operational Admin Workspace

| Frontend route                                      | Backend operations                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/admin`                                            | `adminOperationalOverview`, `adminAcademicOverview`, `myUnreadNotificationCount`                                |
| `/admin/requests`                                   | `adminContactRequests`, `adminExamRegistrations`, `adminEventRegistrations` and their reviewed-status mutations |
| `/admin/students` and `/admin/students/[studentId]` | `adminProvisionUser`, `adminStudents`, `adminUser`, `adminStudentResults`, `adminSetUserStatus`                 |
| `/admin/teachers` and `/admin/teachers/[teacherId]` | `adminProvisionUser`, `adminUsers(role: TEACHER)`, `adminUser`, `adminSetUserStatus`                            |
| `/admin/groups` and `/admin/groups/[slug]`          | `adminGroups`, `adminGroup`, `adminGroupProgresses`                                                             |
| `/admin/courses` and `/admin/courses/[slug]`        | `adminCourses`, `adminCourse`, course draft/status mutations                                                    |
| `/admin/events` and `/admin/events/[slug]`          | `adminEvents`, `adminEvent`, `adminEventRegistrations`, event draft/status mutations                            |
| `/admin/locations`                                  | `adminLocations`                                                                                                |
| `/admin/schedule`                                   | `adminSchedule`                                                                                                 |
| `/admin/attendance`                                 | `adminAttendance`                                                                                               |
| `/admin/payments` and `/admin/payments/[recordId]`  | `adminTuitionLedger` (read-only; no payment-provider operation)                                                 |
| `/admin/tests` and `/admin/tests/[testId]`          | `adminTests`, `adminTest`, `adminAcademicOverview`, `adminStudentResults`                                       |
| `/admin/results`                                    | `adminAcademicOverview`, `adminGroupProgresses`, `adminStudentResults`                                          |
| `/admin/library` and `/admin/library/[resourceId]`  | `adminLibraryItems`, `adminMediaObjects`, `adminSetLibraryItemArchived`, `adminRejectMediaObject`               |
| `/admin/imports` and `/admin/imports/[jobId]`       | `adminMediaObjects`; the approved local-export vocabulary pilot remains offline and review-only                 |
| `/admin/transfer-requests`                          | `adminTransferRequests`, `reviewStudentTransfer`                                                                |
| `/admin/notifications`                              | `myNotifications`, `markNotificationRead`, `markAllNotificationsRead`                                           |
| `/admin/audit`                                      | `adminAuditLogs`                                                                                                |
| `/admin/reports`                                    | `adminOperationalOverview`, `adminAcademicOverview`, `adminGroupProgresses`                                     |
| `/admin/settings`                                   | `myProfile`, `updateMyProfile`                                                                                  |

## Safety boundary

- Every operation above uses server-loaded roles and ownership/scope checks.
- Correct answers never enter Student or Admin payloads.
- Provider-backed AI generation and evaluation are not part of this contract.
- Tuition ledger operations are read-only. Checkout, capture, refunds, payouts,
  and payroll are intentionally absent.
- Parent/Guardian, Super Admin, chat, public signup/password reset,
  certificates, and AI grading are not part of this contract.
