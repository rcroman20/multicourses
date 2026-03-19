import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
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
import { SeoHead } from "@/components/common/SeoHead";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";
import {
  DEFAULT_PLATFORM_NAME,
  resolvePlatformSiteUrl,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

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

type SnapshotCard = {
  label: string;
  value: string;
};

const EN_COPY: AboutCopy = {
  badge: "About {{platformName}}",
  title: "A platform built to run modern academic workflows",
  subtitle:
    "{{platformName}} brings students, teachers, and admins together in one academic platform.",
  back: "Back to landing",
  creatorLabel: "Creator",
  createdYearLabel: "Created in",
  activeUsersLabel: "Active users",
  usersUnavailable: "Unavailable",
  teacherOps: "Platform operations article",
  platformArticle:
    "Teacher operations: Teachers can design courses, publish content, evaluate student performance, and manage classroom activity from a single workspace. Instead of switching between disconnected tools, they can follow a consistent operational flow that supports planning, grading, communication, and ongoing academic decision-making. Student experience: Students get a focused learning environment where each class has clear context, grades are easier to understand, and materials remain accessible when needed. Weekly visibility helps reduce missed deadlines and gives learners a practical way to stay organized across all active courses. Admin governance: Administrative teams can oversee the full teacher approval lifecycle, track rejected requests with reasons, monitor payment status, and enable or pause access with control. This governance layer helps institutions keep accountability high while preserving operational continuity and data safety.",
  differentiatorTitle: "What makes {{platformName}} different",
  differentiatorParagraphs: [
    "{{platformName}} gives institutions one shared workflow for students, teachers, and administrators, so daily academic operations no longer depend on disconnected apps, repeated data entry, or unclear handoffs between teams. From course setup to grading follow-up, every role works in the same environment with the same context, which improves communication, reduces avoidable mistakes, and keeps execution consistent across classrooms. Instead of spending time reconciling information between tools, teams can focus on teaching quality, student progress, and institutional outcomes.",
    "Teacher access is managed through a clear approval and payment validation flow before advanced tools are enabled, creating a transparent and reliable process for both educators and admin teams. Once active, institutions can monitor course activity, pending academic tasks, and performance signals from a single operational view, making it easier to detect issues early and act with confidence. This governance model helps schools maintain control without slowing down growth, while giving teachers and students a more predictable and trustworthy experience.",
    "Growth is structured through defined plans with a clear upgrade path, so organizations can expand courses and student capacity without rebuilding internal workflows each time demand increases. As usage evolves, institutions can scale in an orderly way, preserving process stability and staff productivity. When operational pauses are needed, access can be managed safely without deleting records, protecting academic history, audit continuity, and long-term institutional memory.",
  ],
  missionTitle: "Our Mission",
  missionText:
    "To unify academic operations by providing a single, coherent platform where students learn, teachers teach, and administrators govern with clarity and control.",
  visionTitle: "Our Vision",
  visionText:
    "A world where every educational institution can operate with the same efficiency, transparency, and scalability as the best-run organizations, regardless of size or resources.",
  valuesTitle: "Our Core Values",
  values: [
    {
      title: "Clarity First",
      description:
        "Every interaction should reduce confusion, not add to it. We build for clear communication and intuitive workflows.",
    },
    {
      title: "Sustainable Growth",
      description:
        "We help institutions scale without breaking their processes, preserving what works while enabling what's next.",
    },
    {
      title: "Trust Through Transparency",
      description:
        "From teacher approvals to student grades, every action is traceable and accountable.",
    },
    {
      title: "Continuous Evolution",
      description:
        "Education changes, and so do we. Our platform evolves with the needs of modern academic institutions.",
    },
  ],
  ctaTitle: "Ready to evaluate the platform?",
  ctaSubtitle:
    "Explore the annual plans, review the teacher approval flow, and start with the role that best matches your academic operation.",
  viewPlans: "View plans",
  auth: "Sign in / Register",
  footer: "Built for institutions, academies, and independent educators.",
};

const ES_COPY: AboutCopy = {
  badge: "Acerca de {{platformName}}",
  title: "Una plataforma creada para flujos académicos modernos",
  subtitle:
    "{{platformName}} conecta la experiencia del estudiante, la operación docente y la gobernanza administrativa en un solo sistema, para que las instituciones dejen de depender de herramientas aisladas y puedan ejecutar su operación académica con más claridad, control y consistencia.",
  back: "Volver al inicio",
  creatorLabel: "Creador",
  createdYearLabel: "Año de creación",
  activeUsersLabel: "Usuarios activos",
  usersUnavailable: "No disponible",
  teacherOps: "Artículo de operación de plataforma",
  platformArticle:
    "Operación docente: Los docentes pueden diseñar cursos, publicar contenido, evaluar el rendimiento estudiantil y gestionar la actividad del aula desde un único espacio de trabajo. En lugar de cambiar entre herramientas desconectadas, pueden seguir un flujo operativo coherente que respalda la planeación, la calificación, la comunicación y la toma de decisiones académicas continua. Experiencia del estudiante: Los estudiantes obtienen un entorno de aprendizaje enfocado donde cada clase tiene un contexto claro, las notas son más fáciles de entender y los materiales siguen accesibles cuando se necesitan. La visibilidad semanal ayuda a reducir entregas perdidas y ofrece una forma práctica de mantenerse organizados en todos los cursos activos. Gobernanza administrativa: Los equipos administrativos pueden supervisar el ciclo completo de aprobación docente, registrar rechazos con su motivo, monitorear el estado de pagos y habilitar o pausar accesos con control. Esta capa de gobernanza ayuda a mantener alta la trazabilidad y la responsabilidad institucional, al mismo tiempo que preserva la continuidad operativa y la seguridad de los datos.",
  differentiatorTitle: "Qué hace diferente a {{platformName}}",
  differentiatorParagraphs: [
    "{{platformName}} ofrece un flujo unificado para estudiantes, docentes y administradores, eliminando la dependencia de herramientas separadas y reduciendo la fricción operativa diaria. Con un solo entorno de trabajo, cada rol mantiene claridad sobre tareas, prioridades y seguimiento académico.",
    "El acceso docente se gestiona con aprobación y validación de pago antes de habilitar funciones avanzadas, lo que hace el proceso más transparente y controlado. Además, el equipo puede revisar actividad de cursos, avance académico y señales operativas desde un mismo panel para tomar decisiones con mayor rapidez.",
    "La capacidad crece por medio de planes definidos y una ruta de escalado clara, permitiendo aumentar cursos y estudiantes sin rehacer procesos internos. Cuando se requiere pausar acceso, la plataforma conserva los registros académicos y protege la continuidad institucional.",
  ],
  missionTitle: "Nuestra Misión",
  missionText:
    "Unificar las operaciones académicas proporcionando una plataforma única y coherente donde los estudiantes aprenden, los docentes enseñan y los administradores gobiernan con claridad y control.",
  visionTitle: "Nuestra Visión",
  visionText:
    "Un mundo donde cada institución educativa pueda operar con la misma eficiencia, transparencia y escalabilidad que las organizaciones mejor gestionadas, independientemente de su tamaño o recursos.",
  valuesTitle: "Nuestros Valores",
  values: [
    {
      title: "Claridad Primero",
      description:
        "Cada interacción debe reducir la confusión, no aumentarla. Construimos para una comunicación clara y flujos de trabajo intuitivos.",
    },
    {
      title: "Crecimiento Sostenible",
      description:
        "Ayudamos a las instituciones a escalar sin romper sus procesos, preservando lo que funciona mientras habilitamos lo que viene.",
    },
    {
      title: "Confianza a través de la Transparencia",
      description:
        "Desde aprobaciones docentes hasta calificaciones de estudiantes, cada acción es trazable y responsable.",
    },
    {
      title: "Evolución Continua",
      description:
        "La educación cambia, y nosotros también. Nuestra plataforma evoluciona con las necesidades de las instituciones académicas modernas.",
    },
  ],
  ctaTitle: "¿Listo para evaluar la plataforma?",
  ctaSubtitle:
    "Explora los planes anuales, revisa el flujo de aprobación docente y comienza con el rol que mejor se ajuste a tu operación académica.",
  viewPlans: "Ver planes",
  auth: "Iniciar sesión / Registro",
  footer: "Diseñado para instituciones, academias y docentes independientes.",
};

const replaceBrandInString = (value: string, platformName: string): string =>
  value.replace(/Socrattica|\{\{platformName\}\}/g, platformName);

function replaceBrandInValue<T>(value: T, platformName: string): T {
  if (typeof value === "string") {
    return replaceBrandInString(value, platformName) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceBrandInValue(item, platformName)) as T;
  }
  if (value && typeof value === "object") {
    const mapped = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [
          key,
          replaceBrandInValue(nestedValue, platformName),
        ],
      ),
    );
    return mapped as T;
  }
  return value;
}

