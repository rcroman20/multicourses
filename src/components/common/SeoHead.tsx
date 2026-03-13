import { useEffect } from "react";

const SITE_NAME = "MultiCourses";
const SITE_URL = "https://multicourses.web.app";
const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;

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
  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;

    document.title = fullTitle;

    const descriptionMeta = ensureMeta('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "description";
      return meta;
    });
    descriptionMeta.content = description;

    const robotsMeta = ensureMeta('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.name = "robots";
      return meta;
    });
    robotsMeta.content = robots;

    if (keywords) {
      const keywordsMeta = ensureMeta('meta[name="keywords"]', () => {
        const meta = document.createElement("meta");
        meta.name = "keywords";
        return meta;
      });
      keywordsMeta.content = keywords;
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
    ogTitle.content = fullTitle;

    const ogDescription = ensureMeta('meta[property="og:description"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:description");
      return meta;
    });
    ogDescription.content = description;

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
    ogImage.content = DEFAULT_IMAGE;

    const twitterTitle = ensureMeta('meta[name="twitter:title"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:title";
      return meta;
    });
    twitterTitle.content = fullTitle;

    const twitterDescription = ensureMeta('meta[name="twitter:description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:description";
      return meta;
    });
    twitterDescription.content = description;

    const twitterImage = ensureMeta('meta[name="twitter:image"]', () => {
      const meta = document.createElement("meta");
      meta.name = "twitter:image";
      return meta;
    });
    twitterImage.content = DEFAULT_IMAGE;

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
  }, [canonicalPath, description, keywords, robots, structuredData, title]);

  return null;
}
