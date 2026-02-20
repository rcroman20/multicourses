import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth, type UserPreferences } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  User,
  Settings,
  Bell,
  LayoutPanelLeft,
  Save,
  Phone,
  Image as ImageIcon,
  Sparkles,
  Mail,
  Briefcase,
  Calendar,
  MapPin,
  Link as LinkIcon,
  Globe,
  Instagram,
  Award,
  BookOpen,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Camera,
  Upload,
  Trash2,
  Edit3,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Shield,
  Key,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  Heart,
  Star,
  Trophy,
  Rocket,
  Zap,
  Users,
  GraduationCap,
  Clock,
  TrendingUp,
  BarChart3,
  FileText,
  HelpCircle,
  Info,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const hasImageAvatar = useMemo(() => avatarUrl.trim().length > 0, [avatarUrl]);

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

  const handleSaveAll = async () => {
    if (!user) return;
    if (!isEditing) return;

    const nextName = name.trim();
    if (!nextName) {
      toast.error("Name is required");
      return;
    }

    try {
      setSaving(true);
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
      if (preferences.notifications) {
        await createNotification({
          title: "Profile updated",
          message: "Your profile information was saved successfully.",
          type: "success",
          link: user
            ? `${user.role === "docente" ? "/teacher" : "/student"}/profile/${user.id}`
            : "/profile",
        });
      }
      toast.success("Profile updated successfully");
      setIsEditing(false);
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
    setShowAvatarPicker(false);
    setIsEditing(false);
  };

  const handleClearAvatar = () => {
    setAvatarUrl("");
    setAvatarEmoji("😀");
  };

  const handlePreferenceToggle = async (
    key: keyof UserPreferences,
    value: boolean,
  ) => {
    if (!user) return;

    const previousPreferences = preferences;
    const nextPreferences = { ...preferences, [key]: value };
    setPreferences(nextPreferences);

    try {
      await updateProfile({ preferences: nextPreferences });
    } catch {
      setPreferences(previousPreferences);
      toast.error("Could not update preference");
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(word => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

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

  return (
    <DashboardLayout
      title="Profile"
      subtitle="Manage your personal information"
       contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        {/* Header con gradiente */}
        <div className="bg-blue-600 rounded-2xl p-4 md:p-5 shadow-lg mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Your Profile</h3>
                <p className="text-blue-100 text-sm">
                  Customize your account settings and preferences
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all"
                >
                  <Edit3 className="h-4 w-4" />
                  
                </button>
              )}
              <button
                onClick={handleSaveAll}
                disabled={saving || !isEditing}
                className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

    

        {/* Tabs de navegación */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === "profile"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <User className="h-4 w-4 inline mr-2" />
            Personal Info
          </button>
          <button
            onClick={() => setActiveTab("avatar")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === "avatar"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <ImageIcon className="h-4 w-4 inline mr-2" />
            Avatar
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === "settings"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <Settings className="h-4 w-4 inline mr-2" />
            Profile
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div className="max-full">
          {/* Pestaña: Personal Info */}
          {activeTab === "profile" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Personal Information</h2>
                  <p className="text-sm text-gray-600">Update your personal details</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna izquierda - Avatar preview */}
                <div className="lg:col-span-1">
                  <div className="bg-gray-100 rounded-xl p-6 text-center">
                    <div className="relative inline-block">
                      <div className="h-32 w-32 rounded-2xl border-4 border-white shadow-lg bg-blue-100 flex items-center justify-center overflow-hidden mx-auto">
                        {hasImageAvatar ? (
                          <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-5xl">{avatarEmoji || "😀"}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                        disabled={!isEditing}
                        className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mt-3">{name || "Your Name"}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200 text-align-center">
                      <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
                        <Award className="h-3 w-3 text-blue-500" />
                        <span>
                          {(user?.role === "docente" ? "Teacher" : "Student")} since{" "}
                          {user?.createdAt ? user.createdAt.getFullYear() : new Date().getFullYear()}
                        </span>
                      </div>
                    </div>
                  </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {normalizedWebsiteUrl && (
                        <a
                          href={normalizedWebsiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Open Website
                        </a>
                      )}
                      {normalizedInstagramUrl && (
                        <a
                          href={normalizedInstagramUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                        >
                          <Instagram className="h-3.5 w-3.5" />
                          Open Instagram
                        </a>
                      )}
                    </div>
                </div>

                

                {/* Columna derecha - Formulario */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!isEditing}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          value={user?.email || ""}
                          disabled
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 bg-gray-50 text-gray-500 rounded-xl dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          disabled={!isEditing}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                          placeholder="+57 300 123 4567"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          disabled={!isEditing}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                          placeholder="City, Country"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                      placeholder="Tell us a little about yourself..."
                    />
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Social Links</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative">
                        <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          disabled={!isEditing}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                          placeholder="Website"
                        />
                      </div>
                      <div className="relative">
                        <Instagram className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={instagram}
                          onChange={(e) => setInstagram(e.target.value)}
                          disabled={!isEditing}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                          placeholder="Instagram"
                        />
                      </div>
                    </div>
                  
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pestaña: Avatar */}
          {activeTab === "avatar" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Choose Your Avatar</h2>
                  <p className="text-sm text-gray-600">Select an emoji or upload an image</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vista previa */}
                <div className="bg-gray-100 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Preview</h3>
                  <div className="flex flex-col items-center">
                    <div className="h-40 w-40 rounded-2xl border-4 border-white shadow-xl bg-blue-100 flex items-center justify-center overflow-hidden mb-4">
                      {hasImageAvatar ? (
                        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-6xl">{avatarEmoji || "😀"}</span>
                      )}
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleClearAvatar}
                        disabled={!isEditing}
                        className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                {/* Selector de emoji */}
                <div>
                   <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Custom Image URL</h3>
                      <p className="text-xs text-gray-500 mt-2 mb-2 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Image URLs will override emoji selection
                    </p>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="url"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        disabled={!isEditing}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2 disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                        placeholder="https://example.com/avatar.jpg"
                      />
                    </div>
                  
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Emoji Avatars</h3>
                  <div className="grid grid-cols-4 gap-2 mb-4 max-h-[300px] overflow-y-auto p-1">
                    {avatarOptions.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        disabled={!isEditing}
                        onClick={() => {
                          setAvatarEmoji(option.emoji);
                          setAvatarUrl("");
                        }}
                        className={`relative h-16 rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                          avatarEmoji === option.emoji && !hasImageAvatar
                            ? "border-blue-500 bg-blue-50 shadow-md scale-105"
                            : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                        } ${!isEditing ? "opacity-50 cursor-not-allowed hover:border-gray-200 hover:bg-white" : ""}`}
                        title={option.label}
                      >
                        <span className="text-2xl">{option.emoji}</span>
                        <span className="text-[10px] mt-1 text-gray-500">{option.label}</span>
                        {avatarEmoji === option.emoji && !hasImageAvatar && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                 
                </div>
              </div>
            </div>
          )}

          {/* Pestaña: Settings */}
          {activeTab === "settings" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Preferences</h2>
                  <p className="text-sm text-gray-600">Customize your experience</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Bell className="h-4 w-4 text-blue-500" />
                      Notifications & Sound
                    </h3>
                    <div className="space-y-2">
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <Bell className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">Push Notifications</span>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={preferences.notifications}
                            onChange={(e) =>
                              handlePreferenceToggle(
                                "notifications",
                                e.target.checked,
                              )
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    
                    <div className="space-y-2">
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <Volume2 className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">Sound Effects</span>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={preferences.soundEffects}
                            onChange={(e) =>
                              handlePreferenceToggle(
                                "soundEffects",
                                e.target.checked,
                              )
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <LayoutPanelLeft className="h-4 w-4 text-blue-500" />
                    Appearance
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <LayoutPanelLeft className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Compact Sidebar</span>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={preferences.compactSidebar}
                          onChange={(e) =>
                            handlePreferenceToggle(
                              "compactSidebar",
                              e.target.checked,
                            )
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </div>
                    </label>

                    <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <Moon className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Dark Mode</span>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={preferences.darkMode}
                          onChange={(e) =>
                            handlePreferenceToggle(
                              "darkMode",
                              e.target.checked,
                            )
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              {/* Zona de peligro */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4" />
                  Danger Zone
                </h3>
                <div className="bg-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Delete Account</p>
                      <p className="text-xs text-gray-600">Permanently delete your account and all data</p>
                    </div>
                    <button className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors">
                      Delete
                    </button> 
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Barra de acciones flotante para móvil */}
          <div className="fixed bottom-4 right-4 md:hidden">
            <button
              onClick={handleSaveAll}
              disabled={saving || !isEditing}
              className="h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:shadow-xl transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Save className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
