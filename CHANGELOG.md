# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-03-17

Initial public release of Multicourses as an academic operations platform for teachers, students, admins, and institutions.

### Added

- Public workspace with updated landing, about, contact, legal, and maintenance pages.
- New shared branding assets, including app icon, favicon, web icons, and reusable public navigation/footer components.
- Institution workspace with its own dashboard, teacher approvals, user linking, course assignment, plan visibility, and institution state panels.
- Public active user count sync tooling and maintenance scripts for operational cleanup and data repair.
- Support for public legal pages and improved SEO-related metadata wiring.

### Changed

- Refined visual design across public pages, auth, footer, navigation, and institutional flows for a more consistent product identity.
- Expanded role-aware navigation and permissions so institution accounts can manage related users and access institution-relevant screens.
- Improved calendar and assessment loading so institution-assigned teachers can see assessments created under institution-managed courses.
- Updated enrollment and course-join behavior to work correctly in Spark environments without requiring Cloud Functions.
- Adjusted multiple teacher, student, assessment, and institution workflows to better handle mixed ownership, role filtering, and platform edge cases.

### Fixed

- Fixed false permission errors during teacher assignment and student enrollment where writes succeeded but secondary sync steps failed.
- Fixed self-enrollment safeguards so teachers cannot enroll their own account as a student.
- Fixed modal usability issues for student enrollment on smaller screens.
- Fixed role classification problems where institution accounts appeared as students in teacher-facing lists.
- Fixed course join issues for students entering newer or institution-origin courses under restricted Firestore rules.
- Fixed calendar visibility gaps for assessments tied to institution-managed courses with legacy or mixed course references.

