// Generic quota tracking system for different integrations and endpoints

interface QuotaData {
    date: string; // YYYY-MM-DD
    count: number;
}

interface QuotaConfig {
    key: string; // Storage key
    dailyLimit: number;
}

export class QuotaTracker {
    private config: QuotaConfig;

    constructor(config: QuotaConfig) {
        this.config = config;
    }

    private getQuota(): QuotaData {
        try {
            const raw = localStorage.getItem(this.config.key);
            if (!raw) return { date: this.getCurrentDate(), count: 0 };
            return JSON.parse(raw);
        } catch {
            return { date: this.getCurrentDate(), count: 0 };
        }
    }

    private getCurrentDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Try to increment the quota. Returns true if successful, false if limit exceeded.
     */
    increment(): boolean {
        const today = this.getCurrentDate();
        const quota = this.getQuota();

        // Reset if new day
        if (quota.date !== today) {
            quota.date = today;
            quota.count = 0;
        }

        // Check limit
        if (quota.count >= this.config.dailyLimit) {
            console.warn(`Quota exceeded for ${this.config.key}: ${quota.count}/${this.config.dailyLimit}`);
            return false;
        }

        quota.count++;
        localStorage.setItem(this.config.key, JSON.stringify(quota));
        return true;
    }

    /**
     * Get current quota status
     */
    getStatus(): { used: number; limit: number; remaining: number } {
        const quota = this.getQuota();
        const today = this.getCurrentDate();
        const used = quota.date === today ? quota.count : 0;
        return {
            used,
            limit: this.config.dailyLimit,
            remaining: this.config.dailyLimit - used,
        };
    }

    /**
     * Reset quota (useful for testing or manual reset)
     */
    reset(): void {
        localStorage.removeItem(this.config.key);
    }
}

// Pre-configured quota trackers for different integrations
export const quotaTrackers = {
    'api-football-players': new QuotaTracker({
        key: 'ut_quota_api_football_players',
        dailyLimit: 1000,
    }),
    // Add more as needed:
    // 'api-football-fixtures': new QuotaTracker({ key: 'ut_quota_api_football_fixtures', dailyLimit: 500 }),
    // 'some-other-api-teams': new QuotaTracker({ key: 'ut_quota_other_api_teams', dailyLimit: 200 }),
};
