// Public Shopify connector API (Lane B). Import surface for routes + integrator:
//
//   import { syncCatalog, publishContentItem, rollbackContentItem } from '@/lib/shopify';

export { shopifyConfig, normalizeShopDomain, SHOPIFY_SCOPES, SHOPIFY_API_VERSION } from "./config";
export {
  signState,
  verifyState,
  buildAuthorizeUrl,
  verifyCallbackHmac,
  exchangeCodeForToken,
} from "./oauth";
export { adminClient, ShopifyApiError } from "./client";
export type { AdminClient } from "./client";
export {
  fetchShopContext,
  saveConnection,
  getConnection,
  requireAdminClient,
} from "./connection";
export { syncCatalog } from "./sync";
export type { SyncResult } from "./sync";
export { publishContentItem, rollbackContentItem } from "./publish";
export type { PublishResult, RollbackResult } from "./publish";
export { getAccountFlexible, requireAccountFlexible } from "./auth";
