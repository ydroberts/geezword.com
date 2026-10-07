// Per-tab visitor journey memory shared by /play and /start.
//
// Remembers, in sessionStorage (this tab only, cleared when it closes):
//   - campaign tags from the landing URL (utm_source / utm_medium /
//     utm_campaign / utm_content)
//   - interests inferred from the paths the visitor clicked, or passed as
//     ?interest=<slug> (the games' Parents & Teachers link sends games)
// so a registration later in the same tab keeps its attribution and topic
// suggestions. Nothing here is sent anywhere; /start includes it in the
// registration only when the visitor submits the form.
//
// Tag values are normalised to the shape firestore.rules accepts for
// utmSource / utmMedium / utmCampaign / utmContent: lowercase a–z, 0–9, ".", "_" and "-",
// starting with a letter or digit, at most 50 characters.

const CAMPAIGN_KEY = "geezword-start-campaign";
const PATHS_KEY = "geezword-start-paths";

const CAMPAIGN_PARAMS = {
  utm_source:   "utmSource",
  utm_medium:   "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content:  "utmContent",
};

export function cleanTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 50);
}

// Tags from the current URL win and replace any stored ones (a newer tagged
// link is the newer campaign); otherwise the tags stored for this tab.
export function readCampaign() {
  const fromUrl = {};
  const params = new URLSearchParams(window.location.search);
  Object.entries(CAMPAIGN_PARAMS).forEach(([param, field]) => {
    const v = cleanTag(params.get(param));
    if (v) fromUrl[field] = v;
  });
  try {
    if (Object.keys(fromUrl).length) {
      sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = JSON.parse(sessionStorage.getItem(CAMPAIGN_KEY) || "{}");
    const safe = {};
    Object.values(CAMPAIGN_PARAMS).forEach((field) => {
      const v = cleanTag(stored && stored[field]);
      if (v) safe[field] = v;
    });
    return safe;
  } catch (err) {
    return fromUrl; // storage blocked — still use the current URL
  }
}

// The same tags as utm_* query parameters, for carrying them on a link.
export function campaignParams(campaign) {
  const params = new URLSearchParams();
  Object.entries(CAMPAIGN_PARAMS).forEach(([param, field]) => {
    if (campaign[field]) params.set(param, campaign[field]);
  });
  return params;
}

// The 8 interest slugs firestore.rules accepts (and functions/index.js maps
// to Resend topics). Only these may be suggested from a URL.
const INTEREST_SLUGS = [
  "tigrinya", "amharic", "geez-kidase", "childrens-learning",
  "books-courses", "games", "keyboards-typing", "general",
];

function readStoredInterests() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PATHS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((s) => INTEREST_SLUGS.includes(s)) : [];
  } catch (err) {
    return [];
  }
}

// ?interest=<slug> on the URL — e.g. the games' "Parents & Teachers" link
// sends interest=games. Unknown values are ignored.
function readUrlInterests() {
  return new URLSearchParams(window.location.search)
    .getAll("interest")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => INTEREST_SLUGS.includes(s));
}

// Suggestions for this tab: remembered path clicks plus any from the URL
// (which are remembered too, so they survive leaving and returning).
export function readPathInterests() {
  const slugs = readStoredInterests();
  readUrlInterests().forEach((slug) => {
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      rememberPathInterest(slug);
    }
  });
  return slugs;
}

export function rememberPathInterest(slug) {
  if (!INTEREST_SLUGS.includes(slug)) return;
  try {
    const slugs = readStoredInterests();
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      sessionStorage.setItem(PATHS_KEY, JSON.stringify(slugs));
    }
  } catch (err) {
    /* storage blocked — suggestions are a convenience only */
  }
}
