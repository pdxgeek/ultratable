
import { gfxRegistry } from './src/services/gfxRegistry';
import { generateGfxPack } from './src/services/dataPacks';
import { Graphic } from './src/types';

const mockTeams = [
    {
        id: '1',
        integrationId: 'team_1',
        commonName: 'Test Team',
        logo: 'http://example.com/logo.png',
        venueImage: 'http://example.com/venue.png',
        shortCode: 'TST',
        venue: 'Test Venue',
        city: 'Test City',
        founded: 2020
    }
];

// 1. Test Generation
console.log('Generating graphics pack...');
const pack = generateGfxPack(mockTeams);
console.log('Generated graphics:', pack.length);

if (pack.length !== 2) {
    console.error('Expected 2 graphics (logo + venue), got', pack.length);
    process.exit(1);
}

const logoGraphic = pack.find(g => g.type === 'team_logo');
if (!logoGraphic || logoGraphic.id !== 'gfx_1_logo') {
    console.error('Logo graphic malformed:', logoGraphic);
} else {
    console.log('Logo graphic generated correctly:', logoGraphic.id);
}

// 2. Test Registration
console.log('Registering batch...');
gfxRegistry.registerBatch(pack);

// 3. Test Lookup
console.log('Testing lookup...');
const foundId = gfxRegistry.findId('team:1', 'team_logo');
if (foundId !== 'gfx_1_logo') {
    console.error('Lookup failed. Expected gfx_1_logo, got', foundId);
} else {
    console.log('Lookup successful:', foundId);
}

// 4. Test Legacy Helper
console.log('Testing getLogo legacy helper...');
// We can't test the actual Blob return without a browser environment/fetch, 
// but we can check if it attempts to resolve. 
// Actually getLogo calls getById which checks blobCache.
// We haven't loaded it yet.
const logoUrl = gfxRegistry.getLogo('1');
if (logoUrl === undefined) {
    console.log('getLogo returned undefined as expected (not loaded yet)');
}

console.log('Verification script completed.');
