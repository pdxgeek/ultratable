
interface QueueItem<T> {
    task: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
    retries: number;
    lastError?: any;
}

class FetchQueue {
    private queue: QueueItem<any>[] = [];
    private activeCount = 0;
    private maxConcurrency = 3;
    private maxRetries = 3;
    private backoffMs = 1000;

    private totalQueued = 0;
    private totalFinished = 0;
    private listeners: Set<(stats: { queued: number, active: number, finished: number }) => void> = new Set();
    private inflight: Map<string, Promise<any>> = new Map();

    async enqueue<T>(task: () => Promise<T>, key?: string): Promise<T> {
        if (key && this.inflight.has(key)) {
            return this.inflight.get(key)!;
        }

        const promise = new Promise<T>((resolve, reject) => {
            this.totalQueued++;
            this.queue.push({ task, resolve, reject, retries: 0 });
            this.notifyListeners();
            this.process();
        });

        if (key) {
            this.inflight.set(key, promise);
            // Cleanup inflight when done
            promise.finally(() => this.inflight.delete(key));
        }

        return promise;
    }

    private notifyListeners() {
        const stats = {
            queued: this.queue.length,
            active: this.activeCount,
            finished: this.totalFinished
        };
        this.listeners.forEach(l => l(stats));
    }

    subscribe(callback: (stats: { queued: number, active: number, finished: number }) => void): () => void {
        this.listeners.add(callback);
        callback({
            queued: this.queue.length,
            active: this.activeCount,
            finished: this.totalFinished
        });
        return () => this.listeners.delete(callback);
    }

    private async process() {
        if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift()!;
        this.activeCount++;
        this.notifyListeners();

        try {
            const result = await item.task();
            item.resolve(result);
            this.totalFinished++;
        } catch (error: any) {
            const isRateLimit = error.message?.includes('Rate Limit') || error.status === 429;

            if (isRateLimit && item.retries < this.maxRetries) {
                item.retries++;
                const delay = this.backoffMs * Math.pow(2, item.retries - 1);
                console.warn(`Rate limit hit. Retrying task (attempt ${item.retries}) in ${delay}ms...`);

                setTimeout(() => {
                    this.queue.unshift(item);
                    this.process();
                }, delay);
            } else {
                // Fail immediately for non-rate-limit errors or if max retries reached
                if (!isRateLimit) {
                    console.error('API Fetch failed with non-retryable error:', error);
                }
                item.reject(error);
                this.totalFinished++;
            }
        } finally {
            this.activeCount--;
            this.notifyListeners();
            this.process();
        }
    }
}

export const fetchQueue = new FetchQueue();
