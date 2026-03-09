import { Crown, Trash2 } from "lucide-react";

type AdminProfileSnapshot = {
  name: string;
  email: string;
  avatarUrl: string;
  avatarEmoji: string;
};

type AdminEmailListItemProps = {
  email: string;
  profile?: AdminProfileSnapshot;
  isOwner: boolean;
  isCurrent: boolean;
  onRemove: (email: string) => void;
};

export function AdminEmailListItem({
  email,
  profile,
  isOwner,
  isCurrent,
  onRemove,
}: AdminEmailListItemProps) {
  const hasAvatarImage = Boolean(profile?.avatarUrl);
  const avatarLabel = (profile?.name || email || "A").trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-base shadow-sm">
          {hasAvatarImage ? (
            <img src={profile?.avatarUrl} alt={profile?.name || email} className="h-full w-full object-cover" />
          ) : (
            <span>{profile?.avatarEmoji || avatarLabel}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{profile?.name || "Admin user"}</p>
          <p className="break-all text-xs text-slate-600">{email}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isOwner && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Crown className="h-3 w-3" />
              Owner
            </span>
          )}
          {isCurrent && (
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              You
            </span>
          )}
        </div>
      </div>

      {!isOwner && (
        <button
          type="button"
          onClick={() => onRemove(email)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      )}
    </div>
  );
}
