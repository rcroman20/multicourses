import { AlertTriangle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PLATFORM_NAME,
  applyPlatformNameTemplate,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

type PlatformAnnouncementBannerProps = {
  className?: string;
};

const toneStyles = {
  info: {
    container: "border-sky-200/80 bg-sky-50 text-sky-900",
    chip: "bg-sky-100 text-sky-700",
    Icon: Megaphone,
    label: "Platform update",
  },
  warning: {
    container: "border-amber-200/80 bg-amber-50 text-amber-950",
    chip: "bg-amber-100 text-amber-700",
    Icon: AlertTriangle,
    label: "Attention",
  },
  critical: {
    container: "border-rose-200/80 bg-rose-50 text-rose-950",
    chip: "bg-rose-100 text-rose-700",
    Icon: AlertTriangle,
    label: "Important notice",
  },
} as const;

export function PlatformAnnouncementBanner({
  className = "",
}: PlatformAnnouncementBannerProps) {
  const { settings } = useAdminPlatformSettings();
  const platformName =
    String(settings.platformName || DEFAULT_PLATFORM_NAME).trim() || DEFAULT_PLATFORM_NAME;
  const rawText = String(settings.globalBannerText || "").trim();
  const bannerText = applyPlatformNameTemplate(rawText, platformName).trim();

  if (!bannerText) return null;

  const tone =
    settings.publicAnnouncementTone === "warning" || settings.publicAnnouncementTone === "critical"
      ? settings.publicAnnouncementTone
      : "info";
  const style = toneStyles[tone];
  const Icon = style.Icon;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 shadow-sm",
        style.container,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn("inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", style.chip)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
              {style.label}
            </p>
            <p className="mt-1 text-sm font-medium leading-6">{bannerText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
