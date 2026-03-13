import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Sparkles,
  UserRound,
  Users2,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Target,
  Award,
  Globe,
  Lightbulb,
  Rocket,
  CheckCircle2,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { SeoHead } from "@/components/common/SeoHead";

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
  missionTitle: string;
  missionText: string;
  visionTitle: string;
  visionText: string;
  valuesTitle: string;
  values: Array<{ title: string; description: string }>;
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
  missionTitle: "Our Mission",
  missionText: "To unify academic operations by providing a single, coherent platform where students learn, teachers teach, and administrators govern with clarity and control.",
  visionTitle: "Our Vision",
  visionText: "A world where every educational institution can operate with the same efficiency, transparency, and scalability as the best-run organizations, regardless of size or resources.",
  valuesTitle: "Our Core Values",
  values: [
    {
      title: "Clarity First",
      description: "Every interaction should reduce confusion, not add to it. We build for clear communication and intuitive workflows."
    },
    {
      title: "Sustainable Growth",
      description: "We help institutions scale without breaking their processes, preserving what works while enabling what's next."
    },
    {
      title: "Trust Through Transparency",
      description: "From teacher approvals to student grades, every action is traceable and accountable."
    },
    {
      title: "Continuous Evolution",
      description: "Education changes, and so do we. Our platform evolves with the needs of modern academic institutions."
    }
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
  missionTitle: "Nuestra Misión",
  missionText: "Unificar las operaciones académicas proporcionando una plataforma única y coherente donde los estudiantes aprenden, los docentes enseñan y los administradores gobiernan con claridad y control.",
  visionTitle: "Nuestra Visión",
  visionText: "Un mundo donde cada institución educativa pueda operar con la misma eficiencia, transparencia y escalabilidad que las organizaciones mejor gestionadas, independientemente de su tamaño o recursos.",
  valuesTitle: "Nuestros Valores",
  values: [
    {
      title: "Claridad Primero",
      description: "Cada interacción debe reducir la confusión, no aumentarla. Construimos para una comunicación clara y flujos de trabajo intuitivos."
    },
    {
      title: "Crecimiento Sostenible",
      description: "Ayudamos a las instituciones a escalar sin romper sus procesos, preservando lo que funciona mientras habilitamos lo que viene."
    },
    {
      title: "Confianza a través de la Transparencia",
      description: "Desde aprobaciones docentes hasta calificaciones de estudiantes, cada acción es trazable y responsable."
    },
    {
      title: "Evolución Continua",
      description: "La educación cambia, y nosotros también. Nuestra plataforma evoluciona con las necesidades de las instituciones académicas modernas."
    }
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

  const statCards = [
    {
      icon: UserRound,
      label: copy.creatorLabel,
      value: "Roberto Román",
      color: "bg-amber-100 text-amber-700",
    },
    {
      icon: CalendarDays,
      label: copy.createdYearLabel,
      value: "2026",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      icon: Users2,
      label: copy.activeUsersLabel,
      value: activeUsersText,
      color: "bg-indigo-100 text-indigo-700",
    },
  ];

  const roleCards = [
    {
      icon: GraduationCap,
      title: "For Teachers",
      description: "Design courses, publish content, evaluate performance, and manage classrooms from a single workspace.",
      color: "bg-sky-100 text-sky-700",
    },
    {
      icon: BookOpen,
      title: "For Students",
      description: "Access focused learning environments with clear context, easy grade tracking, and organized materials.",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      icon: ShieldCheck,
      title: "For Administrators",
      description: "Oversee teacher approvals, monitor payment status, and maintain institutional control with full traceability.",
      color: "bg-indigo-100 text-indigo-700",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50">
      <SeoHead
        title={isSpanish ? "Acerca de MultiCourses" : "About MultiCourses"}
        description={
          isSpanish
            ? "Conoce MultiCourses, la plataforma académica que unifica operación docente, experiencia estudiantil y gobernanza administrativa."
            : "Learn how MultiCourses unifies teacher operations, student experience, and administrative governance in one academic platform."
        }
        canonicalPath={isSpanish ? "/acerca-de" : "/about"}
        robots={isSpanish ? "noindex, follow" : "index, follow"}
        keywords={
          isSpanish
            ? "plataforma académica, operación docente, gobernanza educativa, LMS Colombia"
            : "academic platform, teacher operations, education governance, LMS"
        }
        structuredData={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: isSpanish ? "Acerca de MultiCourses" : "About MultiCourses",
          url: `https://multicourses.web.app${isSpanish ? "/acerca-de" : "/about"}`,
          description: isSpanish
            ? "Página institucional de MultiCourses con misión, visión y propuesta de valor."
            : "Official MultiCourses about page with mission, vision, and platform value proposition.",
          mainEntity: {
            "@type": "Organization",
            name: "MultiCourses",
            url: "https://multicourses.web.app/",
          },
        }}
      />
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-100/50 blur-[80px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-[80px]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-100/30 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8">
        {/* Navigation */}
        <nav className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 backdrop-blur-sm transition hover:bg-white hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-sky-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              {copy.badge}
            </span>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="max-w-2xl">
            <h1 className="mb-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {copy.title}
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              {copy.subtitle}
            </p>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="mb-8">
          <div className="grid gap-4 md:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${stat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Platform Operations - Main Article */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-4">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
              {copy.teacherOps}
            </span>
          </div>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-sm leading-relaxed text-slate-700">
              {copy.platformArticle}
            </p>
          </div>
        </section>

        {/* Role Cards */}
        <section className="mb-8">
          <div className="mb-4 text-center">
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Built for every role in education
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              A unified platform that adapts to your needs
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {roleCards.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${role.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1 text-base font-semibold text-slate-900">{role.title}</h3>
                  <p className="text-sm text-slate-600">{role.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm lg:p-6">
            <Target className="mb-3 h-6 w-6 text-sky-600" />
            <h2 className="mb-2 text-lg font-bold text-slate-900">{copy.missionTitle}</h2>
            <p className="text-sm leading-relaxed text-slate-700">{copy.missionText}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm lg:p-6">
            <Globe className="mb-3 h-6 w-6 text-emerald-600" />
            <h2 className="mb-2 text-lg font-bold text-slate-900">{copy.visionTitle}</h2>
            <p className="text-sm leading-relaxed text-slate-700">{copy.visionText}</p>
          </div>
        </section>

        {/* Core Values */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-6 text-center">
            <Lightbulb className="mx-auto mb-3 h-6 w-6 text-amber-600" />
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{copy.valuesTitle}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {copy.values.map((value, index) => (
              <div key={index} className="text-center">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">{value.title}</h3>
                <p className="text-sm text-slate-600">{value.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Differentiator Section */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm lg:p-6">
          <div className="mb-4 text-center">
            <Award className="mx-auto mb-3 h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{copy.differentiatorTitle}</h2>
          </div>

          <div className="space-y-3">
            {copy.differentiatorParagraphs.map((paragraph, index) => (
              <div
                key={index}
                className="rounded-xl border border-indigo-100 bg-white/80 p-4 backdrop-blur-sm"
              >
                <p className="text-sm leading-relaxed text-slate-700">{paragraph}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-5 text-white shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
          
          <div className="relative">
            <Rocket className="mb-3 h-6 w-6 text-white/90" />
            <h2 className="mb-2 text-xl font-bold sm:text-2xl">{copy.ctaTitle}</h2>
            <p className="mb-5 max-w-2xl text-sm text-white/90">{copy.ctaSubtitle}</p>
            
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => navigate("/plans/starter-annual")}
                className="inline-flex h-10 items-center rounded-xl bg-white px-5 text-sm font-semibold text-sky-600 transition hover:bg-slate-100"
              >
                {copy.viewPlans}
              </button>
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="inline-flex h-10 items-center rounded-xl border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                {copy.auth}
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 flex items-center justify-center border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p className="inline-flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            {copy.footer}
          </p>
        </footer>
      </div>
    </div>
  );
}
