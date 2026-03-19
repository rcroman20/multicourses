import { useEffect } from "react";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_PLATFORM_NAME,
  DEFAULT_SITE_URL,
  resolvePlatformSiteUrl,
  resolvePlatformShareImageUrl,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

const DEFAULT_SITE_NAME = DEFAULT_PLATFORM_NAME;
export const SITE_URL = DEFAULT_SITE_URL;
type SeoHeadProps = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string;
  robots?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const ensureMeta = (selector: string, create: () => HTMLMetaElement): HTMLMetaElement => {
  const existing = document.head.querySelector(selector);
  if (existing instanceof HTMLMetaElement) return existing;
  const meta = create();
  document.head.appendChild(meta);
  return meta;
};

export function SeoHead({
  title,
  description,
  canonicalPath,
  keywords,
  robots = "index, follow",
  structuredData,
}: SeoHeadProps) {
  const { settings } = useAdminPlatformSettings();

  useEffect(() => {
    const siteName = String(settings.platformName || "").trim() || DEFAULT_SITE_NAME;
    const siteUrl = resolvePlatformSiteUrl(settings.siteUrl);
    const logoCandidate = resolvePlatformShareImageUrl(settings.shareImageUrl || settings.logoUrl);
    const socialImage = /^https?:\/\//i.test(logoCandidate)
      ? logoCandidate
      : `${siteUrl}${logoCandidate.startsWith("/") ? logoCandidate : `/${logoCandidate}`}`;
    const canonicalUrl = `${siteUrl}${canonicalPath}`;
    const computedTitle = `${title} | ${siteName}`;
    const resolvedDescription =
      String(description || "").trim() ||
      String(settings.siteDescription || "").trim() ||
      DEFAULT_SITE_DESCRIPTION;
    const resolvedKeywords = String(keywords || "").trim() || String(settings.siteKeywords || "").trim();

    document.title = computedTitle;

    const descriptionMeta = ensureMeta('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "description";
      return meta;
    });
    descriptionMeta.content = resolvedDescription;

    const robotsMeta = ensureMeta('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.name = "robots";
      return meta;
    });
    robotsMeta.content = robots;

    if (resolvedKeywords) {
      const keywordsMeta = ensureMeta('meta[name="keywords"]', () => {
        const meta = document.createElement("meta");
        meta.name = "keywords";
        return meta;
      });
      keywordsMeta.content = resolvedKeywords;
    }

    const canonicalLink = (() => {
      const existing = document.head.querySelector('link[rel="canonical"]');
      if (existing instanceof HTMLLinkElement) return existing;
      const link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
      return link;
    })();
    canonicalLink.href = canonicalUrl;

    const ogTitle = ensureMeta('meta[property="og:title"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:title");
      return meta;
    });
    ogTitle.content = computedTitle;

    const ogDescription = ensureMeta('meta[property="og:description"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:description");
      return meta;
    });
    ogDescription.content = resolvedDescription;

    const ogUrl = ensureMeta('meta[property="og:url"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:url");
      return meta;
    });
    ogUrl.content = canonicalUrl;

    const ogImage = ensureMeta('meta[property="og:image"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:image");
      return meta;
    });
    ogImage.content = socialImage;

    const twitterTitle = ensureMeta('meta[name="twitter:title"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:title";
      return meta;
    });
    twitterTitle.content = computedTitle;

    const twitterDescription = ensureMeta('meta[name="twitter:description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:description";
      return meta;
    });
    twitterDescription.content = resolvedDescription;

    const twitterImage = ensureMeta('meta[name="twitter:image"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:image";
      return meta;
    });
    twitterImage.content = socialImage;

    const scriptId = "seo-structured-data";
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      existingScript.remove();
    }

    if (structuredData) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.text = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }
  }, [
    canonicalPath,
    description,
    keywords,
    robots,
    settings.logoUrl,
    settings.platformName,
    settings.shareImageUrl,
    settings.siteDescription,
    settings.siteKeywords,
    settings.siteUrl,
    structuredData,
    title,
  ]);

  return null;
}
