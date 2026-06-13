import { describe, it, expect } from "vitest";

import { parseInbound, extractPieceId, classifyIntent, stripQuotedReply } from "../parse";
import { processInboundEmail, type InboundStore } from "../inbound";
import { buildPendingReviewEmail } from "../ses";

const RAW_APPROVE = `From: Gev <gb@wizelab.ai>
To: review+cmqcqzovw00049k0phy6xtogf@inbound.rankenstein.app
Subject: Re: [rk:cmqcqzovw00049k0phy6xtogf] Pending review: Spotted Dove
Content-Type: text/plain; charset=UTF-8

I approve

On Fri, Jun 13, 2026 at 9:00 AM Rankenstein <review@rankenstein.app> wrote:
> A product rewrite is ready...
`;

const RAW_FEEDBACK = `From: Gev <gb@wizelab.ai>
Subject: Re: [rk:abc123] Pending review: Damask
Content-Type: text/plain; charset=UTF-8

Please soften the opening line and drop the word "premium".

On Fri, Jun 13, 2026 Rankenstein wrote:
> blah blah
`;

describe("intent + extraction", () => {
  it("pulls the piece id from a subject tag", () => {
    expect(extractPieceId("Re: [rk:xyz789] Pending review")).toBe("xyz789");
  });
  it("pulls the piece id from a plus-address", () => {
    expect(extractPieceId(null, "review+plus42@inbound.rankenstein.app")).toBe("plus42");
  });
  it("classifies approval only when it leads", () => {
    expect(classifyIntent("I approve")).toBe("approve");
    expect(classifyIntent("looks good to publish")).toBe("approve");
    expect(classifyIntent("Please change the intro, otherwise I approve of the direction")).toBe("feedback");
  });
  it("strips the quoted reply trail", () => {
    expect(stripQuotedReply("new note\n\nOn Fri, X wrote:\n> old")).toBe("new note");
  });
});

describe("parseInbound", () => {
  it("parses an approval", () => {
    const p = parseInbound(RAW_APPROVE);
    expect(p.pieceId).toBe("cmqcqzovw00049k0phy6xtogf");
    expect(p.intent).toBe("approve");
    expect(p.reply).toBe("I approve");
  });
  it("parses feedback and drops the quote trail", () => {
    const p = parseInbound(RAW_FEEDBACK);
    expect(p.pieceId).toBe("abc123");
    expect(p.intent).toBe("feedback");
    expect(p.reply).toContain("soften the opening line");
    expect(p.reply).not.toContain("blah");
  });
});

describe("processInboundEmail", () => {
  function fakeStore(status = "PENDING_REVIEW") {
    const calls: string[] = [];
    const store: InboundStore = {
      async findPiece(id) {
        return { id, status };
      },
      async approve(id) {
        calls.push(`approve:${id}`);
      },
      async requestChanges(id, feedback) {
        calls.push(`changes:${id}:${feedback.slice(0, 10)}`);
      },
    };
    return { store, calls };
  }

  it("approves on 'I approve'", async () => {
    const { store, calls } = fakeStore();
    const r = await processInboundEmail(RAW_APPROVE, store);
    expect(r.action).toBe("approved");
    expect(calls[0]).toMatch(/^approve:/);
  });

  it("records feedback otherwise", async () => {
    const { store, calls } = fakeStore();
    const r = await processInboundEmail(RAW_FEEDBACK, store);
    expect(r.action).toBe("feedback");
    expect(calls[0]).toMatch(/^changes:/);
  });

  it("ignores a reply once the piece is published", async () => {
    const { store } = fakeStore("PUBLISHED");
    const r = await processInboundEmail(RAW_APPROVE, store);
    expect(r.action).toBe("ignored");
  });
});

describe("buildPendingReviewEmail", () => {
  it("tags the subject and reply-to with the piece id and links the review", () => {
    const email = buildPendingReviewEmail(
      { id: "pid9", title: "Spotted Dove", primaryKeyword: "snuggle fabric", metaTitle: "T", metaDescription: "D", kind: "PRODUCT_REWRITE" },
      "gb@wizelab.ai",
    );
    expect(email.subject).toContain("[rk:pid9]");
    expect(email.replyTo).toContain("review+pid9@");
    expect(email.html).toContain("/review/pid9"); // fallback path when no slug
    expect(email.text).toContain("I approve");
  });

  it("links the new /r/[slug]/[kind]/[id] route when a slug is provided", () => {
    const product = buildPendingReviewEmail(
      { id: "pid9", title: "Spotted Dove", primaryKeyword: "k", metaTitle: "T", metaDescription: "D", kind: "PRODUCT_REWRITE", slug: "ezfabric" },
      "gb@wizelab.ai",
    );
    expect(product.html).toContain("/r/ezfabric/product/pid9");
    expect(product.text).toContain("/r/ezfabric/product/pid9");

    const article = buildPendingReviewEmail(
      { id: "a1", title: "Guide", primaryKeyword: "k", metaTitle: "T", metaDescription: "D", kind: "ARTICLE", slug: "ezfabric" },
      "gb@wizelab.ai",
    );
    expect(article.html).toContain("/r/ezfabric/article/a1");
  });
});
