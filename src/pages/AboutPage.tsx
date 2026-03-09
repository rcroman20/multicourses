import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Sparkles,
  UserRound,
  Users2,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

type AboutCopy = {
  badge: string;
  title: string;
  subtitle: string;
  back: string;
  creatorLabel: string;
  createdYearLabel: string;
  activeUsersLabel: string;
  usersUnavailable: string;
  teacherOps: string;
  platformArticle: string;
  differentiatorTitle: string;
  differentiatorParagraphs: string[];
  ctaTitle: string;
  ctaSubtitle: string;
  viewPlans: string;
  auth: string;
  footer: string;
};

const EN_COPY: AboutCopy = {
  badge: "About MultiCourses",
  title: "A platform built to run modern academic workflows",
  subtitle:
    "MultiCourses brings students, teachers, and admins together in one academic platform.",
  back: "Back to landing",
  creatorLabel: "Creator",
  createdYearLabel: "Created in",
  activeUsersLabel: "Active users",
  usersUnavailable: "Unavailable",
  teacherOps: "Platform operations article",
  platformArticle:
    "Teacher operations: Teachers can design courses, publish content, evaluate student performance, and manage classroom activity from a single workspace. Instead of switching between disconnected tools, they can follow a consistent operational flow that supports planning, grading, communication, and ongoing academic decision-making. Student experience: Students get a focused learning environment where each class has clear context, grades are easier to understand, and materials remain accessible when needed. Weekly visibility helps reduce missed deadlines and gives learners a practical way to stay organized across all active courses. Admin governance: Administrative teams can oversee the full teacher approval lifecycle, track rejected requests with reasons, monitor payment status, and enable or pause access with control. This governance layer helps institutions keep accountability high while preserving operational continuity and data safety.",
  differentiatorTitle: "What makes MultiCourses different",
  differentiatorParagraphs: [
    "MultiCourses gives institutions one shared workflow for students, teachers, and administrators, so daily academic operations no longer depend on disconnected apps, repeated data entry, or unclear handoffs between teams. From course setup to grading follow-up, every role works in the same environment with the same context, which improves communication, reduces avoidable mistakes, and keeps execution consistent across classrooms. Instead of spending time reconciling information between tools, teams can focus on teaching quality, student progress, and institutional outcomes.",
    "Teacher access is managed through a clear approval and payment validation flow before advanced tools are enabled, creating a transparent and reliable process for both educators and admin teams. Once active, institutions can monitor course activity, pending academic tasks, and performance signals from a single operational view, making it easier to detect issues early and act with confidence. This governance model helps schools maintain control without slowing down growth, while giving teachers and students a more predictable and trustworthy experience.",
    "Growth is structured through defined plans with a clear upgrade path, so organizations can expand courses and student capacity without rebuilding internal workflows each time demand increases. As usage evolves, institutions can scale in an orderly way, preserving process stability and staff productivity. When operational pauses are needed, access can be managed safely without deleting records, protecting academic history, audit continuity, and long-term institutional memory.",
  ],
  ctaTitle: "Ready to evaluate the platform?",
  ctaSubtitle:
    "Explore the annual plans, review the teacher approval flow, and start with the role that best matches your academic operation.",
  viewPlans: "View plans",
  auth: "Sign in / Register",
  footer: "Built for institutions, academies, and independent educators.",
};

