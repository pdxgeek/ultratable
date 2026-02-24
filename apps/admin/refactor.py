import sys

def main():
    with open('/Users/dave/workspace/ultratable/apps/admin/src/App.tsx', 'r') as f:
        lines = f.read().splitlines()

    start_idx = -1
    end_idx = -1

    for i, line in enumerate(lines):
        if '      {/* Box 1: Catalog Browser */}' in line:
            start_idx = i
            break

    for i in range(start_idx, len(lines)):
        if '    </div>' in line and lines[i] == '    </div>' and lines[i-1] == '      </section>':
            # Wait, easier to search for the end of Box 3
            pass

    # Actually let's just find the indices for Box 1, 2, 3
    b1 = lines.index('      {/* Box 1: Catalog Browser */}')
    b2 = lines.index('      {/* Box 2: Catalog Seasons */}')
    b3 = lines.index('      {/* Box 3: Season Configuration */}')
    
    # end of Box 3 is the next </section> after b3
    b3_end = -1
    for i in range(b3, len(lines)):
        if lines[i] == '      </section>':
            b3_end = i
            break

    new_lines = lines[:b1]
    
    components = [
        "      {/* Box 1: Catalog Browser */}",
        "      <CatalogBrowser",
        "        countries={countries}",
        "        selectedCountry={selectedCountry}",
        "        setSelectedCountry={setSelectedCountry}",
        "        catalogLeagues={catalogLeagues}",
        "        managedLeagues={managedLeagues}",
        "        activateLeague={activateLeague}",
        "        actionLoading={actionLoading}",
        "      />",
        "",
        "      {/* Box 2: Catalog Seasons */}",
        "      <SeasonImporter",
        "        managedLeagues={managedLeagues}",
        "        selectedCatalogLeagueId={selectedCatalogLeagueId}",
        "        setSelectedCatalogLeagueId={setSelectedCatalogLeagueId}",
        "        catalogLeagueMetadata={catalogLeagueMetadata}",
        "        seasonsForCatalogLeague={seasonsForCatalogLeague}",
        "        importSeason={importSeason}",
        "        removeSeason={removeSeason}",
        "        actionLoading={actionLoading}",
        "      />",
        "",
        "      {/* Box 3: Season Configuration */}",
        "      <LeagueConfig",
        "        managedLeagues={managedLeagues}",
        "        selectedConfigLeagueId={selectedConfigLeagueId}",
        "        setSelectedConfigLeagueId={setSelectedConfigLeagueId}",
        "        setConfigTab={setConfigTab}",
        "        configTab={configTab}",
        "        configSeasons={configSeasons}",
        "        selectedConfigSeasonId={selectedConfigSeasonId}",
        "        setSelectedConfigSeasonId={setSelectedConfigSeasonId}",
        "        syncSeasonData={syncSeasonData}",
        "        actionLoading={actionLoading}",
        "        executions={executions}",
        "        jobs={jobs}",
        "        promoInput={promoInput}",
        "        setPromoInput={setPromoInput}",
        "        playoffInput={playoffInput}",
        "        setPlayoffInput={setPlayoffInput}",
        "        relInput={relInput}",
        "        setRelInput={setRelInput}",
        "        deductions={deductions}",
        "        setDeductions={setDeductions}",
        "        helperTeamId={helperTeamId}",
        "        setHelperTeamId={setHelperTeamId}",
        "        configTeams={configTeams}",
        "        helperPoints={helperPoints}",
        "        setHelperPoints={setHelperPoints}",
        "        helperReason={helperReason}",
        "        setHelperReason={setHelperReason}",
        "        saveConfig={saveConfig}",
        "      />",
    ]
    
    new_lines.extend(components)
    new_lines.extend(lines[b3_end + 1:])
    
    with open('/Users/dave/workspace/ultratable/apps/admin/src/App.tsx', 'w') as f:
        f.write('\\n'.join(new_lines) + '\\n')
    
    print("Done refactoring App.tsx")

if __name__ == '__main__':
    main()
