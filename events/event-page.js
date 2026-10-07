// Renders /events and each /events/<id> page from events.js.
//
// The HTML already contains a complete static version (title, "To be
// announced" details, a Join link), so the page works and previews well
// without JavaScript; this script fills in whatever events.js knows.
//
// Pages declare what they are on <body>:
//   data-events-page="event" data-event="<id>"   — one event
//   data-events-page="listing"                   — the /events list

import { readCampaign } from "/journey.js";
import { trackStep, enablePageViews } from "/analytics.js";
import {
  EVENT_TYPES, eventById, upcomingEvents, pastEvents, formatDate,
} from "/events/events.js";

const TBA = "To be announced";

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c === null || c === undefined) return;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return node;
}

// Join link: /start#community, plus the event's interest when it has one, and
// the event's campaign only when the visitor arrived without campaign tags,
// so an untagged visit still credits the registration to this event.
function joinHref(ev) {
  const params = new URLSearchParams();
  if (ev && ev.interest) params.set("interest", ev.interest);
  const stored = readCampaign();
  if (ev && ev.campaign && !stored.utmCampaign) params.set("utm_campaign", ev.campaign);
  const q = params.toString();
  return "/start" + (q ? "?" + q : "") + "#community";
}

function setJoinLinks(ev) {
  document.querySelectorAll("a[data-join]").forEach((a) => { a.href = joinHref(ev); });
}

function previousLine(container) {
  if (!container) return;
  const past = pastEvents("book-signing");
  if (!past.length) { container.hidden = true; return; }
  container.replaceChildren(
    el("span", { className: "previous-label" }, "Previous book signings: "),
    ...past.flatMap((p, i) => [
      i ? " · " : "",
      el("span", { className: "previous-item" }, `${p.city} — ${formatDate(p.date) || p.date}`),
    ])
  );
  container.hidden = false;
}

function renderDetails(ev) {
  const venueText = ev.venue
    ? [ev.venue.name, ev.venue.address].filter(Boolean).join(", ")
    : null;
  const rows = {
    date: formatDate(ev.date),
    time: ev.time,
    venue: venueText,
    host: ev.host ? ev.host.name : null,
  };
  let missing = false;
  Object.entries(rows).forEach(([key, value]) => {
    const dd = document.querySelector(`[data-detail="${key}"]`);
    if (!dd) return;
    if (!value) missing = true;
    dd.classList.toggle("is-tba", !value);
    if (key === "venue" && value && ev.venue.mapUrl) {
      dd.replaceChildren(el("a", { href: ev.venue.mapUrl, rel: "noopener" }, value));
    } else if (key === "host" && value && ev.host.url) {
      dd.replaceChildren(el("a", { href: ev.host.url, rel: "noopener" }, value));
    } else {
      dd.textContent = value || TBA;
    }
  });
  const note = document.querySelector('[data-slot="tba-note"]');
  if (note) note.hidden = !missing;
}

function renderFlyer(ev) {
  const slot = document.querySelector('[data-slot="flyer"]');
  if (!slot) return;
  if (!ev.flyer || !ev.flyer.src) { slot.hidden = true; return; }
  slot.replaceChildren(
    el("img", {
      src: ev.flyer.src, alt: ev.flyer.alt || `${ev.title}, ${ev.city} — flyer`,
      width: ev.flyer.width, height: ev.flyer.height, loading: "lazy",
    })
  );
  slot.hidden = false;
}

function renderRsvp(ev) {
  const slot = document.querySelector('[data-slot="rsvp"]');
  if (!slot) return;
  if (!ev.rsvp || !ev.rsvp.url) { slot.hidden = true; return; }
  slot.replaceChildren(
    el("a", { className: "btn btn-secondary", href: ev.rsvp.url, rel: "noopener" },
      ev.rsvp.label || "RSVP")
  );
  slot.hidden = false;
}

function renderEventPage() {
  const ev = eventById(document.body.dataset.event);
  if (!ev) return;
  const typeLabel = document.querySelector('[data-slot="type"]');
  if (typeLabel) typeLabel.textContent = EVENT_TYPES[ev.type] || "";
  renderDetails(ev);
  renderFlyer(ev);
  renderRsvp(ev);
  previousLine(document.querySelector('[data-slot="previous"]'));
  setJoinLinks(ev);
  trackStep("event page", ev.campaign);
}

function renderListing() {
  const list = document.querySelector('[data-slot="upcoming"]');
  if (list) {
    const items = upcomingEvents().map((ev) =>
      el("li", { className: "event-card" },
        el("p", { className: "event-card-type" }, EVENT_TYPES[ev.type] || ""),
        el("h3", {}, el("a", { href: `/events/${ev.id}` }, `${ev.title} · ${ev.city}`)),
        el("p", { className: "event-card-when" },
          [formatDate(ev.date) || "Date to be announced",
           ev.venue ? ev.venue.name : null].filter(Boolean).join(" · ")),
        el("a", { className: "btn btn-primary", href: `/events/${ev.id}` }, "Event details →")
      )
    );
    if (items.length) list.replaceChildren(...items);
  }
  previousLine(document.querySelector('[data-slot="previous"]'));
  setJoinLinks(null);
  enablePageViews();
}

readCampaign(); // remember this visit's campaign tags for the tab (journey.js)
if (document.body.dataset.eventsPage === "event") renderEventPage();
else if (document.body.dataset.eventsPage === "listing") renderListing();
