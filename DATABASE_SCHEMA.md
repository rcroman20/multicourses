# Estructura de Bases de Datos (MultiCourses)

## 1) Resumen

Este proyecto usa principalmente **Cloud Firestore** como base de datos.

También tiene:
- **Firebase Auth** (autenticacion de usuarios).
- **Firebase Storage** configurado, pero en el codigo actual no hay operaciones activas de subida/borrado de archivos binarios.
- **Firebase Realtime Database** configurado (`databaseURL`), pero no se usa desde la app web actual.
- **localStorage** para preferencias, estado de UI y metadatos de automatizacion.

## 2) Firestore (colecciones detectadas)

Colecciones encontradas en codigo y/o reglas:
- `usuarios`
- `usuarios/{userId}/notifications` (subcoleccion)
- `estudiantes`
- `cursos`
- `gradeSheets`
- `assessments`
- `evaluaciones` (legado)
- `grades`
- `notas` (legado)
- `submissions`
- `assessmentForumComments`
- `exerciseQuestions`
- `exerciseThemeLinks`
- `quizAttempts`
- `course_files`
- `periods`
- `weeks`
- `unidades`
- `semanas`
- `diapositivas`
- `courseBackups`
- `units` (referenciada en codigo legado)

## 3) Modelo por coleccion

## `usuarios`

Documento: `usuarios/{uid}`

Campos observados:
- `id: string`
- `email: string`
- `name: string`
- `role: "docente" | "estudiante" | "admin"`
- `idNumber?: string`
- `whatsApp?: string`
- `avatarUrl?: string`
- `avatarEmoji?: string`
- `bio?: string`
- `phone?: string`
- `location?: string`
- `website?: string`
- `instagram?: string`
- `preferences?: object`
- `createdAt: timestamp|Date`
- `updatedAt?: timestamp`

Relaciones:
- 1 usuario puede tener muchas notificaciones en `usuarios/{uid}/notifications`.
- El `uid` de Auth se usa como id del documento.

Reglas:
- Lectura para autenticados.
- Crear/actualizar solo propietario.
- Borrar: propietario o docente borrando estudiantes.

## `usuarios/{userId}/notifications` (subcoleccion)

Documento: `usuarios/{userId}/notifications/{notificationId}`

Campos:
- `title: string`
- `message: string`
- `type: "info" | "success" | "warning"`
- `link?: string`
- `read: boolean`
- `createdAt: timestamp`
- `expiresAt: timestamp`

Reglas:
- Leer: solo propietario.
- Crear: usuario autenticado con validacion estricta de campos.
- Update: solo cambia `read`.
- Delete: propietario o docente.

## `estudiantes`

Documento: `estudiantes/{studentId}`

Campos observados:
- `id?: string`
- `idNumber: string`
- `email: string`
- `name: string`
- `role: "estudiante"` (o heredado)
- `whatsApp?: string`
- `courses?: string[]` (ids de cursos)
- `createdAt: timestamp|Date`
- `updatedAt?: timestamp`

Relaciones:
- Vincula con `usuarios` por el mismo id en flujos normales.
- Relacion N:N con `cursos` via `courses[]` y `cursos.enrolledStudents[]`.

Reglas:
- Read para autenticados.
- Create/update para autenticados.
- Delete: propio usuario o docente.

## `cursos`

Documento: `cursos/{courseId}`

Campos observados:
- `name: string`
- `code: string`
- `semester: string`
- `group: string`
- `credits: number`
- `teacherId: string`
- `teacherName: string`
- `description?: string`
- `status?: "active" | string`
- `enrolledStudents: string[]`
- `createdAt: timestamp|Date`

Relaciones:
- 1 curso -> N `gradeSheets`
- 1 curso -> N `assessments` / `evaluaciones`
- 1 curso -> N `grades` / `notas`
- 1 curso -> N `periods`, N `weeks`, N `course_files`
- 1 curso -> N `exerciseQuestions`, N `exerciseThemeLinks`, N `quizAttempts`
- 1 curso -> N `unidades` (y via estas: `semanas`, `diapositivas`)

Reglas:
- Read para autenticados.
- Create para autenticados.
- Update/delete: docente propietario o flujo controlado de autoinscripcion en `enrolledStudents`.

## `gradeSheets`

Documento: `gradeSheets/{sheetId}`

Campos observados:
- `title: string`
- `courseId: string`
- `courseName: string`
- `teacherId: string`
- `teacherName: string`
- `gradingPeriod: string`
- `activities: Activity[]`
- `students: StudentGrade[]`
- `isPublished: boolean`
- `description?: string`
- `weight?: number`
- `weightPercentage?: number`
- `createdAt: timestamp`
- `updatedAt: timestamp`

