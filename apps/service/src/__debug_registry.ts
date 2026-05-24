import 'dotenv/config';
import { assertRecipeRegistryMatchesDb, listRecipeIds } from './entities/tier-rankable-types/registry';

(async () => {
    console.log('TS recipes:', listRecipeIds());
    try {
        await assertRecipeRegistryMatchesDb();
        console.log('OK — registry matches DB');
    } catch (err) {
        console.log('ERROR:', err instanceof Error ? err.message : err);
    }
    process.exit(0);
})();
