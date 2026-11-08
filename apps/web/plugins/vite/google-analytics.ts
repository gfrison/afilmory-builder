import type { Plugin } from "vite";

// SPA navigations are tracked by GA4 enhanced measurement (browser history events).
export function googleAnalyticsPlugin(
  measurementId: string | undefined,
): Plugin {
  return {
    name: "afilmory:google-analytics",
    apply: "build",
    transformIndexHtml() {
      if (!measurementId) return;
      const id = JSON.stringify(measurementId);
      return [
        {
          tag: "script",
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
          },
          injectTo: "head",
        },
        {
          tag: "script",
          children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${id});`,
          injectTo: "head",
        },
      ];
    },
  };
}
