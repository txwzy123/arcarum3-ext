/**
 * Isolated content script: inject page-hook, forward captures to background.
 */
(function () {
  const SOURCE = "gbf-arcarum3-map-hook";

  // inject page world hook
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("content/page-hook.js");
    s.async = false;
    (document.documentElement || document.head).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {
    console.warn("[gbf-map] inject failed", e);
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== SOURCE || data.type !== "api") return;

    chrome.runtime
      .sendMessage({
        type: "API_CAPTURED",
        payload: {
          url: data.url,
          method: data.method,
          status: data.status,
           body: data.body,
           requestBody: data.requestBody,
           gameLanguage: data.gameLanguage,
         },
      })
      .catch(() => {});
  });
})();
