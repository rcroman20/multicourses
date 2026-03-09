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
} from "lucide-react";
import {
  submitContactMessage,
  type ContactMessageRole,
} from "@/lib/services/contactMessageService";

const SUPPORT_EMAIL = "rcroman20@gmail.com";
const inputClassName =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

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
                    Contact Workspace
                  </span>
                  <h1 className="mt-2 text-2xl font-bold text-slate-900">Talk to the MultiCourses team</h1>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Send your request and it will appear directly in the admin panel for follow-up.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to landing
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Contact form</p>
                <p className="mt-1 text-xs text-slate-500">
                  Include as much detail as possible so the admin team can respond faster.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Full name"
                    className={inputClassName}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    className={inputClassName}
                  />
                  <input
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Phone (optional)"
                    className={inputClassName}
                  />
                  <input
                    type="text"
                    value={institution}
                    onChange={(event) => setInstitution(event.target.value)}
                    placeholder="Institution / Organization (optional)"
                    className={inputClassName}
                  />
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as ContactMessageRole)}
                    className={inputClassName}
                  >
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                    <option value="admin">Admin</option>
                    <option value="organization">Organization</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject"
                    className={inputClassName}
                  />
                </div>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="Write your message..."
                  className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Sending..." : "Send message"}
                </button>
              </article>

              <aside className="space-y-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Mail className="h-4 w-4 text-sky-700" />
                    Primary channel
                  </p>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=MultiCourses%20Support`}
                    className="mt-2 inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Clock3 className="h-4 w-4 text-amber-700" />
                    Response targets
                  </p>
                  <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Starter plan: up to 48h
                    </p>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Growth / Scale plan: up to 24h
                    </p>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Need immediate next step?
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigate("/auth")}
                      className="inline-flex h-10 items-center rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700"
                    >
                      Open auth
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/about")}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      About platform
                    </button>
                  </div>
                </article>
              </aside>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MessageSquare className="h-4 w-4 text-indigo-700" />
                What we can help you with
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {[
                  "Teacher request status, rejection reason, and reapply process",
                  "Payment pending flow and payment instructions",
                  "Plan recommendation based on courses and students",
                  "Account access issues and role activation",
                  "Technical errors in courses, grades, or dashboards",
                  "Institution onboarding and configuration guidance",
                ].map((item) => (
                  <p key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
