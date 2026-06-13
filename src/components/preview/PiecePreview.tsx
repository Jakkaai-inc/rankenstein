"use client";

// The review canvas. Renders a piece the way it will publish, and turns any
// selection into an anchored comment — pin a field, highlight a span and type,
// or highlight a span and SPEAK (Web Speech API). Each comment becomes a Comment
// row via the injected server action; the offsets are computed against the same
// textContent the server re-anchors against (see ../anchor.ts).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CommentAnchor, ReviewComment } from "@/types/contracts";
import { resolveAnchor } from "./anchor";

export interface PiecePreviewMeta {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
}

export type NewCommentInput = {
  pieceId: string;
  version: number;
  anchor: CommentAnchor;
  body: string;
  modality: "text" | "voice";
};

interface Props {
  pieceId: string;
  version: number;
  html: string;
  meta: PiecePreviewMeta;
  comments: ReviewComment[];
  addComment: (input: NewCommentInput) => Promise<void>;
  readOnly?: boolean;
}

// Plain-text offsets of a DOM range relative to a container's textContent — the
// projection ../anchor.ts#htmlToText reproduces server-side.
function rangeOffset(container: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let cur: Node | null = walker.nextNode();
  while (cur) {
    if (cur === node) return total + offset;
    total += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return total;
}

interface Draft {
  anchor: CommentAnchor;
  label: string;
  x: number;
  y: number;
}

export default function PiecePreview({ pieceId, version, html, meta, comments, addComment, readOnly }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [modality, setModality] = useState<"text" | "voice">("text");
  const [listening, setListening] = useState(false);
  const recogRef = useRef<unknown>(null);

  const voiceSupported = useMemo(
    () => typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition),
    [],
  );

  // Re-anchor existing span comments so the sidebar can quote them against the
  // current draft (and reveal any that no longer anchor). Captured after mount,
  // when the rendered body has real textContent.
  const [plainText, setPlainText] = useState("");
  useEffect(() => setPlainText(bodyRef.current?.textContent ?? ""), [html]);

  const openSpanDraft = useCallback(() => {
    if (readOnly) return;
    const sel = window.getSelection();
    const container = bodyRef.current;
    if (!sel || sel.isCollapsed || !container || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const start = rangeOffset(container, range.startContainer, range.startOffset);
    const end = rangeOffset(container, range.endContainer, range.endOffset);
    const quote = sel.toString();
    if (!quote.trim()) return;
    const rect = range.getBoundingClientRect();
    setDraft({
      anchor: { mode: "span", textQuote: quote, startOffset: Math.min(start, end), endOffset: Math.max(start, end) },
      label: `“${quote.length > 48 ? quote.slice(0, 47) + "…" : quote}”`,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 6,
    });
    setBody("");
    setModality("text");
  }, [readOnly]);

  const openFieldDraft = useCallback(
    (field: keyof PiecePreviewMeta, value: string, ev: React.MouseEvent) => {
      if (readOnly) return;
      setDraft({
        anchor: { mode: "global", selector: `field:${field}`, textQuote: value },
        label: `${field}`,
        x: ev.clientX + window.scrollX,
        y: ev.clientY + window.scrollY + 6,
      });
      setBody("");
      setModality("text");
    },
    [readOnly],
  );

  const startVoice = useCallback(() => {
    const Ctor = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!Ctor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recog: any = new (Ctor as any)();
    recog.lang = "en-US";
    recog.interimResults = true;
    recog.continuous = true;
    let finalText = body ? body + " " : "";
    recog.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setBody((finalText + interim).trimStart());
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
    setModality("voice");
  }, [body]);

  const stopVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (recogRef.current as any)?.stop?.();
    setListening(false);
  }, []);

  useEffect(() => () => stopVoice(), [stopVoice]);

  const submit = useCallback(() => {
    if (!draft || !body.trim()) return;
    const input: NewCommentInput = { pieceId, version, anchor: draft.anchor, body: body.trim(), modality };
    startTransition(async () => {
      await addComment(input);
      setDraft(null);
      setBody("");
      stopVoice();
      router.refresh();
    });
  }, [draft, body, modality, pieceId, version, addComment, router, stopVoice]);

  const spanComments = comments.filter((c) => c.anchor.mode === "span");
  const fieldComments = comments.filter((c) => c.anchor.mode === "global");

  return (
    <div className="rk-review grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <style>{PIECE_CSS}</style>

      <div>
        {/* Pinned, commentable meta fields */}
        <div className="rk-meta">
          {(["metaTitle", "metaDescription", "slug", "primaryKeyword"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="rk-field"
              disabled={readOnly}
              onClick={(e) => openFieldDraft(f, meta[f], e)}
              title="Pin a comment to this field"
            >
              <span className="rk-field-label">{f}</span>
              <span className="rk-field-value">{meta[f] || "—"}</span>
            </button>
          ))}
        </div>

        {/* The piece, as it will publish. Select text to comment. */}
        <div className="rk-piece-frame">
          <div className="rk-piece-hint">{readOnly ? "Read-only preview" : "Select any text to leave a comment, or use voice."}</div>
          <article ref={bodyRef} className="rk-piece" onMouseUp={openSpanDraft} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      {/* Comment rail */}
      <aside className="rk-rail">
        <h3 className="rk-rail-h">Comments ({comments.length})</h3>
        {comments.length === 0 && <p className="rk-empty">No comments yet. Highlight a span or pin a field.</p>}

        {spanComments.length > 0 && <div className="rk-rail-sec">On the copy</div>}
        {spanComments.map((c) => {
          const re = resolveAnchor(plainText, c.anchor);
          const lost = !re && !!c.anchor.textQuote;
          return (
            <div key={c.id} className={`rk-card ${c.modality === "voice" ? "voice" : ""}`}>
              <div className="rk-quote">{c.anchor.textQuote ? `“${c.anchor.textQuote}”` : "(span)"}{lost && <span className="rk-lost"> moved/edited</span>}</div>
              <div className="rk-body">{c.modality === "voice" ? "🎤 " : ""}{c.body}</div>
            </div>
          );
        })}

        {fieldComments.length > 0 && <div className="rk-rail-sec">On the metadata</div>}
        {fieldComments.map((c) => (
          <div key={c.id} className="rk-card">
            <div className="rk-quote">{c.anchor.selector?.replace("field:", "") ?? "general"}</div>
            <div className="rk-body">{c.modality === "voice" ? "🎤 " : ""}{c.body}</div>
          </div>
        ))}
      </aside>

      {/* Floating composer */}
      {draft && (
        <div className="rk-composer" style={{ left: Math.min(draft.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 320), top: draft.y }}>
          <div className="rk-composer-anchor">{draft.label}</div>
          <textarea
            className="rk-composer-text"
            value={body}
            placeholder="What should change here? (no fabricated facts)"
            autoFocus
            onChange={(e) => {
              setBody(e.target.value);
              if (modality === "voice" && !listening) setModality("text");
            }}
          />
          <div className="rk-composer-actions">
            {voiceSupported &&
              (listening ? (
                <button type="button" className="rk-btn rk-rec" onClick={stopVoice}>■ Stop</button>
              ) : (
                <button type="button" className="rk-btn rk-voice" onClick={startVoice}>🎤 Speak</button>
              ))}
            <span className="rk-spacer" />
            <button type="button" className="rk-btn rk-ghost" onClick={() => { setDraft(null); stopVoice(); }}>Cancel</button>
            <button type="button" className="rk-btn rk-primary" disabled={!body.trim() || pending} onClick={submit}>
              {pending ? "Saving…" : "Add comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Scoped styling. The .rk-piece block mirrors the engine preview chrome
// (hyphens only — em-dash rule applies to UI), so the canvas reads like the
// published page.
const PIECE_CSS = `
.rk-review{--ink:#1a1a1a;--mut:#6b6b6b;--line:#e6e3dd;--accent:#b5651d;--good:#2e7d32;}
.rk-meta{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.rk-field{display:flex;gap:10px;align-items:baseline;text-align:left;background:#faf9f6;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;transition:border-color .12s}
.rk-field:hover:not(:disabled){border-color:var(--accent)}
.rk-field:disabled{cursor:default;opacity:.8}
.rk-field-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);min-width:120px}
.rk-field-value{font-size:14px;color:var(--ink)}
.rk-piece-frame{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.rk-piece-hint{font-size:12px;color:var(--mut);background:#faf9f6;border-bottom:1px solid var(--line);padding:8px 18px}
.rk-piece{padding:8px 26px 26px;color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.rk-piece h1{font-size:25px;margin:18px 0 6px}
.rk-piece h2{font-size:19px;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}
.rk-piece h3{font-size:16px;margin:18px 0 6px}
.rk-piece p{margin:10px 0}
.rk-piece table{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0}
.rk-piece th,.rk-piece td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
.rk-piece ul,.rk-piece ol{margin:10px 0;padding-left:22px}
.rk-piece ::selection{background:#f6e2cd}
.rk-rail{align-self:start;position:sticky;top:16px}
.rk-rail-h{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:0 0 10px}
.rk-rail-sec{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9a9a9a;margin:14px 0 6px}
.rk-empty{font-size:13px;color:var(--mut)}
.rk-card{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:8px 11px;margin-bottom:8px;background:#fff}
.rk-card.voice{border-left-color:#5b3fa0}
.rk-quote{font-size:12px;color:var(--mut);font-style:italic;margin-bottom:3px}
.rk-lost{color:var(--accent);font-style:normal;font-weight:600}
.rk-body{font-size:14px;color:var(--ink);white-space:pre-wrap}
.rk-composer{position:absolute;z-index:50;width:300px;background:#fff;border:1px solid #d9d4ca;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.16);padding:10px}
.rk-composer-anchor{font-size:12px;color:var(--mut);font-style:italic;margin-bottom:6px;max-height:34px;overflow:hidden}
.rk-composer-text{width:100%;min-height:62px;border:1px solid var(--line);border-radius:7px;padding:7px 9px;font:14px/1.5 inherit;resize:vertical;box-sizing:border-box}
.rk-composer-actions{display:flex;align-items:center;gap:7px;margin-top:8px}
.rk-spacer{flex:1}
.rk-btn{border-radius:7px;padding:6px 11px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent}
.rk-primary{background:var(--accent);color:#fff}
.rk-primary:disabled{opacity:.5;cursor:default}
.rk-ghost{background:#fff;border-color:var(--line);color:#4a4a4a}
.rk-voice{background:#efe9f7;color:#5b3fa0;border-color:#d9cdee}
.rk-rec{background:#fbe5e3;color:#b3261e;border-color:#f0c4bf;animation:rkpulse 1.1s infinite}
@keyframes rkpulse{0%,100%{opacity:1}50%{opacity:.55}}
@media(max-width:1024px){.rk-rail{position:static}}
`;