const ES_COPY: AboutCopy = {
  badge: "Acerca de MultiCourses",
  title: "Una plataforma creada para flujos académicos modernos",
  subtitle:
    "MultiCourses conecta la experiencia del estudiante, la operación docente y la gobernanza administrativa en un solo sistema, para que las instituciones dejen de depender de herramientas aisladas y puedan ejecutar su operación académica con más claridad, control y consistencia.",
  back: "Volver al inicio",
  creatorLabel: "Creador",
  createdYearLabel: "Año de creación",
  activeUsersLabel: "Usuarios activos",
  usersUnavailable: "No disponible",
  teacherOps: "Artículo de operación de plataforma",
  platformArticle:
    "Operación docente: Los docentes pueden diseñar cursos, publicar contenido, evaluar el rendimiento estudiantil y gestionar la actividad del aula desde un único espacio de trabajo. En lugar de cambiar entre herramientas desconectadas, pueden seguir un flujo operativo coherente que respalda la planeación, la calificación, la comunicación y la toma de decisiones académicas continua. Experiencia del estudiante: Los estudiantes obtienen un entorno de aprendizaje enfocado donde cada clase tiene un contexto claro, las notas son más fáciles de entender y los materiales siguen accesibles cuando se necesitan. La visibilidad semanal ayuda a reducir entregas perdidas y ofrece una forma práctica de mantenerse organizados en todos los cursos activos. Gobernanza administrativa: Los equipos administrativos pueden supervisar el ciclo completo de aprobación docente, registrar rechazos con su motivo, monitorear el estado de pagos y habilitar o pausar accesos con control. Esta capa de gobernanza ayuda a mantener alta la trazabilidad y la responsabilidad institucional, al mismo tiempo que preserva la continuidad operativa y la seguridad de los datos.",
  differentiatorTitle: "Qué hace diferente a MultiCourses",
  differentiatorParagraphs: [
    "MultiCourses ofrece un flujo unificado para estudiantes, docentes y administradores, eliminando la dependencia de herramientas separadas y reduciendo la fricción operativa diaria. Con un solo entorno de trabajo, cada rol mantiene claridad sobre tareas, prioridades y seguimiento académico.",
    "El acceso docente se gestiona con aprobación y validación de pago antes de habilitar funciones avanzadas, lo que hace el proceso más transparente y controlado. Además, el equipo puede revisar actividad de cursos, avance académico y señales operativas desde un mismo panel para tomar decisiones con mayor rapidez.",
    "La capacidad crece por medio de planes definidos y una ruta de escalado clara, permitiendo aumentar cursos y estudiantes sin rehacer procesos internos. Cuando se requiere pausar acceso, la plataforma conserva los registros académicos y protege la continuidad institucional.",
  ],
  ctaTitle: "¿Listo para evaluar la plataforma?",
  ctaSubtitle:
    "Explora los planes anuales, revisa el flujo de aprobación docente y comienza con el rol que mejor se ajuste a tu operación académica.",
  viewPlans: "Ver planes",
  auth: "Iniciar sesión / Registro",
  footer: "Diseñado para instituciones, academias y docentes independientes.",
};

export default function AboutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSpanish = location.pathname === "/acerca-de";
  const copy = useMemo(() => (isSpanish ? ES_COPY : EN_COPY), [isSpanish]);
  const [studentCount, setStudentCount] = useState(0);
  const [teacherCount, setTeacherCount] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersLoadFailed, setUsersLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadUsageStats = async () => {
      setLoadingUsers(true);
      setUsersLoadFailed(false);
      try {
        const snap = await getDocs(collection(firebaseDB, "usuarios"));
        let nextStudents = 0;
        let nextTeachers = 0;

        snap.forEach((item) => {
          const role = String(item.data()?.role || "")
            .trim()
            .toLowerCase();
          if (role === "docente" || role === "teacher") {
            nextTeachers += 1;
            return;
          }
          if (role === "estudiante" || role === "student") {
            nextStudents += 1;
          }
        });

        if (cancelled) return;
        setStudentCount(nextStudents);
        setTeacherCount(nextTeachers);
      } catch {
        if (cancelled) return;
        setUsersLoadFailed(true);
      } finally {
        if (cancelled) return;
        setLoadingUsers(false);
      }
    };

    void loadUsageStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeUsersText = useMemo(() => {
    if (loadingUsers) return "...";
    if (usersLoadFailed) return copy.usersUnavailable;
    const total = studentCount + teacherCount;
    const locale = isSpanish ? "es-CO" : "en-US";
    return total.toLocaleString(locale);
  }, [copy.usersUnavailable, isSpanish, loadingUsers, studentCount, teacherCount, usersLoadFailed]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    {copy.badge}
                  </span>
                  <h1 className="mt-2 text-2xl font-bold text-slate-900">{copy.title}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{copy.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {copy.back}
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <UserRound className="h-4 w-4" />
                </span>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {copy.creatorLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Roberto Román</p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {copy.createdYearLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">2026</p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Users2 className="h-4 w-4" />
                </span>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {copy.activeUsersLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{activeUsersText}</p>
              </article>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{copy.teacherOps}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{copy.platformArticle}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{copy.differentiatorTitle}</p>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2.5">
                  {copy.differentiatorParagraphs.map((paragraph, index) => (
                    <p
                      key={`${copy.differentiatorTitle}-${index}`}
                      className="text-sm leading-relaxed text-slate-700"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Next step
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">{copy.ctaTitle}</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{copy.ctaSubtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/plans/starter-annual")}
                    className="inline-flex h-10 items-center rounded-xl border border-sky-300 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    {copy.viewPlans}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {copy.auth}
                  </button>
                </div>
              </div>
              <p className="relative mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Users2 className="h-3.5 w-3.5" />
                {copy.footer}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
