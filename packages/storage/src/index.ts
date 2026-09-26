import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createAnonymousStorageClient(config: Pick<StorageConfig, "endpoint" | "region">): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: "anonymous",
      secretAccessKey: "anonymous",
    },
  });
}

export async function putPrivateObject(client: S3Client, bucket: string, key: string, body: Uint8Array): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
}

export async function readPrivateObject(client: S3Client, bucket: string, key: string): Promise<Uint8Array> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error("Objet S3 vide.");
  }
  return bytes;
}

export async function bucketIsReachable(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

/** HeadBucket ne prouve pas les volumes SeaweedFS : le filer répond avant le heartbeat. */
export async function storageServesPrivateObjects(client: S3Client, bucket: string): Promise<boolean> {
  try {
    if (!(await bucketIsReachable(client, bucket))) {
      return false;
    }
    const key = ".cercle-health/ready";
    const payload = new TextEncoder().encode("ready");
    await putPrivateObject(client, bucket, key, payload);
    const read = await readPrivateObject(client, bucket, key);
    return Buffer.from(read).toString() === "ready";
  } catch {
    return false;
  }
}

export async function waitUntilPrivateObjectReadable(
  config: StorageConfig,
  key: string,
  options: { timeoutMs?: number } = {},
): Promise<S3Client> {
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = createStorageClient(config);
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      const body = await readPrivateObject(client, config.bucket, key);
      if (body.length === 0) {
        throw new Error("Objet S3 vide après redémarrage.");
      }
      return client;
    } catch (error) {
      lastError = error;
      client.destroy();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("SeaweedFS n’a pas rendu l’objet après redémarrage.");
}

export async function signReadUrl(client: S3Client, bucket: string, key: string, expiresInSeconds: number): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}
