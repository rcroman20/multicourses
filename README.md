# Multicourses

Multicourses is an academic operations platform built for institutions, teachers, students, and admins. It centralizes course management, assessments, grading flows, approvals, institutional assignment, and public-facing onboarding in a single workspace.

Current version: `1.0.0`

## What the project includes

- Public workspace with landing, about, contact, auth, legal, and plan-related pages.
- Teacher workspace for courses, students, assessments, grades, materials, slides, and analytics.
- Student workspace for enrolled courses, grades, assessments, and academic tracking.
- Institution workspace for linking users, approving teachers, assigning teachers to institution-owned courses, and monitoring institutional state.
- Admin workspace for users, permissions, reports, billing, backups, audit logs, institution operations, and support flows.

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui and Radix UI
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Vitest

## Local development

### Requirements

- Node.js 20+
- npm
- A Firebase project configured for this app

### Install

```sh
npm install
```

### Start the app

```sh
npm run dev
```

### Production build

```sh
npm run build
```

### Preview the production build

```sh
npm run preview
```

## Main scripts

- `npm run dev`: start the Vite development server.
- `npm run build`: create a production build in `dist/`.
- `npm run build:dev`: build using development mode.
- `npm run lint`: run ESLint.
- `npm run test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run sync:active-users`: sync the public active users counter shown in the public workspace.

## Firebase setup

This project uses Firebase for authentication, Firestore data, and hosting.

Relevant project files:

- [firebase.json](/Users/robertoroman/Downloads/multicourses/firebase.json)
- [firestore.rules](/Users/robertoroman/Downloads/multicourses/firestore.rules)
- [src/lib/firebase.ts](/Users/robertoroman/Downloads/multicourses/src/lib/firebase.ts)

Notes:

- The current app is designed to work in environments that may still use the Spark plan.
- Several flows already include local fallbacks so the app does not depend on Cloud Functions for core academic actions.
- Hosting is configured to serve the built app from `dist/` and rewrite all routes to `index.html`.

## Project structure

- [src/pages/shared](/Users/robertoroman/Downloads/multicourses/src/pages/shared): shared pages such as landing, auth, calendar, courses, assessments, grades, and legal pages.
- [src/pages/teacher](/Users/robertoroman/Downloads/multicourses/src/pages/teacher): teacher-facing pages and workflows.
- [src/pages/students](/Users/robertoroman/Downloads/multicourses/src/pages/students): student-facing dashboard views.
- [src/pages/institution](/Users/robertoroman/Downloads/multicourses/src/pages/institution): institution dashboard and institution-specific operations.
- [src/pages/admin](/Users/robertoroman/Downloads/multicourses/src/pages/admin): admin control center pages.
- [src/contexts](/Users/robertoroman/Downloads/multicourses/src/contexts): auth, academic, and notification state.
- [src/lib/services](/Users/robertoroman/Downloads/multicourses/src/lib/services): business logic, Firebase operations, and operational services.
- [src/components](/Users/robertoroman/Downloads/multicourses/src/components): shared UI, layout, and route protection components.
- [src/scripts](/Users/robertoroman/Downloads/multicourses/src/scripts): maintenance and repair scripts for data operations.

## Core product flows

### Teachers

- View assigned courses
- Create and manage assessments
- Grade activities
- Manage classroom students
- Organize course materials, units, and slides

### Students

- Join available courses
- Review assessments and due dates
- Track grades and academic progress
- Access course materials

### Institutions

- Link teachers and students to the institution
- Approve teacher requests
- Assign teachers to institution-managed courses
- Monitor institution-owned course operations

### Admins

- Manage users and permissions
- Review reports and billing
- Audit platform activity
- Oversee support, institutions, and operational maintenance

## Release tracking

- Current release: `v1.0.0`
- Changelog: [CHANGELOG.md](/Users/robertoroman/Downloads/multicourses/CHANGELOG.md)

## Repository

- GitHub: `https://github.com/rcroman20/multicourses`

