require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    try {
        const { data: existing, error: listError } = await supabase.storage.listBuckets();
        if (listError) {
            console.error('Error listing buckets:', listError);
            process.exit(1);
        }

        const bucketExists = existing.some(b => b.name === 'graphics');

        if (!bucketExists) {
            console.log('Creating public graphics bucket...');
            const { error } = await supabase.storage.createBucket('graphics', { public: true });

            if (error) {
                console.error('Failed to create bucket:', error);
                process.exit(1);
            }
            console.log('Bucket created successfully!');
        } else {
            console.log('Bucket already exists.');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
