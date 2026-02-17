
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
    private maxConcurrency = 1;
    private maxRetries = 3;
    private backoffMs = 1000; // Starting backoff for 429 errors

    async enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({ task, resolve, reject, retries: 0 });
            this.process();
        });
    }

    private async process() {
        if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift()!;
        this.activeCount++;

        try {
            const result = await item.task();
            item.resolve(result);
        } catch (error: any) {
            const isRateLimit = error.message?.includes('Rate Limit') || error.status === 429;

            if (isRateLimit && item.retries < this.maxRetries) {
                item.retries++;
                const delay = this.backoffMs * Math.pow(2, item.retries - 1);
                console.warn(`Rate limit hit. Retrying task (attempt ${item.retries}) in ${delay}ms...`);

                // Put back in queue and wait
                setTimeout(() => {
                    this.queue.unshift(item);
                    this.process();
                }, delay);
            } else if (item.retries < this.maxRetries && !isRateLimit) {
                // Non-rate limit retry (optional, maybe for transient network errors)
                item.retries++;
                this.queue.push(item);
                console.warn(`Transient error. Retrying task (attempt ${item.retries})...`);
            } else {
                item.reject(error);
            }
        } finally {
            this.activeCount--;
            this.process();
        }
    }
}

export const fetchQueue = new FetchQueue();