const dashboardShellClassName =
  "rounded-2xl border border-slate-200/60 bg-white p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6";
const panelSectionClassName =
  "mb-10 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-5 shadow-sm lg:p-6";
const workspacePanelClassName =
  "rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm";
const compactMetricCardClassName =
  "rounded-xl border border-slate-200/60 bg-white px-4 py-2 shadow-sm";
const statPillClassName =
  "rounded-full border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-600";

export default function AboutPage() {
  const { settings, isLoading: isSettingsLoading } = useAdminPlatformSettings();
  const platformName =
    String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const siteUrl = resolvePlatformSiteUrl(settings.siteUrl);
  const navigate = useNavigate();
  const location = useLocation();
  const isSpanish = location.pathname === "/acerca-de";
  const copy = useMemo(
    () => replaceBrandInValue(isSpanish ? ES_COPY : EN_COPY, platformName),
    [isSpanish, platformName],
  );
  const publicActiveUsersCount = Math.max(
    0,
    Math.floor(Number(settings.publicActiveUsersCount) || 0),
  );

  const activeUsersText = useMemo(() => {
    if (isSettingsLoading && publicActiveUsersCount === 0) return "...";
    const locale = isSpanish ? "es-CO" : "en-US";
    return publicActiveUsersCount.toLocaleString(locale);
  }, [isSettingsLoading, isSpanish, publicActiveUsersCount]);

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
      description:
        "Design, publish, evaluate, and manage classes from one workspace.",
      color: "bg-sky-100 text-sky-700",
    },
    {
      icon: BookOpen,
      title: "For Students",
      description:
        "Learn with clear context, simple grade tracking, and organized materials.",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      icon: ShieldCheck,
      title: "For Administrators",
      description:
        "Manage approvals, payments, and institutional control with traceability.",
      color: "bg-indigo-100 text-indigo-700",
    },
  ];

  const heroSnapshotCards = useMemo<SnapshotCard[]>(
    () => [
      { label: copy.creatorLabel, value: "Roberto Román" },
      { label: copy.createdYearLabel, value: "2026" },
      { label: copy.activeUsersLabel, value: activeUsersText },
      {
        label: isSpanish ? "Espacios" : "Workspaces",
        value: isSpanish ? "3 roles conectados" : "3 connected roles",
      },
    ],
    [
      activeUsersText,
      copy.activeUsersLabel,
      copy.createdYearLabel,
      copy.creatorLabel,
      isSpanish,
    ],
  );

  const articleSectionTitle = isSpanish
    ? `Como ${platformName} organiza la operación académica`
    : `How ${platformName} organizes academic operations`;
  const articleSectionSubtitle = isSpanish
    ? "Una sola operación compartida para docentes, estudiantes y administración."
    : "One shared operating model for teachers, students, and administration.";
  const rolesSectionTitle = isSpanish
    ? "Diseñado para cada rol educativo"
    : "Built for every role in education";
  const rolesSectionSubtitle = isSpanish
    ? "Cada espacio responde a una responsabilidad distinta dentro del mismo sistema."
    : "Each workspace is tuned to a different responsibility inside the same system.";
  const missionSectionTitle = isSpanish
    ? "Misión y visión"
    : "Mission and vision";
  const missionSectionSubtitle = isSpanish
    ? "La plataforma está diseñada para claridad operativa, confianza y escala sostenible."
    : "The platform is designed for operational clarity, trust, and sustainable scale.";
  const valuesSectionSubtitle = isSpanish
    ? "Principios que guían cómo diseñamos la experiencia académica."
    : "Principles that guide how we design the academic experience.";
  const differentiatorSectionSubtitle = isSpanish
    ? "La diferencia está en cómo conecta flujos, gobierno y crecimiento."
    : "The difference is in how it connects workflows, governance, and growth.";
  const heroPanelTitle = isSpanish
    ? "Resumen operativo"
    : "Operational snapshot";
  const heroPanelBadge = isSpanish ? "Visión general" : "Overview";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-2 sm:px-6 lg:px-8">
      <SeoHead
        title={copy.badge}
        description={
          isSpanish
            ? `Conoce ${platformName}, la plataforma académica que unifica operación docente, experiencia estudiantil y gobernanza administrativa.`
            : `Learn how ${platformName} unifies teacher operations, student experience, and administrative governance in one academic platform.`
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
          name: copy.badge,
          url: `${siteUrl}${isSpanish ? "/acerca-de" : "/about"}`,
          description: isSpanish
            ? `Página institucional de ${platformName} con misión, visión y propuesta de valor.`
            : `Official ${platformName} about page with mission, vision, and platform value proposition.`,
          mainEntity: {
            "@type": "Organization",
            name: platformName,
            url: `${siteUrl}/`,
          },
        }}
      />
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-100/50 blur-[80px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-[80px]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-100/30 blur-[100px]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px]">
        <PublicTopNav
          activeKey="about"
          aboutHref={isSpanish ? "/acerca-de" : "/about"}
          aboutLabel={isSpanish ? "Acerca de" : "About"}
        />
        <div className={dashboardShellClassName}>
          {/* Hero Section */}
          <section className="relative mb-10 overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50/70 p-5 shadow-sm lg:p-6">
            <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-44 w-44 rounded-full bg-indigo-200/20" />
            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] lg:items-start">
              <div>
                <span className={statPillClassName}>{copy.badge}</span>
                <h1 className="mt-3 max-w-[14ch] text-2xl font-extrabold leading-[0.98] tracking-tight text-slate-900 sm:max-w-[15ch] lg:max-w-[16ch] lg:text-[2.8rem]">
                  {copy.title}
                </h1>
                <p className="mt-2 max-w-[38rem] text-sm leading-6 text-slate-600 sm:text-base">
                  {copy.subtitle}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate("/plans/starter-annual")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-sky-700"
                  >
                    {copy.viewPlans}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {copy.auth}
                  </button>
                </div>
              </div>

              <div className="space-y-3 lg:pl-2">
                <div className="grid grid-cols-2 gap-3">
                  {heroSnapshotCards.map((snapshot) => (
                    <div
                      key={snapshot.label}
                      className={compactMetricCardClassName}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {snapshot.label}
                      </p>
                      <p className="mt-1 text-base font-extrabold leading-snug text-slate-900 sm:text-lg">
                        {snapshot.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className={`${workspacePanelClassName} overflow-hidden`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {heroPanelTitle}
                    </p>
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {heroPanelBadge}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {roleCards.map((role) => {
                      const Icon = role.icon;
                      return (
                        <div
                          key={`hero-${role.title}`}
                          className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2"
                        >
                          <div
                            className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full ${role.color}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {role.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              {role.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Platform Operations - Main Article */}
          <section className={panelSectionClassName}>
            <div className="mb-6 text-center">
              <div className="flex justify-center">
                <span
                  className={`${statPillClassName} inline-flex items-center gap-2`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {copy.teacherOps}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {articleSectionTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {articleSectionSubtitle}
              </p>
            </div>

            <div className={workspacePanelClassName}>
              <p className="text-sm leading-7 text-slate-700">
                {copy.platformArticle}
              </p>
            </div>
          </section>

          {/* Role Cards */}
          <section className={panelSectionClassName}>
            <div className="mb-6 text-center">
              <div className="flex justify-center">
                <span
                  className={`${statPillClassName} inline-flex items-center gap-2`}
                >
                  <Users2 className="h-3.5 w-3.5" />
                  {isSpanish ? "Roles" : "Roles"}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {rolesSectionTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {rolesSectionSubtitle}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {roleCards.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-3 flex justify-center">
                      <div
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${role.color}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mb-2 text-center text-sm font-semibold text-slate-900">
                      {role.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-600">
                      {role.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Mission & Vision */}
          <section className={panelSectionClassName}>
            <div className="mb-6 text-center">
              <div className="flex justify-center">
                <span
                  className={`${statPillClassName} inline-flex items-center gap-2`}
                >
                  <Target className="h-3.5 w-3.5" />
                  {isSpanish ? "Dirección" : "Direction"}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {missionSectionTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {missionSectionSubtitle}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-sky-50 to-white p-5 text-center shadow-sm lg:p-6">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm">
                  <Target className="h-4 w-4" />
                </div>
                <h2 className="mb-2 text-base font-extrabold text-slate-900">
                  {copy.missionTitle}
                </h2>
                <p className="text-sm leading-6 text-slate-700">
                  {copy.missionText}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-emerald-50 to-white p-5 text-center shadow-sm lg:p-6">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                  <Globe className="h-4 w-4" />
                </div>
                <h2 className="mb-2 text-base font-extrabold text-slate-900">
                  {copy.visionTitle}
                </h2>
                <p className="text-sm leading-6 text-slate-700">
                  {copy.visionText}
                </p>
              </div>
            </div>
          </section>

          {/* Core Values */}
          <section className={panelSectionClassName}>
            <div className="mb-6 text-center">
              <div className="flex justify-center">
                <span
                  className={`${statPillClassName} inline-flex items-center gap-2`}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  {isSpanish ? "Valores" : "Values"}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {copy.valuesTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {valuesSectionSubtitle}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {copy.values.map((value, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-slate-300/60 hover:bg-slate-50"
                >
                  <div className="mb-3 flex justify-center">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                      <CheckCircle2 className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                  <h3 className="mb-2 text-center text-sm font-semibold text-slate-900">
                    {value.title}
                  </h3>
                  <p className="text-sm leading-6 text-slate-600">
                    {value.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Differentiator Section */}
          <section className={panelSectionClassName}>
            <div className="mb-6 text-center">
              <div className="flex justify-center">
                <span
                  className={`${statPillClassName} inline-flex items-center gap-2`}
                >
                  <Award className="h-3.5 w-3.5" />
                  {isSpanish ? "Diferencial" : "Differentiator"}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {copy.differentiatorTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {differentiatorSectionSubtitle}
              </p>
            </div>

            <div className="space-y-3">
              {copy.differentiatorParagraphs.map((paragraph, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm leading-7 text-slate-700">
                    {paragraph}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-5 text-white shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />

            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
              <div>
                <Rocket className="mb-3 h-5 w-5 text-white/90" />
                <h2 className="mb-2 text-lg font-extrabold sm:text-2xl">
                  {copy.ctaTitle}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-white/90">
                  {copy.ctaSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 lg:justify-end">
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

          <PublicFooter summary={copy.footer} />
        </div>
      </div>
    </div>
  );
}
