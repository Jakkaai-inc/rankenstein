// S3-backed image store. Uploads generated image bytes and returns a public
// URL. Uses a dynamic import of @aws-sdk/client-s3 (same pattern as the inbound
// mail handler) so the engine has no hard AWS dependency at import time.
//
// Requires a bucket whose objects are publicly readable (bucket policy or a CDN
// in front). If RANKENSTEIN_IMAGE_BUCKET is unset, callers should skip the store
// and let the image-gen layer inline a data: URL instead.

import type { ImageStore } from '../layers/image-gen';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadS3(): Promise<any | null> {
  try {
    const spec = '@aws-sdk/client-s3';
    return await import(/* webpackIgnore: true */ /* @vite-ignore */ spec);
  } catch {
    return null;
  }
}

export class S3ImageStore implements ImageStore {
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;

  constructor(opts?: { bucket?: string; region?: string; prefix?: string }) {
    const bucket = opts?.bucket ?? process.env.RANKENSTEIN_IMAGE_BUCKET ?? '';
    if (!bucket) throw new Error('RANKENSTEIN_IMAGE_BUCKET is not set');
    this.bucket = bucket;
    this.region = opts?.region ?? process.env.AWS_REGION ?? 'us-east-2';
    this.prefix = opts?.prefix ?? 'generated-images';
  }

  async put(bytes: Uint8Array, mime: string, keyHint: string): Promise<string> {
    const s3 = await loadS3();
    if (!s3) throw new Error('@aws-sdk/client-s3 not installed');
    const ext = EXT[mime] ?? 'png';
    const safeHint = keyHint.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60);
    const key = `${this.prefix}/${safeHint}-${Date.now()}.${ext}`;
    const client = new s3.S3Client({ region: this.region });
    await client.send(
      new s3.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
