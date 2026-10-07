// Funnel analytics adapter — the ONLY file that knows which analytics
// provider the site uses (currently Vercel Web Analytics: cookieless,
// anonymous, aggregated). Pages call trackStep(); switching provider means
// editing this file and the privacy policy, nothing else.
//
// What is sent: the page view (by the provider's script) and, per funnel
// step, an event named "<campaign>: <step>" carrying only the campaign
// source and content tags remembered by journey.js. Never names, emails,
// form contents or other personal information.
//
// If the provider script is missing or blocked, every call is a harmless
// no-op: the page never depends on it.

import { readCampaign } from "/journey.js";

const PROVIDER_SCRIPT = "/_vercel/insights/script.js";

function ensureProvider() {
  if (window.va) return;
  // Queue calls until the provider script loads (documented plain-HTML setup).
  window.va = function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  const s = document.createElement("script");
  s.defer = true;
  s.src = PROVIDER_SCRIPT;
  document.head.appendChild(s);
}

// Page views only, no funnel event (e.g. the /events listing).
export function enablePageViews() {
  try { ensureProvider(); } catch (err) { /* never break the page */ }
}

// step: short label, e.g. "event page" or "start form".
// fallbackCampaign: used when the visitor arrived without campaign tags
// (e.g. an event page passes its own campaign id).
export function trackStep(step, fallbackCampaign) {
  try {
    ensureProvider();
    const c = readCampaign();
    const campaign = c.utmCampaign || fallbackCampaign || "no-campaign";
    window.va("event", {
      name: `${campaign}: ${step}`,
      data: {
        source: c.utmSource || "direct",
        content: c.utmContent || "none",
      },
    });
  } catch (err) {
    /* analytics must never break the page */
  }
}
