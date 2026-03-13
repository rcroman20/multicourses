import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth, type UserPreferences } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  AlertTriangle,
  Award,
  Bell,
  Calendar,
  Camera,
  Check,
  Clock3,
  Edit3,
  Globe,
  Image as ImageIcon,
  Info,
  Instagram,
  LayoutPanelLeft,
  Loader2,
  Mail,
  MapPin,
  Moon,
  Phone,
  Save,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  User,
  Volume2,
  X,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminUserIds, isAdminEmail } from "@/lib/services/adminAccessService";
import {
  cancelAccountDeletionRequest,
  getAccountDeletionRequest,
  requestAccountDeletion,
  type AccountDeletionRequestRecord,
} from "@/lib/services/accountDeletionService";
import { notificationService } from "@/lib/services/notificationService";

const avatarOptions = [
  { emoji: "😀", label: "Happy" },
  { emoji: "😎", label: "Cool" },
  { emoji: "🧠", label: "Brain" },
  { emoji: "🎓", label: "Graduate" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "📚", label: "Books" },
  { emoji: "💡", label: "Idea" },
  { emoji: "🧪", label: "Science" },
  { emoji: "🧩", label: "Puzzle" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "🌟", label: "Star" },
  { emoji: "🦊", label: "Fox" },
  { emoji: "🐼", label: "Panda" },
  { emoji: "🐧", label: "Penguin" },
  { emoji: "🦉", label: "Owl" },
  { emoji: "🐱", label: "Cat" },
];

const defaultPreferences: UserPreferences = {
  notifications: true,
  compactSidebar: false,
  darkMode: false,
  soundEffects: true,
};

const inputClassName =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const toggleTrackClassName =
  "relative inline-flex h-6 w-11 rounded-full border border-slate-200 bg-slate-200/80 transition peer-checked:border-sky-500 peer-checked:bg-sky-500";

