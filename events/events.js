// Geezword events — the single source of truth for /events and every event
// page. Adding an event = one entry here + a short HTML file in
// events/<id>/index.html (needed for its own link-preview title and image).
//
// Fields left null are shown as "To be announced", so details (date, venue,
// host, flyer, RSVP) can be filled in later without changing any page.
// Only PUBLIC facts belong here; partner/contact data stays in the PM app.

export const EVENT_TYPES = {
  "book-signing": "Book signing",
  "community-event": "Community event",
  "festival": "Festival",
  "presentation": "Presentation / workshop",
};

export const EVENTS = [
  {
    id: "los-angeles-2026",      // page: /events/los-angeles-2026
    campaign: "la-2026",         // utm_campaign for every link to this event
    type: "book-signing",
    status: "upcoming",          // "upcoming" | "past"
    title: "Book Signing & Community Event",
    city: "Los Angeles",
    region: "California",
    date: null,                  // "YYYY-MM-DD"
    time: null,                  // e.g. "2:00 – 5:00 PM"
    venue: null,                 // { name, address, mapUrl }
    host: null,                  // { name, url }
    flyer: null,                 // { src, alt, width, height }
    rsvp: null,                  // { label, url } — an external RSVP, if the host uses one
    interest: null,              // optional /start interest to pre-tick (e.g. "geez-kidase")
    shortUrl: "geezword.com/la",
  },
  {
    id: "houston-2026",
    type: "book-signing",
    status: "past",
    city: "Houston",
    date: "2026-07-11",
  },
  {
    id: "san-antonio-2026",
    type: "book-signing",
    status: "past",
    city: "San Antonio",
    date: "2026-09-19",
  },
];

export function eventById(id) {
  return EVENTS.find((e) => e.id === id) || null;
}

export function upcomingEvents() {
  return EVENTS.filter((e) => e.status === "upcoming");
}

// Past events of one type, oldest first (e.g. "Previous book signings").
export function pastEvents(type) {
  return EVENTS
    .filter((e) => e.status === "past" && (!type || e.type === type))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// "2026-07-11" -> "July 11, 2026" (formatted in UTC so the day never shifts).
export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}
