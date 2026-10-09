const activeLoads = new WeakMap();

export function backgroundImageKey(mapId) {
  const id = Number(mapId);
  return `bg:assets/map_bg/${Number.isSafeInteger(id) && id > 0 ? id : 1}.jpg`;
}

export function selectBackgroundImage(images, mapId) {
  for (const key of [backgroundImageKey(mapId), backgroundImageKey(1)]) {
    const image = images.get(key);
    if (image?.complete && image.naturalWidth > 0) return image;
  }
  return null;
}

/** CDN paths below arcarum3 mirror the bundled assets directory. */
export function localAssetUrl(remoteUrl) {
  const pathname = new URL(remoteUrl).pathname;
  const prefix = "/img/sp/arcarum3/";
  const offset = pathname.indexOf(prefix);
  if (offset < 0) throw new Error(`Unsupported asset URL: ${remoteUrl}`);
  return chrome.runtime.getURL(`assets/${pathname.slice(offset + prefix.length)}`);
}

export function loadAssetImage(img, remoteUrl, {
  onLoad,
  onError,
  timeoutMs = 8000,
} = {}) {
  activeLoads.get(img)?.();
  const sources = [remoteUrl, localAssetUrl(remoteUrl)];
  let sourceIndex = 0;
  let timer;
  let stopped = false;

  function cancel() {
    stopped = true;
    clearTimeout(timer);
    img.onload = null;
    img.onerror = null;
    activeLoads.delete(img);
  }

  function attempt() {
    clearTimeout(timer);
    const attemptIndex = sourceIndex;
    const fail = () => {
      if (stopped || attemptIndex !== sourceIndex) return;
      clearTimeout(timer);
      if (sourceIndex + 1 < sources.length) {
        sourceIndex++;
        attempt();
      } else {
        cancel();
        onError?.(img);
      }
    };
    img.onload = () => {
      if (stopped || attemptIndex !== sourceIndex) return;
      if (!img.naturalWidth) return fail();
      cancel();
      onLoad?.(img);
    };
    img.onerror = fail;
    if (sourceIndex === 0) img.crossOrigin = "anonymous";
    else img.removeAttribute("crossorigin");
    timer = setTimeout(fail, timeoutMs);
    img.src = sources[sourceIndex];
  }

  activeLoads.set(img, cancel);
  attempt();
  return img;
}
