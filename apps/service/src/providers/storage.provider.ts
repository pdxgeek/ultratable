export interface StorageProvider {
    /**
     * Uploads the given buffer to the storage provider
     * @param bucket The name of the bucket
     * @param path The path/filename within the bucket
     * @param file The blob/buffer to upload
     * @param mimeType The MIME type of the file
     * @param upsert Whether to overwrite if the file exists
     * @returns The public URL of the uploaded file
     */
    upload(bucket: string, path: string, file: Buffer | ArrayBuffer | Blob, mimeType: string, upsert?: boolean): Promise<string>;

    /**
     * Gets the public URL for a given path in a bucket
     */
    getPublicUrl(bucket: string, path: string): string;

    /**
     * Lists files in the specific bucket
     * @param bucket The name of the bucket
     * @param prefix Optional prefix to filter files
     * @returns Array of file paths
     */
    list(bucket: string, prefix?: string): Promise<string[]>;

    /**
     * Deletes files from the specific bucket
     */
    delete(bucket: string, paths: string[]): Promise<void>;
}
