import DOMPurify from "dompurify";

// Patch notes are written by whoever publishes a game — i.e. an untrusted
// third party from every other viewer's perspective — and rendered into the
// same webview that holds the Tauri bridge. An unsanitized `innerHTML` here
// would let a malicious publisher run JS with access to Tauri commands in
// every viewer's session, so only a small formatting allowlist passes
// through: no scripts, no event handlers, no links/images that could be
// used for tracking or javascript: URIs.
const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "code",
  "blockquote",
];

export function RichNotes({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  });
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
