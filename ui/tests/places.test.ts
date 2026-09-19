import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Message from "../app/components/Message";
import PlaceDetails from "../app/components/PlaceDetails";
import { getPlace, getPlaceIcon } from "../lib/places";

import { getPlaceMapUrl, buildPlaceQuery } from "../lib/maps";
import { museum, places } from "./place-fixtures";

const render = (content: string) => renderToStaticMarkup(createElement(Message, { human: false, content, places }));

test("place icons use structured server data", () => {
  const place = museum;
  assert.equal(getPlaceIcon(place), "🏛️");
  assert.equal(getPlaceIcon({ ...place, type: "experience" }), undefined);
});

test("plain and multiple place references become prose buttons without IDs", () => {
  const html = render("Visit Vatican Museums (place_010), then Trastevere (place_002) tomorrow.");
  assert.match(html, /Vatican Museums details/);
  assert.match(html, /Trastevere Neighborhood details/);
  assert.match(html, /Vatican Museums<\/button>, then/);
  assert.match(html, /Trastevere<\/button> tomorrow\./);
  assert.doesNotMatch(html, /place_\d/);
});

test("bold, italic, headings and lists preserve Markdown around references", () => {
  const html = render("## Morning\n\nStart at **Vatican Museums** (place_010).\n\n- *Trastevere* (place_002)\n- ⚠️ **Book ahead**");
  assert.match(html, /<h2>Morning<\/h2>/);
  assert.match(html, /<strong>Vatican Museums<\/strong><\/button>/);
  assert.match(html, /<em>Trastevere<\/em><\/button>/);
  assert.match(html, /<ul>/);
  assert.match(html, /⚠️ <strong>Book ahead/);
});

test("follow-up suggestions hide bare and comma-separated IDs and preserve punctuation", () => {
  const records = Object.fromEntries([
    ["place_035", "Chianti Day Trip by Bike"], ["place_029", "Buca Mario"],
    ["place_033", "Buca dell'Orafo"], ["place_040", "San Miniato al Monte"],
  ].map(([id, name]) => [id, { ...museum, id, name }]));
  const content = "Would you like any changes?\n\n"
    + "- Swap the Siena day for a Chianti day trip by bike (Chianti Day Trip by Bike, place_035) — more outdoors.\n"
    + "- Add or swap restaurants (I found Buca Mario place_029, Buca dell'Orafo place_033).\n"
    + "- Add a sunset at San Miniato al Monte place_040.";
  const html = renderToStaticMarkup(createElement(Message, { human: false, content, places: records }));
  assert.doesNotMatch(html, /place_\d/);
  assert.equal((html.match(/class="place-reference"/g) ?? []).length, 4);
  assert.match(html, /Chianti Day Trip by Bike<\/button>\) — more outdoors/);
  assert.match(html, /Buca Mario<\/button>, /);
  assert.match(html, /San Miniato al Monte<\/button>\./);
  assert.match(render("(**Vatican Museums**, place_010)"), /<strong>Vatican Museums<\/strong><\/button>\)/);
  assert.match(render("Mystery place_999."), /Mystery\./);
  const literal = render("`Vatican Museums place_010`\n\n```\nVatican Museums, place_010\n```");
  assert.match(literal, /Vatican Museums place_010<\/code>/);
  assert.match(literal, /Vatican Museums, place_010/);
  assert.doesNotMatch(literal, /class="place-reference"/);
});

test("unknown, mismatched and malformed references remain safe prose", () => {
  const html = render("Visit Mystery Museum (place_999). Wrong Museum (place_010). Broken (place_nope).");
  assert.match(html, /Visit Mystery Museum\. Wrong Museum\./);
  assert.doesNotMatch(html, /place_999|place_010|class="place-reference"/);
  assert.match(html, /Broken/);
});

test("code stays literal, existing links don't contain buttons, and human text is unchanged", () => {
  const html = render("`Vatican Museums (place_010)`\n\n```text\nTrastevere (place_002)\n```\n\n[Vatican Museums (place_010)](https://example.com)");
  assert.match(html, /<code>Vatican Museums \(place_010\)<\/code>/);
  assert.match(html, /Trastevere \(place_002\)/);
  assert.doesNotMatch(html, /class="place-reference"/);
  assert.match(html, /rel="noopener noreferrer">Vatican Museums<\/a>/);
  const human = renderToStaticMarkup(createElement(Message, { human: true, content: "Vatican Museums (place_010)" }));
  assert.match(human, /\(place_010\)/);
});

test("streaming prefixes render without errors and completed references resolve", () => {
  const content = "Start at **Vatican Museums** (place_010).";
  for (let end = 1; end <= content.length; end++) assert.ok(render(content.slice(0, end)));
  assert.match(render(content), /class="place-reference"/);
});

test("details show source facts and secure Maps links with named places", () => {
  const place = museum;
  const html = renderToStaticMarkup(createElement(PlaceDetails, { place, onClose() {} }));
  assert.match(html, /<dialog/);
  assert.match(html, /Booking required/);
  assert.match(html, /240 minutes/);
  assert.match(html, /Closed Sundays/);
  assert.match(html, /Borgo · Rome · Lazio/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /place_010/);
  assert.equal(new URL(getPlaceMapUrl(place, "google")).searchParams.get("query"), buildPlaceQuery(place));
  assert.equal(new URL(getPlaceMapUrl({ ...place, latitude: null }, "google")).searchParams.get("query"), buildPlaceQuery(place));
  const missing = renderToStaticMarkup(createElement(PlaceDetails, {
    place: { ...place, booking_required: null, opening_hours: null, price_range: null }, onClose() {},
  }));
  assert.doesNotMatch(missing, /<dt>Booking|<dt>Listed hours|<dt>Price range/);
});


test("place lookup handles server responses, missing records, and failures", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  try {
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return Response.json(museum);
    };
    assert.deepEqual(await getPlace("place_010"), museum);
    assert.deepEqual(requests, ["/api/places/place_010"]);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.equal(await getPlace("place_999"), undefined);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(getPlace("place_010"), /Sign in again/);
    globalThis.fetch = async () => new Response(null, { status: 502 });
    await assert.rejects(getPlace("place_010"), /Unable to load/);
  } finally { globalThis.fetch = originalFetch; }
});
