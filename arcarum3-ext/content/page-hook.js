/**
 * Runs in the page context and uses GBF's jQuery AJAX lifecycle, matching the
 * capture path used by the reference extension.
 */
(function () {
  const FLAG = "__GBF_ARCARUM3_MAP_HOOK__";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const SOURCE = "gbf-arcarum3-map-hook";
  const MAX_ATTEMPTS = 100;
  const POLL_INTERVAL_MS = 100;
  let attempts = 0;

  function interesting(url) {
    if (!url || typeof url !== "string") return false;
    return (
      url.includes("/arcarum3/") ||
      url.includes("/rest/arcarum3/") ||
      /\/result(?:multi)?\/content\/index/i.test(url) ||
      /\/socket\/query/i.test(url)
    );
  }

  function detectGameLanguage() {
    const declared = String(document.documentElement?.lang || "").toLowerCase();
    if (declared.startsWith("zh")) return "zh-CN";
    if (declared.startsWith("ja") || declared.startsWith("jp")) return "ja";
    if (declared.startsWith("en")) return "en";

    const assetNodes = document.querySelectorAll("script[src], link[href], img[src]");
    for (const node of assetNodes) {
      const assetUrl = node.src || node.href || "";
      if (/\/assets_en\//i.test(assetUrl)) return "en";
    }
    return null;
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  function emit(payload) {
    try {
      window.postMessage({ source: SOURCE, ...payload }, "*");
    } catch (_) {
      /* ignore */
    }
  }

  const jqueryPoll = setInterval(() => {
    const jquery =
      typeof jQuery === "function"
        ? jQuery
        : typeof $ === "function"
          ? $
          : null;

    if (jquery) {
      clearInterval(jqueryPoll);
      jquery(document).ajaxSuccess((_event, xhr, settings, data) => {
        const url = settings?.url;
        if (!interesting(url)) return;

        emit({
          type: "api",
          url: absoluteUrl(url),
          method: String(settings.type || settings.method || "GET").toUpperCase(),
          status: xhr?.status ?? 200,
          body: data,
          requestBody: settings.data ?? null,
          gameLanguage: detectGameLanguage(),
        });
      });
      return;
    }

    attempts += 1;
    if (attempts > MAX_ATTEMPTS) clearInterval(jqueryPoll);
  }, POLL_INTERVAL_MS);
})();
