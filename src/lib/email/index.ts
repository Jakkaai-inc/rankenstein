// Email surface for the review loop (Lane D).
//   import { sendPendingReviewEmail, processInboundFromS3 } from "@/lib/email";

export {
  buildPendingReviewEmail,
  sendPendingReviewEmail,
  replyAddress,
  type PendingReviewPiece,
  type BuiltEmail,
  type SendResult,
} from "./ses";

export {
  processInboundEmail,
  processInboundFromS3,
  fetchInboundObject,
  prismaInboundStore,
  type InboundResult,
  type InboundStore,
} from "./inbound";

export { parseInbound, extractPieceId, classifyIntent, stripQuotedReply, type ParsedInbound } from "./parse";