Estructura embebida:
- `activities[]`: `id`, `name`, `type`, `maxScore`, `description`, `percentage`, `weight`, `passingScore`, etc.
- `students[]`: `studentId`, `name`, `grades` (map por `activityId`), `total`, `status`.

Reglas:
- Read/write para autenticados.

## `assessments` (actual)

Documento: `assessments/{assessmentId}`

Campos observados:
- `courseId: string`
- `name: string`
- `type: "exam" | "quiz" | "homework" | "project" | "participation" | "forum"`
- `maxScore?: number`
- `weight?: number`
- `percentage: number`
- `dueDate?: timestamp|string`
- `description?: string`
- `maxPoints: number`
- `passingScore: number`
- `status: "draft" | "published" | "graded"`
- `createdBy: string`
- `gradeSheetId?: string`
- `assessmentType?: "announcement" | "delivery" | "assessment"`
- `deliveryType?: "text"`
- `startDate?: string`
- `createdAt: timestamp`
- `updatedAt: timestamp`

Reglas:
- Read/write para autenticados.

## `evaluaciones` (legado)

Documento: `evaluaciones/{assessmentId}`

Uso:
- Aun aparece en servicios legados y en backup/restore.
- Conceptualmente equivalente a `assessments`.

Reglas:
- Read/write para autenticados.

## `grades` (actual)

Documento: `grades/{gradeId}`

Campos observados:
- `assessmentId: string`
- `studentId: string`
- `courseId: string`
- `value: number`
- `comment?: string`
- `feedback?: string`
- `comments?: string`
- `submittedAt?: string`
- `gradedBy: string`
- `gradedAt: timestamp`
- `updatedAt?: timestamp`

Reglas:
- Read/write para autenticados.

## `notas` (legado)

Documento: `notas/{gradeId}`

Uso:
- Flujo legacy paralelo a `grades`.

Reglas:
- Read/write para autenticados.

## `submissions`

Documento: `submissions/{submissionId}`

Campos:
- `studentId: string`
- `assessmentId: string`
- `courseId: string`
- `content: string`
- `status: "draft" | "submitted" | "graded"`
- `grade?: number`
- `maxScore?: number`
- `feedback?: string`
- `wordCount: number`
- `characterCount: number`
- `metadata?: { attachments?, plagiarismScore?, similarityCheck?, lateSubmission?, lateMinutes? }`
- `submittedAt: timestamp`
- `updatedAt: timestamp`
- `gradedAt?: timestamp`
- `gradedBy?: string`
- `createdAt?: timestamp`

Reglas:
- Read para autenticados.
- Create para autenticados.
- Update/delete para autenticados.

## `assessmentForumComments`

Documento: `assessmentForumComments/{commentId}`

Campos:
- `assessmentId: string`
- `courseId: string`
- `userId: string`
- `userName: string`
- `userAvatarUrl?: string`
- `userAvatarEmoji?: string`
- `content: string`
- `parentCommentId?: string`
- `likedBy: string[]`
- `dislikedBy: string[]`
- `createdAt: timestamp`

Reglas:
- Read: solo quienes pueden acceder al curso.
- Create: estudiante/docente del curso y `userId == request.auth.uid`.
- Update: autor o docente del curso; reacciones permitidas de forma controlada.
- Delete: autor o docente del curso.

## `exerciseQuestions`

Documento: `exerciseQuestions/{questionId}`

Campos (validados estrictamente en reglas):
- `courseId: string`
- `theme: string`
- `question: string`
- `options: string[4]`
- `correctOptionIndex: 0..3`
- `isPublished: boolean`
- `createdBy: string`
- `createdAt: timestamp|Date`

Reglas:
- Read: acceso al curso.
- Create/update/delete: docente del curso (con validaciones de schema).

## `exerciseThemeLinks`

Documento: `exerciseThemeLinks/{linkId}`

Campos:
- `courseId: string`
- `theme: string`
- `gradeSheetId: string`
- `updatedBy: string`
- `updatedAt: timestamp`

Reglas:
- Read: acceso al curso.
- Create/update/delete: docente del curso.

## `quizAttempts`

Documento: `quizAttempts/{attemptId}`

Campos:
- `courseId: string`
- `theme: string`
- `studentId: string`
- `total: number`
- `correct: number`
- `percentage: number`
- `answers: { questionId, selectedOptionIndex, correctOptionIndex, isCorrect }[]`
- `createdAt: timestamp|Date`