export default function ProfileSettingsPage() {
  const { user, updateProfile } = useAuth();
  const { createNotification } = useNotifications();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("😀");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "avatar" | "settings">("profile");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequestRecord | null>(null);
  const [loadingDeletionRequest, setLoadingDeletionRequest] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [countdownNow, setCountdownNow] = useState(Date.now());

  const hasImageAvatar = useMemo(() => avatarUrl.trim().length > 0, [avatarUrl]);
  const isAdminUser = isAdminEmail(user?.email);

  useEffect(() => {
    if (!user) return;

    setName(user.name || "");
    setBio(user.bio || "");
    setPhone(user.phone || "");
    setAvatarEmoji(user.avatarEmoji || "😀");
    setAvatarUrl(user.avatarUrl || "");
    setPreferences({ ...defaultPreferences, ...(user.preferences || {}) });
    setLocation(user.location || "");
    setWebsite(user.website || "");
    setInstagram(user.instagram || "");
    setIsEditing(false);
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setDeletionRequest(null);
      return;
    }

    let cancelled = false;
    setLoadingDeletionRequest(true);
    getAccountDeletionRequest(user.id)
      .then((record) => {
        if (cancelled) return;
        setDeletionRequest(record);
      })
      .catch(() => {
        if (cancelled) return;
        setDeletionRequest(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingDeletionRequest(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pendingDeletionRequest =
    deletionRequest?.status === "pending" ? deletionRequest : null;

  useEffect(() => {
    if (!pendingDeletionRequest) return;

    const interval = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [pendingDeletionRequest]);

  const handleSaveAll = async () => {
    if (!user || !isEditing) return;

    const nextName = name.trim();
    if (!nextName) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: nextName,
        bio,
        phone,
        location,
        website,
        instagram,
        avatarEmoji: avatarEmoji || "😀",
        avatarUrl,
        preferences,
      });

      setIsEditing(false);
      toast.success("Profile updated successfully.");

      try {
        await createNotification({
          title: "Profile updated",
          message: "Your profile information was saved successfully.",
          type: "success",
          link: user
            ? user.role === "docente"
              ? `/teacher/profile/${user.id}`
              : user.role === "estudiante"
                ? `/student/profile/${user.id}`
                : "/profile"
            : "/profile",
          dedupeKey: `profile-updated:${user.id}:${Date.now()}`,
        });
      } catch {
        toast.warning("Profile was saved, but we could not create the notification.");
      }
    } catch {
      toast.error("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!user) return;

    setName(user.name || "");
    setBio(user.bio || "");
    setPhone(user.phone || "");
    setAvatarEmoji(user.avatarEmoji || "😀");
    setAvatarUrl(user.avatarUrl || "");
    setPreferences({ ...defaultPreferences, ...(user.preferences || {}) });
    setLocation(user.location || "");
    setWebsite(user.website || "");
    setInstagram(user.instagram || "");
    setIsEditing(false);
  };

  const handleClearAvatar = () => {
    setAvatarUrl("");
    setAvatarEmoji("😀");
  };

  const handleRequestDeletion = async () => {
    if (!user || isAdminUser || pendingDeletionRequest) return;

    const confirmed = window.confirm(
      "Your account will be scheduled for deletion in 30 days. Do you want to continue?",
    );
    if (!confirmed) return;

    setRequestingDeletion(true);
    try {
      const request = await requestAccountDeletion({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
      setDeletionRequest(request);

      try {
        const adminUserIds = (await getAdminUserIds()).filter((id) => id !== user.id);
        if (adminUserIds.length > 0) {
          const dueText = request.scheduledDeletionAt
            ? request.scheduledDeletionAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "30 days from now";

          await Promise.all(
            adminUserIds.map((adminId) =>
              notificationService.createNotification(adminId, {
                title: "Account deletion request",
                message: `${user.name} (${user.email}) requested account deletion. Scheduled for ${dueText}.`,
                type: "warning",
                link: "/admin",
                dedupeKey: `account-deletion-request:${request.userId}:${request.requestedAt?.getTime() || Date.now()}:${adminId}`,
              }),
            ),
          );
        }
      } catch {
        toast.warning("Deletion request created, but admin notifications could not be sent.");
      }

      toast.warning(
        "Deletion request created. You must wait 30 days unless an admin approves earlier.",
      );
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not create deletion request.";
      toast.error(reason);
    } finally {
      setRequestingDeletion(false);
    }
  };

  const handleCancelDeletionRequest = async () => {
    if (!user?.id || !pendingDeletionRequest) return;

    const confirmed = window.confirm(
      "Cancel your account deletion request?",
    );
    if (!confirmed) return;

    setCancellingDeletion(true);
    try {
      const updatedRequest = await cancelAccountDeletionRequest(user.id);
      setDeletionRequest(updatedRequest);
      toast.success("Account deletion request cancelled.");
    } catch {
      toast.error("Could not cancel deletion request.");
    } finally {
      setCancellingDeletion(false);
    }
  };

  const handlePreferenceToggle = async (
    key: keyof UserPreferences,
    value: boolean,
  ) => {
    if (!user) return;

    const previousPreferences = preferences;
    const nextPreferences = { ...preferences, [key]: value };
    setPreferences(nextPreferences);

    const root = document.documentElement;
    if (key === "darkMode") {
      root.classList.toggle("dark", value);
      root.style.colorScheme = value ? "dark" : "light";
    }

    try {
      await updateProfile({ preferences: nextPreferences });
    } catch {
      setPreferences(previousPreferences);
      if (key === "darkMode") {
        const previousDarkMode = Boolean(previousPreferences.darkMode);
        root.classList.toggle("dark", previousDarkMode);
        root.style.colorScheme = previousDarkMode ? "dark" : "light";
      }
      toast.error("Could not update preference");
    }
  };

  const getInitials = (value: string) =>
    value
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const normalizedWebsiteUrl = useMemo(() => {
    const value = website.trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }, [website]);

  const normalizedInstagramUrl = useMemo(() => {
    const value = instagram.trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;

    const username = value
      .replace(/^@/, "")
      .replace(/^instagram\.com\//i, "")
      .replace(/^www\.instagram\.com\//i, "")
      .replace(/\/+$/, "");

    return username ? `https://instagram.com/${username}` : "";
  }, [instagram]);

  const memberSinceLabel = useMemo(() => {
    if (!user?.createdAt) return "Unknown";
    const rawDate =
      user.createdAt instanceof Date
        ? user.createdAt
        : new Date(user.createdAt as unknown as string);
    if (Number.isNaN(rawDate.getTime())) return "Unknown";
    return formatDate(rawDate);
  }, [user?.createdAt]);

  const roleLabel =
    user?.role === "docente" ? "Teacher" : user?.role === "admin" ? "Admin" : "Student";

  const profileCompletion = useMemo(() => {
    const checklist = [
      name.trim(),
      bio.trim(),
      phone.trim(),
      location.trim(),
      website.trim(),
      instagram.trim(),
      hasImageAvatar ? avatarUrl.trim() : avatarEmoji.trim(),
    ];

    const completed = checklist.filter((entry) => entry.length > 0).length;
    return Math.round((completed / checklist.length) * 100);
  }, [
    avatarEmoji,
    avatarUrl,
    bio,
    hasImageAvatar,
    instagram,
    location,
    name,
    phone,
    website,
  ]);

  const statusLabel = isEditing ? "Editing" : "Saved";
  const statusTone = isEditing
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const RoleStatIcon = user?.role === "docente" ? Award : user?.role === "admin" ? Shield : User;
  const scheduledDeletionAt = pendingDeletionRequest?.scheduledDeletionAt || null;
  const remainingMs = Math.max(
    0,
    (scheduledDeletionAt?.getTime() || 0) - countdownNow,
  );
  const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const scheduledDeletionLabel = scheduledDeletionAt
    ? scheduledDeletionAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not scheduled";

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="relative mx-auto w-full max-w-[1400px] space-y-4 pb-2">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-sky-50 p-4 shadow-sm lg:p-5">
          <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-sky-100/70 blur-sm" />
          <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-indigo-100/60 blur-sm" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-100/80 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-sky-800">
                <Sparkles className="h-3.5 w-3.5" />
                Profile Workspace
              </span>
              <h1 className="text-2xl font-bold leading-tight text-slate-900">
                Profile Settings
              </h1>
              <p className="max-w-3xl text-sm text-slate-600">
                Update your account information, avatar, and preferences with the same design system used across your workspace.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.45)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit profile
                </button>
              ) : (
                <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.45)] transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[148px]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-5 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.95)] transition hover:from-sky-600 hover:to-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-[148px]"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving..." : "Save "}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-1.5 text-sm font-bold text-slate-900">{roleLabel}</p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700">
                <RoleStatIcon className="h-4 w-4" />
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion</p>
                <p className="mt-1.5 text-sm font-bold text-slate-900">{profileCompletion}%</p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Check className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, profileCompletion))}%` }}
              />
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Member since</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{memberSinceLabel}</p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Calendar className="h-4 w-4" />
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <span className={`mt-1.5 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
                  {statusLabel}
                </span>
              </div>
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${isEditing ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                <Shield className="h-4 w-4" />
              </span>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              {
                id: "profile",
                label: "Personal Info",
                icon: User,
                iconTone: "bg-sky-100 text-sky-700",
              },
              {
                id: "avatar",
                label: "Avatar",
                icon: ImageIcon,
                iconTone: "bg-violet-100 text-violet-700",
              },
              {
                id: "settings",
                label: "Preferences",
                icon: Settings,
                iconTone: "bg-emerald-100 text-emerald-700",
              },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as "profile" | "avatar" | "settings")}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
                    isActive
                      ? "border-sky-300 bg-sky-50 text-sky-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70 hover:text-sky-700"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                      isActive ? tab.iconTone : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        {activeTab === "profile" && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mx-auto flex w-full max-w-[250px] flex-col items-center text-center">
                <div className="relative">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-sky-100 text-slate-800 shadow-sm">
                    {hasImageAvatar ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-5xl leading-none">{avatarEmoji || getInitials(name || "US")}</span>
                    )}
                  </div>
                  <div className="absolute -right-2 -top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm">
                    <Camera className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="mt-4 text-base font-bold text-slate-900">{name || "Your Name"}</h2>
                <p className="mt-1 w-full break-all text-sm text-slate-500">{user?.email || "No email"}</p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                  <Award className="h-3.5 w-3.5 text-sky-600" />
                  {roleLabel} since {memberSinceLabel}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick links</p>
                {normalizedWebsiteUrl || normalizedInstagramUrl ? (
                  <div className="flex flex-wrap gap-2">
                    {normalizedWebsiteUrl && (
                      <a
                        href={normalizedWebsiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Website
                      </a>
                    )}
                    {normalizedInstagramUrl && (
                      <a
                        href={normalizedInstagramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        <Instagram className="h-3.5 w-3.5" />
                        Instagram
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-white/90 px-3 py-2 text-xs text-slate-500">
                    Add website or Instagram to show quick links here.
                  </p>
                )}
              </div>

            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Personal Information</h3>
                  <p className="text-xs text-slate-500">Update your contact and social details.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!isEditing}
                    className={inputClassName}
                    placeholder="John Doe"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className={`${inputClassName} bg-slate-100 pl-9 text-slate-500`}
                    />
                  </div>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</span>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      disabled={!isEditing}
                      className={`${inputClassName} pl-9`}
                      placeholder="+57 300 123 4567"
                    />
                  </div>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      disabled={!isEditing}
                      className={`${inputClassName} pl-9`}
                      placeholder="City, Country"
                    />
                  </div>
                </label>
              </div>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bio</span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  disabled={!isEditing}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Tell us a little about yourself..."
                />
              </label>

              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website</span>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      disabled={!isEditing}
                      className={`${inputClassName} pl-9`}
                      placeholder="example.com"
                    />
                  </div>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instagram</span>
                  <div className="relative">
                    <Instagram className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={instagram}
                      onChange={(event) => setInstagram(event.target.value)}
                      disabled={!isEditing}
                      className={`${inputClassName} pl-9`}
                      placeholder="@username"
                    />
                  </div>
                </label>
              </div>
            </article>
          </section>
        )}

        {activeTab === "avatar" && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Avatar Preview</h3>
                  <p className="text-xs text-slate-500">Image URL overrides emoji avatar.</p>
                </div>
              </div>

              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white/90 p-4">
                <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {hasImageAvatar ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-6xl leading-none">{avatarEmoji || "😀"}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearAvatar}
                  disabled={!isEditing}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Reset avatar
                </button>
              </div>

              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom image URL</p>
                <div className="relative">
                  <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    disabled={!isEditing}
                    className={`${inputClassName} pl-9`}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Info className="h-3.5 w-3.5" />
                  A valid URL displays immediately in profile preview.
                </p>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Emoji Avatars</h3>
                  <p className="text-xs text-slate-500">Choose one icon as your visual identity.</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {avatarOptions.map((option) => {
                  const selected = avatarEmoji === option.emoji && !hasImageAvatar;
                  return (
                    <button
                      key={option.emoji}
                      type="button"
                      disabled={!isEditing}
                      onClick={() => {
                        setAvatarEmoji(option.emoji);
                        setAvatarUrl("");
                      }}
                      className={`group relative rounded-xl border p-2 transition ${
                        selected
                          ? "border-sky-400 bg-sky-50"
                          : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/60"
                      } ${!isEditing ? "cursor-not-allowed opacity-50" : ""}`}
                      title={option.label}
                    >
                      <span className="block text-2xl leading-none">{option.emoji}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-slate-500">{option.label}</span>
                      {selected && (
                        <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Preferences</h3>
                  <p className="text-xs text-slate-500">These options save immediately when toggled.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
                  <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Bell className="h-3.5 w-3.5" />
                    Notifications & Sound
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <span className="text-sm font-medium text-slate-700">Push notifications</span>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={preferences.notifications}
                          onChange={(event) => handlePreferenceToggle("notifications", event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className={toggleTrackClassName}>
                          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                        </span>
                      </span>
                    </label>

                    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        <Volume2 className="h-4 w-4 text-slate-500" />
                        Sound effects
                      </span>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={preferences.soundEffects}
                          onChange={(event) => handlePreferenceToggle("soundEffects", event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className={toggleTrackClassName}>
                          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
                  <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <LayoutPanelLeft className="h-3.5 w-3.5" />
                    Appearance
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <span className="text-sm font-medium text-slate-700">Compact sidebar</span>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={preferences.compactSidebar}
                          onChange={(event) => handlePreferenceToggle("compactSidebar", event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className={toggleTrackClassName}>
                          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                        </span>
                      </span>
                    </label>

                    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        <Moon className="h-4 w-4 text-slate-500" />
                        Dark mode
                      </span>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={preferences.darkMode}
                          onChange={(event) => handlePreferenceToggle("darkMode", event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className={toggleTrackClassName}>
                          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </article>

            <aside className="space-y-4">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <User className="h-4 w-4" />
                  </span>
                  Account Summary
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                      <User className="h-3.5 w-3.5" />
                    </span>
                    {name || "No name"}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <span className="break-all">{user?.email || "No email"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                      <Calendar className="h-3.5 w-3.5" />
                    </span>
                    Member since {memberSinceLabel}
                  </p>
                </div>
              </article>

              {!isAdminUser && (
                <article className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                  <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700">
                    <Shield className="h-4 w-4" />
                    Danger Zone
                  </h4>
                  <p className="mt-2 text-xs text-rose-700/80">
                    Deleting your account is permanent and removes all associated data.
                  </p>

                  {pendingDeletionRequest ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-rose-200 bg-white p-3">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                        <Clock3 className="h-3.5 w-3.5" />
                        Deletion requested
                      </p>
                      <p className="text-xs text-slate-600">
                        Waiting period:{" "}
                        <span className="font-semibold text-slate-800">
                          {remainingDays}d {remainingHours}h {remainingMinutes}m
                        </span>
                      </p>
                      <p className="text-xs text-slate-600">
                        Scheduled deletion:{" "}
                        <span className="font-semibold text-slate-800">{scheduledDeletionLabel}</span>
                      </p>
                      <p className="inline-flex items-start gap-1.5 text-[11px] text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                        An admin can approve deletion earlier, or it will be processed after 30 days.
                      </p>
                      <button
                        type="button"
                        onClick={handleCancelDeletionRequest}
                        disabled={cancellingDeletion}
                        className="mt-1 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancellingDeletion ? "Cancelling..." : "Cancel deletion request"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestDeletion}
                      disabled={requestingDeletion || loadingDeletionRequest}
                      className="mt-3 inline-flex h-9 items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {requestingDeletion ? "Requesting..." : "Request account deletion"}
                    </button>
                  )}
                </article>
              )}
            </aside>
          </section>
        )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
