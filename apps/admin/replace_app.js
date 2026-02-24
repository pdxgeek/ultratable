const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

const b1Start = lines.findIndex(l => l.includes('Box 1: Catalog Browser') && l.includes('section'));
const b2Start = lines.findIndex(l => l.includes('Box 2: Season Importer') && l.includes('section'));
const b3Start = lines.findIndex(l => l.includes('Box 3: Season Configuration') && l.includes('section'));
const logsStart = lines.findIndex(l => l.includes('const LogsView ='));

// Box 1
const b1End = lines.findIndex((l, i) => i > b1Start && l.trim() === '</section>');
// Box 2
const b2End = lines.findIndex((l, i) => i > b2Start && l.trim() === '</section>');
// Box 3
const b3End = lines.findIndex((l, i) => i > b3Start && l.trim() === '</section>');

const newLines = [...lines];

// LogsView
newLines.splice(logsStart, newLines.length - logsStart - 1); // remove LogsView to EOF except last empty line

// Box 3
newLines.splice(b3Start + 1, b3End - b3Start,
`      <LeagueConfig 
        {...{ managedLeagues, selectedConfigLeagueId, setSelectedConfigLeagueId, setConfigTab, configTab, configSeasons, selectedConfigSeasonId, setSelectedConfigSeasonId, syncSeasonData, actionLoading, executions, jobs, promoInput, setPromoInput, playoffInput, setPlayoffInput, relInput, setRelInput, deductions, setDeductions, helperTeamId, setHelperTeamId, configTeams, helperPoints, setHelperPoints, helperReason, setHelperReason, saveConfig }} 
      />`
);

// Box 2
newLines.splice(b2Start + 1, b2End - b2Start,
`      <SeasonImporter 
        {...{ managedLeagues, selectedCatalogLeagueId, setSelectedCatalogLeagueId, catalogLeagueMetadata, seasonsForCatalogLeague, importSeason, removeSeason, actionLoading }} 
      />`
);

// Box 1
newLines.splice(b1Start + 1, b1End - b1Start,
`      <CatalogBrowser 
        {...{ countries, selectedCountry, setSelectedCountry, catalogLeagues, managedLeagues, activateLeague, actionLoading }} 
      />`
);

// Imports
const importIdx = newLines.findIndex(l => l.startsWith('import { GraphicsView }'));
newLines.splice(importIdx + 1, 0, 
  "import { CatalogBrowser } from './components/CatalogBrowser';",
  "import { SeasonImporter } from './components/SeasonImporter';",
  "import { LeagueConfig } from './components/LeagueConfig';",
  "import { LogsView } from './components/LogsView';"
);

fs.writeFileSync('src/App.tsx', newLines.join('\n'));
console.log('Done!');
