import { useEffect, useMemo, useState } from "react";
import { Settings, ShieldCheck, X } from "lucide-react";

export type CookieConsent = {
  version: string;
  consentGiven: boolean;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
};

const COOKIE_CONSENT_VERSION = "2026-02-20";
const COOKIE_CONSENT_KEY = "multicourses.cookieConsent";

const defaultOptionalState = {
  preferences: true,
  analytics: true,
  marketing: false,
};

function readStoredConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    if (!parsed.timestamp) return null;

    return {
      version: COOKIE_CONSENT_VERSION,
      consentGiven: true,
      necessary: true,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      timestamp: String(parsed.timestamp),
    };
  } catch {
    return null;
  }
}

function persistConsent(consent: CookieConsent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  window.dispatchEvent(
    new CustomEvent("cookie-consent-updated", {
      detail: consent,
    }),
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-600 mt-1">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative h-6 w-11 rounded-full border transition-colors ${
          checked ? "bg-blue-600 border-blue-600" : "bg-gray-200 border-gray-300"
        } ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function CookieConsentBanner() {
  const initialStoredConsent = useMemo(() => readStoredConsent(), []);
  const [isOpen, setIsOpen] = useState(!initialStoredConsent);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!initialStoredConsent);
  const [preferences, setPreferences] = useState(
    initialStoredConsent?.preferences ?? defaultOptionalState.preferences,
  );
  const [analytics, setAnalytics] = useState(
    initialStoredConsent?.analytics ?? defaultOptionalState.analytics,
  );
  const [marketing, setMarketing] = useState(
    initialStoredConsent?.marketing ?? defaultOptionalState.marketing,
  );

  useEffect(() => {
    const latest = readStoredConsent();
    if (!latest) return;
    setPreferences(latest.preferences);
    setAnalytics(latest.analytics);
    setMarketing(latest.marketing);
  }, []);

  const saveConsent = (next: {
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => {
    const consent: CookieConsent = {
      version: COOKIE_CONSENT_VERSION,
      consentGiven: true,
      necessary: true,
      preferences: next.preferences,
      analytics: next.analytics,
      marketing: next.marketing,
      timestamp: new Date().toISOString(),
    };

    persistConsent(consent);
    setPreferences(next.preferences);
    setAnalytics(next.analytics);
    setMarketing(next.marketing);
    setIsOpen(false);
    setIsSettingsOpen(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      preferences: true,
      analytics: true,
      marketing: true,
    });
  };

  const handleRejectOptional = () => {
    saveConsent({
      preferences: false,
      analytics: false,
      marketing: false,
    });
  };

  const handleSaveCustom = () => {
    saveConsent({ preferences, analytics, marketing });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[calc(100vw-2rem)] max-w-sm">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Cookie Settings
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                Essential cookies are always on. Choose optional cookies.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Close cookie banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          <ToggleRow
            title="Strictly Necessary"
            description="Required for authentication, session security, and basic platform operation."
            checked
            disabled
          />

          {isSettingsOpen && (
            <>
              <ToggleRow
                title="Preferences"
                description="Stores UI choices and settings to improve your experience."
                checked={preferences}
                onChange={setPreferences}
              />
              <ToggleRow
                title="Analytics"
                description="Helps us understand usage patterns and improve performance."
                checked={analytics}
                onChange={setAnalytics}
              />
              <ToggleRow
                title="Marketing"
                description="Used for announcements and communication measurement."
                checked={marketing}
                onChange={setMarketing}
              />
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRejectOptional}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-3.5 w-3.5" />
              {isSettingsOpen ? "Hide" : "Customize"}
            </button>
            {isSettingsOpen && (
              <button
                type="button"
                onClick={handleSaveCustom}
                className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100"
              >
                Save
              </button>
            )}
            <button
              type="button"
              onClick={handleAcceptAll}
              className="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
            >
              Accept all
            </button>
          </div>

          <p className="text-[10px] text-gray-500">
            You can change this anytime from the Cookies button.
          </p>
        </div>
      </div>
    </div>
  );
}

export function getCookieConsent(): CookieConsent | null {
  return readStoredConsent();
}
