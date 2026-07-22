// FIX-10 render-discipline tests for the XML structured-document view. The security
// property under test: uploaded XML is NEVER placed in an active-embed element
// (<object>/<iframe>) or opened in a new tab — a scriptable XML/SVG upload would
// otherwise load as a same-origin browsing context (stored XSS). It must be shown as
// ESCAPED text and offered only as a forced-attachment download. Pure / presentational:
// renderToStaticMarkup (useEffect never fires here, so there is no byte fetch).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RawXmlBlock, XmlStructuredView } from "./XmlStructuredView";

// A hostile payload: a script element and an active XSLT stylesheet. If any of this
// reached an <object>/<iframe> or a new tab it would execute; rendered as text it must
// appear ESCAPED and inert.
const HOSTILE = `<?xml-stylesheet href="evil.xsl"?><Invoice><script>steal()</script><xsl:stylesheet/></Invoice>`;

function render(el: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(el);
}

test("RawXmlBlock renders hostile XML as ESCAPED text — no live markup", () => {
  const html = render(createElement(RawXmlBlock, { text: HOSTILE, blobUrl: "blob:x" }));
  assert.ok(html.includes("&lt;script&gt;"), "the <script> must be HTML-escaped, not live");
  assert.ok(!html.includes("<script>"), "a live <script> tag must never be emitted");
  assert.ok(!html.includes("<xsl:stylesheet"), "the XSLT stylesheet must be escaped, not emitted as an element");
});

test("RawXmlBlock never embeds XML in an <object>/<iframe> and never opens a new tab", () => {
  const html = render(createElement(RawXmlBlock, { text: HOSTILE, blobUrl: "blob:x" }));
  assert.ok(!html.includes("<object"), "no <object> active-embed");
  assert.ok(!html.includes("<iframe"), "no <iframe> active-embed");
  assert.ok(!html.includes('target="_blank"'), "no new-tab open of the raw XML");
  assert.ok(!html.includes("_blank"), "no new-tab target anywhere");
});

test("RawXmlBlock offers ONLY a forced-attachment download (the download attribute)", () => {
  const html = render(createElement(RawXmlBlock, { text: HOSTILE, blobUrl: "blob:xyz" }));
  assert.ok(html.includes("download="), "the raw XML is offered as a forced download");
  assert.ok(html.includes('href="blob:xyz"'), "the download points at the local blob");
});

test("RawXmlBlock in its loading state still has no active-embed and no new tab", () => {
  const html = render(createElement(RawXmlBlock, { text: null, blobUrl: "blob:x" }));
  assert.ok(!html.includes("<object"), "no <object> while loading");
  assert.ok(!html.includes("_blank"), "no new-tab while loading");
  assert.ok(html.includes("download="), "the download link is present even before the text loads");
});

test("XmlStructuredView (server render) exposes no <object>/new-tab for the raw XML", () => {
  const html = render(createElement(XmlStructuredView, { blobUrl: "blob:doc" }));
  assert.ok(!html.includes("<object"), "the whole view must not embed the XML in an <object>");
  assert.ok(!html.includes("<iframe"), "no <iframe> embed");
  assert.ok(!html.includes("_blank"), "no new-tab open");
  assert.ok(html.includes("download="), "the raw XML download link is present");
  assert.ok(html.includes("Parsed fields"), "the parsed-field table remains the primary view");
});
