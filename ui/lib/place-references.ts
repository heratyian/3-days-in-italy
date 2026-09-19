import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import type { Place } from "./places";

function textContent(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element" && ["strong", "em"].includes(node.tagName)) {
    return node.children.map(textContent).join("");
  }
  return "";
}

/** Transform prose only. Never turn code or existing links into nested controls. */
export default function placeReferences(places: Record<string, Place | undefined> = {}) {
  return (tree: Root) => {
    function transform(parent: Root | Element, interactive = true) {
      const children: RootContent[] = [];
      for (const child of parent.children) {
        if (child.type === "element") {
          if (!["code", "pre"].includes(child.tagName)) {
            transform(child, interactive && child.tagName !== "a");
          }
          children.push(child);
          continue;
        }
        if (child.type !== "text") {
          children.push(child);
          continue;
        }
        let start = 0;
        // Accept canonical references plus observed "Name, place_123" and "Name place_123" variants.
        for (const match of child.value.matchAll(
          /\s*\((place_\d+)\)|(?:[ \t]*,[ \t]*|[ \t]*)(?<![\w/])(place_\d+)\b/g,
        )) {
          const before = child.value.slice(start, match.index);
          if (before) children.push({ type: "text", value: before });
          const placeId = match[1] ?? match[2];
          const place = places[placeId];
          const previous = children.at(-1);
          if (interactive && place && previous) {
            const labels = [place.name];
            if (place.type === "neighborhood" && place.neighborhood)
              labels.push(place.neighborhood);
            const text = textContent(previous);
            const label = labels.find(
              (name) =>
                text.endsWith(name) &&
                (text.length === name.length ||
                  /[\s([{—–]/u.test(text[text.length - name.length - 1])),
            );
            if (
              label &&
              (previous.type === "text" || (previous.type === "element" && text === label))
            ) {
              children.pop();
              let name: ElementContent = previous;
              if (previous.type === "text") {
                const prefix = text.slice(0, -label.length);
                if (prefix) children.push({ type: "text", value: prefix });
                name = { type: "text", value: label } satisfies Text;
              }
              children.push({
                type: "element",
                tagName: "button",
                properties: { "data-place-id": placeId },
                children: [name],
              });
            }
          }
          start = match.index! + match[0].length;
        }
        const remaining = child.value.slice(start);
        if (remaining) children.push({ type: "text", value: remaining });
      }
      parent.children = children;
    }
    transform(tree);
  };
}
