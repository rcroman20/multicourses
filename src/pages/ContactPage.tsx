import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock3,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Headphones,
  Send,
  CheckCircle2,
  HelpCircle,
  Users,
  Briefcase,
  GraduationCap,
  Building2,
} from "lucide-react";
import {
  submitContactMessage,
  type ContactMessageRole,
} from "@/lib/services/contactMessageService";
import { SeoHead } from "@/components/common/SeoHead";

const SUPPORT_EMAIL = "rcroman20@gmail.com";
const inputClassName =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export default function ContactPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState<ContactMessageRole>("teacher");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitContactMessage({
        name,
        email,
        phone,
        institution,
        role,
        subject,
        message,
      });
      toast.success("Message sent. Our team will contact you soon.");
      setName("");
      setEmail("");
      setPhone("");
      setInstitution("");
      setRole("teacher");
      setSubject("");
      setMessage("");
    } catch (error: unknown) {
      const reason =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Could not send your message right now.";
      toast.error(reason);
    } finally {
      setSubmitting(false);
    }
  };

  const helpTopics = [
    {
      icon: GraduationCap,
      title: "Teacher requests",
      description: "Status, rejection reasons, and reapply process",
    },
    {
      icon: ShieldCheck,
      title: "Payments",
      description: "Pending flow and payment instructions",
    },
    {
      icon: Briefcase,
      title: "Plan recommendations",
      description: "Based on your courses and students",
    },
    {
      icon: Users,
      title: "Account access",
      description: "Issues and role activation",
    },
    {
      icon: HelpCircle,
      title: "Technical support",
      description: "Errors in courses, grades, or dashboards",
    },
    {
      icon: Building2,
      title: "Institution onboarding",
      description: "Configuration guidance",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50">
      <SeoHead
        title="Contact MultiCourses"
        description="Contact the MultiCourses team for teacher requests, payment questions, plan recommendations, technical support, and institution onboarding."
        canonicalPath="/contact"
        keywords="contact MultiCourses, teacher approval support, education platform support, institution onboarding"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact MultiCourses",
          url: "https://multicourses.web.app/contact",
          description:
            "Contact page for MultiCourses support, teacher approvals, payments, and institutional onboarding.",
          mainEntity: {
            "@type": "Organization",
            name: "MultiCourses",
            email: SUPPORT_EMAIL,
            url: "https://multicourses.web.app/",
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "customer support",
              email: SUPPORT_EMAIL,
              availableLanguage: ["en", "es"],
            },
          },
        }}
      />
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-100/50 blur-[80px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-100/50 blur-[80px]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-100/30 blur-[100px]" />
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
            Back to landing
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-sky-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Contact MultiCourses
            </span>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100">
              <Headphones className="h-5 w-5 text-sky-700" />
            </div>
            <h1 className="mb-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Talk to the MultiCourses team
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Send your request directly to our admin panel for quick follow-up. 
              We're here to help with any questions about our platform.
            </p>
          </div>
        </section>

        {/* Main Content Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Contact Form - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-slate-900">Send us a message</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Include as much detail as possible so our team can respond faster.
                </p>
              </div>

              <div className="space-y-4">
                {/* Personal Information */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Full name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="John Doe"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="john@example.com"
                      className={inputClassName}
                    />
                  </div>
                </div>

                {/* Contact Details */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Phone (optional)
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+57 300 123 4567"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Institution (optional)
                    </label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(event) => setInstitution(event.target.value)}
                      placeholder="Your school or organization"
                      className={inputClassName}
                    />
                  </div>
                </div>

                {/* Role and Subject */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      I am a <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value as ContactMessageRole)}
                      className={inputClassName}
                    >
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                      <option value="admin">Administrator</option>
                      <option value="organization">Organization</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="What is this about?"
                      className={inputClassName}
                    />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={6}
                    placeholder="Please describe your question or issue in detail..."
                    className="w-full resize-none rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !name || !email || !subject || !message}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      "Sending..."
                    ) : (
                      <>
                        Send message
                        <Send className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - Takes 1 column on large screens */}
          <div className="space-y-4">
            {/* Direct Email Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100">
                <Mail className="h-4 w-4 text-sky-700" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-slate-900">Email us directly</h3>
              <p className="mb-4 text-sm text-slate-600">
                Prefer email? You can reach us directly at:
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=MultiCourses%20Support`}
                className="inline-flex items-center rounded-lg bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            {/* Response Times Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Clock3 className="h-4 w-4 text-amber-700" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-slate-900">Response times</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-600">Starter plan</span>
                  <span className="text-sm font-semibold text-slate-900">Up to 48h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Growth / Scale</span>
                  <span className="text-sm font-semibold text-slate-900">Up to 24h</span>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-slate-900">Need immediate help?</h3>
              <p className="mb-4 text-sm text-slate-600">
                Try these quick options while you wait for a response.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="w-full rounded-lg bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign in to your account
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/about")}
                  className="w-full rounded-lg bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Learn about the platform
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/plans/starter-annual")}
                  className="w-full rounded-lg bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  View our plans
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Help Topics Section */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-5 text-center">
            <MessageSquare className="mx-auto mb-3 h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">What we can help you with</h2>
            <p className="mt-1 text-sm text-slate-600">
              Common topics our support team handles every day
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {helpTopics.map((topic, index) => {
              const Icon = topic.icon;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 transition hover:border-slate-200 hover:bg-white"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                    <Icon className="h-4 w-4 text-indigo-700" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{topic.title}</h3>
                    <p className="text-sm text-slate-600">{topic.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trust Indicators */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-5">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>All messages go to admin panel</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>Responses within 24-48 hours</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>No spam, ever</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} MultiCourses. We're here to help.</p>
        </footer>
      </div>
    </div>
  );
}
