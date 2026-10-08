// Unknown parameters are preserved: custom career sites often use them as job IDs.
const TRACKING_PARAMETERS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "gbraid", "wbraid", "gh_src",
  "trackingid", "trk", "trkinfo", "refid", "mc_cid", "mc_eid",
]);

export function normalizeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url).trim());
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_/i.test(key) || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url).trim().toLowerCase();
  }
}

export function getDomainFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(String(url).trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}
