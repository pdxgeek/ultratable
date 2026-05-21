import { Client as MinioClient } from 'minio';

import { globalLogger } from '../services/log.service';
import { StorageProvider } from './storage.provider';

const logger = globalLogger.child({ module: 'MinIOStorageProvider' });

// Public-read bucket policy so `getPublicUrl` returns URLs the browser can
// load via plain GET, matching the Supabase public-bucket UX.
function publicReadPolicy(bucket: string): string {
    return JSON.stringify({
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`],
            },
        ],
    });
}

function parseEndpoint(endpoint: string): { endPoint: string; port: number; useSSL: boolean } {
    const url = new URL(endpoint);
    const useSSL = url.protocol === 'https:';
    return {
        endPoint: url.hostname,
        port: url.port ? Number(url.port) : useSSL ? 443 : 80,
        useSSL,
    };
}

export class MinIOStorageProvider implements StorageProvider {
    private readonly client: MinioClient;
    private readonly bucket: string;
    private readonly publicBaseUrl: string;
    private bucketReady: Promise<void> | null = null;

    constructor() {
        const endpoint = process.env.S3_ENDPOINT?.trim();
        const accessKey = process.env.S3_ACCESS_KEY?.trim();
        const secretKey = process.env.S3_SECRET_KEY?.trim();
        const bucket = process.env.S3_BUCKET?.trim();

        if (!endpoint || !accessKey || !secretKey || !bucket) {
            throw new Error(
                'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET must be set for MinIO storage',
            );
        }

        const { endPoint, port, useSSL } = parseEndpoint(endpoint);
        this.client = new MinioClient({
            endPoint,
            port,
            useSSL,
            accessKey,
            secretKey,
            region: process.env.S3_REGION?.trim() || 'us-east-1',
        });
        this.bucket = bucket;
        // S3_PUBLIC_URL lets the operator point getPublicUrl at a different
        // host than the SDK uses (e.g. when the service talks to MinIO via
        // a docker network name but browsers reach it on localhost).
        this.publicBaseUrl = (process.env.S3_PUBLIC_URL?.trim() || endpoint).replace(/\/$/, '');
    }

    private async ensureBucket(): Promise<void> {
        if (this.bucketReady) return this.bucketReady;
        this.bucketReady = (async () => {
            const exists = await this.client.bucketExists(this.bucket);
            if (!exists) {
                await this.client.makeBucket(this.bucket);
                logger.info({ bucket: this.bucket }, 'Created MinIO bucket');
            }
            await this.client.setBucketPolicy(this.bucket, publicReadPolicy(this.bucket));
        })();
        return this.bucketReady;
    }

    async upload(
        bucket: string,
        objectPath: string,
        file: Buffer | ArrayBuffer | Blob,
        mimeType: string,
        upsert: boolean = false,
    ): Promise<string> {
        await this.ensureBucket();

        const buf =
            file instanceof Buffer
                ? file
                : file instanceof ArrayBuffer
                  ? Buffer.from(file)
                  : Buffer.from(await (file as Blob).arrayBuffer());

        if (!upsert) {
            try {
                await this.client.statObject(this.bucket, objectPath);
                // Object exists and upsert=false → mirror Supabase's "already
                // exists" error so callers behave identically across providers.
                throw new Error(`Object already exists: ${bucket}/${objectPath}`);
            } catch (err) {
                const e = err as { code?: string };
                // statObject throws NotFound when the object is absent — that
                // means we're clear to upload. Anything else is a real error.
                if (e.code !== 'NotFound') throw err;
            }
        }

        await this.client.putObject(this.bucket, objectPath, buf, buf.length, {
            'Content-Type': mimeType,
        });

        return this.getPublicUrl(bucket, objectPath);
    }

    getPublicUrl(_bucket: string, objectPath: string): string {
        return `${this.publicBaseUrl}/${this.bucket}/${objectPath}`;
    }

    async list(_bucket: string, prefix?: string): Promise<string[]> {
        await this.ensureBucket();
        const out: string[] = [];
        const stream = this.client.listObjectsV2(this.bucket, prefix ?? '', true);
        for await (const obj of stream) {
            if (obj.name) out.push(obj.name);
        }
        return out;
    }

    async delete(_bucket: string, paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        await this.client.removeObjects(this.bucket, paths);
    }
}
