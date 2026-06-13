// Pure inbound-email parsing. No AWS, no DB — just bytes in, intent out, so it
// is fully unit-testable. SES inbound writes raw MIME to S3; we read enough of it
// to answer two questions: which piece is this about, and does the reviewer
// approve or want changes?

export interface ParsedInbound {
  from: string;
  subject: string;
  pieceId: string | null;
  /** The reviewer's prose with the quoted reply trail stripped. */
  reply: string;
  intent: "approve" | "feedback" | "unknown";
}

// We tag every outbound subject with [rk:<pieceId>] and reply-to review+<id>@…,
// so the piece id survives the round-trip in any sane mail client.
const PIECE_TAG = /\[rk:([a-z0-9]+)\]/i;
const PLUS_ADDR = /review\+([a-z0-9]+)@/i;
const APPROVE = /\b(i\s+approve|approved|lgtm|looks?\s+good\s+to\s+(?:me|publish)|ship\s+it|publish\s+it)\b/i;
// Approval must LEAD the reply (not be buried in a sentence of feedback).
const APPROVE_LEAD = /^(i\s+approve|approved|approve\b|lgtm|looks?\s+good\s+to\s+(?:me|publish)|ship\s+it|publish\s+it)/i;

export function extractPieceId(...fields: (string | null | undefined)[]): string | null {
  for (const f of fields) {
    if (!f) continue;
    const tag = PIECE_TAG.exec(f) ?? PLUS_ADDR.exec(f);
    if (tag) return tag[1];
  }
  return null;
}

export function classifyIntent(text: string): ParsedInbound["intent"] {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";
  // Decisive only when the approval leads the reply, or the whole reply is just
  // a short approval — otherwise it is feedback that happens to mention approval.
  if (APPROVE_LEAD.test(trimmed)) return "approve";
  if (trimmed.length < 40 && APPROVE.test(trimmed)) return "approve";
  return "feedback";
}

interface RawParts {
  headers: Record<string, string>;
  body: string;
}

function splitHeadersBody(raw: string): RawParts {
  const norm = raw.replace(/\r\n/g, "\n");
  const sep = norm.indexOf("\n\n");
  const headBlock = sep === -1 ? norm : norm.slice(0, sep);
  const body = sep === -1 ? "" : norm.slice(sep + 2);
  const headers: Record<string, string> = {};
  // Unfold continuation lines (leading whitespace) then split on the first colon.
  for (const line of headBlock.replace(/\n[ \t]+/g, " ").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { headers, body };
}

function decodeBody(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? "").toLowerCase();
  if (enc === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") {
    return body
      .replace(/=\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return body;
}

// Pull the text/plain part out of a (possibly multipart) message body.
function extractTextPlain(parts: RawParts): string {
  const ctype = parts.headers["content-type"] ?? "";
  const boundaryMatch = /boundary="?([^";]+)"?/i.exec(ctype);
  if (/multipart\//i.test(ctype) && boundaryMatch) {
    const boundary = boundaryMatch[1];
    const segments = parts.body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    let htmlFallback = "";
    for (const seg of segments) {
      const sub = splitHeadersBody(seg.replace(/^\n+/, ""));
      const subType = sub.headers["content-type"] ?? "";
      if (/multipart\//i.test(subType)) {
        const nested = extractTextPlain(sub);
        if (nested) return nested;
      }
      const decoded = decodeBody(sub.body.trim(), sub.headers["content-transfer-encoding"]);
      if (/text\/plain/i.test(subType)) return decoded;
      if (/text\/html/i.test(subType)) htmlFallback = stripHtml(decoded);
    }
    return htmlFallback;
  }
  const decoded = decodeBody(parts.body, parts.headers["content-transfer-encoding"]);
  return /text\/html/i.test(ctype) ? stripHtml(decoded) : decoded;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

// Drop the quoted reply trail: "On <date>, <name> wrote:" plus all >-prefixed
// lines and forwarded-message markers. What remains is the reviewer's new prose.
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+wrote:\s*$/.test(line)) break;
    if (/^[-]{2,}\s*Original Message|^_{5,}|^\s*From:\s/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function parseInbound(raw: string): ParsedInbound {
  const parts = splitHeadersBody(raw);
  const subject = decodeMimeWord(parts.headers["subject"] ?? "");
  const from = parts.headers["from"] ?? "";
  const text = extractTextPlain(parts);
  const reply = stripQuotedReply(text);
  const pieceId = extractPieceId(subject, parts.headers["to"], parts.headers["delivered-to"], parts.headers["references"], parts.headers["in-reply-to"]);
  return { from, subject, pieceId, reply, intent: classifyIntent(reply) };
}

// Minimal RFC 2047 =?utf-8?...?= decode so [rk:id] survives an encoded subject.
function decodeMimeWord(s: string): string {
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, _cs, enc, data) => {
    if (enc.toLowerCase() === "b") {
      try {
        return Buffer.from(data, "base64").toString("utf8");
      } catch {
        return data;
      }
    }
    return data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16)));
  });
}
