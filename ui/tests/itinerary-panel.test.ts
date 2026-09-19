import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import ItineraryPanel from "../app/components/ItineraryPanel";
import PlaceDetails from "../app/components/PlaceDetails";
import { publicItinerary, type Itinerary } from "../lib/itinerary";
import { museum, neighborhood, places } from "./place-fixtures";

test("itinerary projection retains traveler details without exposing extra state", () => {
  assert.deepEqual(
    publicItinerary({
      days: [
        {
          day: 1,
          title: "Rome",
          secret: "hidden",
          stops: [
            {
              place_id: museum.id,
              start_time: "09:00",
              end_time: "11:00",
              reason: "Art and history",
              warnings: ["Reserve tickets", 42],
              internal: "hidden",
            },
          ],
        },
      ],
    }),
    {
      days: [
        {
          day: 1,
          title: "Rome",
          stops: [
            {
              place_id: museum.id,
              start_time: "09:00",
              end_time: "11:00",
              reason: "Art and history",
              warnings: ["Reserve tickets"],
            },
          ],
        },
      ],
    },
  );
});

test(
  "itinerary always opens as a modal and stays open as the plan is created, revised, and cleared",
  { timeout: 5000 },
  async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
    const previousGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      Element: globalThis.Element,
      HTMLElement: globalThis.HTMLElement,
      Node: globalThis.Node,
      Event: globalThis.Event,
      getComputedStyle: globalThis.getComputedStyle,
    };
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node,
      Event: dom.window.Event,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const { createRoot } = await import("react-dom/client");
    await import("bootstrap/js/dist/modal");
    // JSDOM lacks native dialog methods; keep application focus and dismissal logic real.
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
      this.querySelector<HTMLButtonElement>("button")?.focus();
    };
    dom.window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    let itinerary: Itinerary | null = null;
    let busy = false;
    let selected: string | undefined;
    function App() {
      const [open, setOpen] = useState(false);
      const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
      return createElement(
        "div",
        null,
        createElement("button", { id: "open", onClick: () => setOpen(true) }, "View itinerary"),
        createElement("textarea", { id: "composer" }),
        createElement(
          ItineraryPanel,
          {
            open,
            itinerary,
            busy,
            places,
            onClose: () => setOpen(false),
            onSelectPlace: (id) => {
              selected = id;
              setSelectedPlaceId(id);
            },
          },
          open &&
            createElement(PlaceDetails, {
              place: selectedPlaceId ? places[selectedPlaceId] : undefined,
              onClose: () => setSelectedPlaceId(null),
            }),
        ),
      );
    }
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => root.render(createElement(App)));
      const dialog = document.getElementById("itinerary-panel")!;
      const openButton = document.getElementById("open")!;
      async function openModal() {
        const shown = new Promise<void>((resolve) =>
          dialog.addEventListener("shown.bs.modal", () => resolve(), { once: true }),
        );
        await act(async () => openButton.click());
        await act(async () => shown);
      }
      openButton.focus();
      await openModal();
      assert.equal(dialog.classList.contains("show"), true);
      assert.equal(dialog.getAttribute("aria-modal"), "true");
      assert.equal(dialog.getAttribute("role"), "dialog");
      assert.ok(dialog.querySelector(".modal-dialog.modal-lg.modal-dialog-scrollable"));
      assert.equal(document.body.classList.contains("modal-open"), true);
      assert.equal(document.body.style.overflow, "hidden");
      assert.equal(document.querySelectorAll(".modal-backdrop").length, 1);
      document.getElementById("composer")!.focus();
      assert.ok(dialog.contains(document.activeElement), "Bootstrap traps focus inside the modal");
      assert.equal(dialog.querySelectorAll(".itinerary-day").length, 3);
      assert.match(dialog.textContent!, /Your plan will take shape/);
      assert.doesNotMatch(dialog.textContent!, /Open day/);
      const focusedControl = dialog.querySelector<HTMLButtonElement>(".btn-close")!;
      focusedControl.focus();
      busy = true;
      await act(async () => root.render(createElement(App)));
      assert.match(dialog.textContent!, /Planning your trip/);
      itinerary = {
        days: [
          {
            day: 1,
            title: "Art morning",
            stops: [
              {
                place_id: museum.id,
                start_time: "09:00",
                reason: "See the galleries",
                warnings: ["Book ahead"],
              },
              { place_id: neighborhood.id },
            ],
          },
        ],
      };
      await act(async () => root.render(createElement(App)));
      assert.equal(dialog.classList.contains("show"), true);
      assert.equal(document.querySelectorAll(".modal-backdrop").length, 1);
      assert.ok(document.activeElement === focusedControl, "updates preserve focus");
      assert.match(dialog.textContent!, /Art morning/);
      assert.match(dialog.textContent!, /09:00/);
      assert.match(dialog.textContent!, /See the galleries/);
      assert.match(dialog.textContent!, /Book ahead/);
      assert.match(dialog.textContent!, /Open day in Google Maps/);
      assert.doesNotMatch(dialog.textContent!, /place_\d/);
      const placeButton = dialog.querySelector<HTMLButtonElement>(".place-reference")!;
      const scrollBody = dialog.querySelector<HTMLElement>(".modal-body")!;
      scrollBody.scrollTop = 120;
      placeButton.focus();
      await act(async () => placeButton.click());
      assert.equal(selected, museum.id);
      const details = dialog.querySelector("dialog")!;
      assert.equal(details.open, true);
      assert.equal(
        dialog.classList.contains("show"),
        true,
        "itinerary remains behind place details",
      );
      assert.equal(document.body.classList.contains("modal-open"), true);
      assert.ok(
        details.contains(document.activeElement),
        "Bootstrap allows focus in the top dialog",
      );
      await act(async () => {
        details
          .querySelector("button")!
          .dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        details.dispatchEvent(new dom.window.Event("cancel", { cancelable: true }));
      });
      assert.equal(details.open, false);
      assert.equal(dialog.classList.contains("show"), true, "Escape only closes place details");
      assert.ok(document.activeElement === placeButton, "focus returns to the selected place");
      assert.equal(scrollBody.scrollTop, 120);
      await act(async () => placeButton.click());
      await act(async () => details.querySelector<HTMLButtonElement>("button")!.click());
      assert.equal(details.open, false);
      assert.equal(dialog.classList.contains("show"), true);
      await act(async () => placeButton.click());
      details.getBoundingClientRect = () => new dom.window.DOMRect(100, 100, 500, 500);
      await act(async () =>
        details.dispatchEvent(
          new dom.window.MouseEvent("click", { bubbles: true, clientX: 20, clientY: 20 }),
        ),
      );
      assert.equal(details.open, false);
      assert.equal(dialog.classList.contains("show"), true, "backdrop only closes place details");
      assert.equal(scrollBody.scrollTop, 120);
      itinerary = {
        days: [{ day: 1, title: "Revised afternoon", stops: [{ place_id: neighborhood.id }] }],
      };
      busy = false;
      await act(async () => root.render(createElement(App)));
      assert.match(dialog.textContent!, /Revised afternoon/);
      assert.doesNotMatch(dialog.textContent!, /Vatican Museums|Art morning|Open day/);
      itinerary = null;
      await act(async () => root.render(createElement(App)));
      assert.match(dialog.textContent!, /Your plan will take shape/);
      assert.doesNotMatch(dialog.textContent!, /Revised afternoon/);
      await act(async () => {
        dialog.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
        dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      assert.equal(dialog.classList.contains("show"), false);
      openButton.focus();
      await openModal();
      const closeButton = dialog.querySelector<HTMLButtonElement>(".btn-close")!;
      closeButton.focus();
      await act(async () => closeButton.click());
      assert.equal(dialog.classList.contains("show"), false);
      assert.ok(document.activeElement === openButton, "focus returns to itinerary opener");
      await openModal();
      await act(async () => {
        dialog.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      assert.equal(dialog.classList.contains("show"), false);
      await openModal();
    } finally {
      await act(async () => root.unmount());
      assert.equal(document.querySelectorAll(".modal-backdrop").length, 0);
      assert.equal(document.body.classList.contains("modal-open"), false);
      assert.equal(document.body.style.overflow, "");
      Object.assign(globalThis, { ...previousGlobals, IS_REACT_ACT_ENVIRONMENT: false });
      dom.window.close();
    }
  },
);