Reglas:
- Read: acceso al curso.
- Create: solo estudiante autenticado del curso y sobre su propio `studentId`.
- Update: prohibido.
- Delete: docente del curso.

## `course_files`

Documento: `course_files/{fileId}`

Campos:
- `name: string`
- `url: string`
- `size: number`
- `type: string`
- `uploadedBy: string`
- `uploadedAt: timestamp|Date`
- `courseId: string`
- `description?: string`
- `storagePath: string`
- `periodId?: string|null`
- `weekId?: string|null`
- `order?: number`

Reglas:
- Read/create/update/delete para autenticados.

## `periods`

Documento: `periods/{periodId}`

Campos observados:
- `number: number`
- `name: string`
- `courseId: string`
- `teacherId?: string`
- `order: number`
- `createdAt: timestamp|Date`

Reglas:
- Read/create/update/delete para autenticados.

## `weeks` (modelo por periodos)

Documento: `weeks/{weekId}`

Campos observados:
- `number: number`
- `topic: string`
- `periodId: string`
- `courseId: string`
- `order: number`
- `createdAt: timestamp|Date`

Reglas:
- Read/create/update/delete para autenticados.

## `unidades` / `semanas` / `diapositivas` (modelo academico legacy)

`unidades/{unitId}`:
- `courseId: string`
- `name: string`
- `description?: string`
- `order: number`
- `createdAt: timestamp`

`semanas/{weekId}`:
- `unitId: string`
- `number: number`
- `topic: string`
- `createdAt: timestamp`

`diapositivas/{slideId}`:
- `weekId: string`
- `title: string`
- `description?: string`
- `canvaUrl: string`
- `order: number`
- `createdAt: timestamp`

Reglas:
- Read/write para autenticados.

## `courseBackups`

Documento: `courseBackups/{backupId}`

Campos:
- `teacherId: string`
- `teacherName: string`
- `courseId: string`
- `courseCode: string`
- `courseName: string`
- `exportedAt: string`
- `payload: CourseBackupPayload`
- `createdAt: timestamp`

`payload` incluye snapshots de:
- `course`
- `assessments`
- `gradeSheets`
- `periods`
- `weeks`
- `files`
- `exerciseQuestions`
- `exerciseThemeLinks`
- `units`
- `legacyAssessments`

Reglas:
- Read/create/delete: solo docente propietario (`teacherId == auth.uid`).
- Update: prohibido.

## 4) Relacionamiento principal

- `usuarios (1) -> (N) notifications`
- `usuarios (1) <-> (1) estudiantes` (en flujos normales comparten id)
- `cursos (1) -> (N) gradeSheets`
- `cursos (1) -> (N) assessments/evaluaciones`
- `assessments (1) -> (N) grades`
- `assessments (1) -> (N) submissions`
- `cursos (1) -> (N) periods -> (N) weeks -> (N) course_files`
- `cursos (1) -> (N) unidades -> (N) semanas -> (N) diapositivas`
- `cursos (1) -> (N) exerciseQuestions`
- `cursos (1) -> (N) exerciseThemeLinks`
- `cursos (1) -> (N) quizAttempts`
- `cursos (N) <-> (N) estudiantes` por arrays (`enrolledStudents`, `courses`)

## 5) Inconsistencias y legacy detectado

- Conviven colecciones duplicadas por idioma/version:
- `assessments` y `evaluaciones`
- `grades` y `notas`
- `weeks` y `semanas`
- `units` y `unidades` (en codigo legacy aparece `units`)
- En reglas existe `course_file` y `course_files`; la app usa `course_files`.
- Esto sugiere migraciones parciales. Conviene consolidar para evitar datos duplicados.

## 6) Seguridad (resumen)

- Regla base: todo denegado por defecto (`match /{document=**} allow read, write: if false`).
- Casi todas las colecciones abiertas a usuarios autenticados, salvo:
- Reglas estrictas en `exerciseQuestions`, `exerciseThemeLinks`, `quizAttempts`, `assessmentForumComments`, `courseBackups`, y subcoleccion `notifications`.

## 7) "Base de datos" local (cliente)

Claves de `localStorage` detectadas:
- `notifications:hubprefs:{userId}`
- `notifications:automations:{userId}`
- `courseBackups:autoLastRun:{teacherId}`
- Claves de historial/estado de notificaciones y quiz definidas en `NotificationsPage`, `Sidebar`, `ExerciseBankPage`, `NotificationContext`, `AcademicContext`.

Uso:
- Preferencias de notificaciones.
- Control de automatizaciones.
- Estado temporal de UI y ejecucion.

