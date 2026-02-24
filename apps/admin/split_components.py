import re
import os

def main():
    with open('src/App.tsx', 'r') as f:
        content = f.read()

    # Define exact split points
    parts = re.split(r'\nconst (WorkersView|DashboardView|ApiKeyView|DatabaseView|LeaguesManagementView|StatCard) = ', '\n' + content)

    # parts[0] is everything before WorkersView
    app_tsx_top = parts[0].strip('\n')
    
    components = {}
    for i in range(1, len(parts), 2):
        name = parts[i]
        body = parts[i+1]
        
        # Last part (StatCard) might end with "export default App;"
        if name == 'StatCard':
            body_parts = body.split('\nexport default App;')
            components[name] = body_parts[0].rstrip()
            app_tsx_bottom = '\nexport default App;\n' + (body_parts[1] if len(body_parts)>1 else '')
        else:
            components[name] = body.rstrip()

    # Common imports
    common_imports = """import React, { useState, useEffect } from 'react';
import { Database, Activity, Key, Globe, LayoutDashboard, CheckCircle2, AlertCircle, Trophy, Play, History, Settings, Loader2, RefreshCw, Image as ImageIcon, X, Calendar } from 'lucide-react';
import { cn } from '../utils';

"""

    # DashboardView needs StatCard imported
    # LeaguesManagementView needs CatalogBrowser, SeasonImporter, LeagueConfig
    
    for name, body in components.items():
        imports = common_imports
        if name == 'DashboardView':
            imports += "import StatCard from './StatCard';\n\n"
            imports += "interface ConfigStatus {\n  isDatabaseConnected: boolean;\n  apiFootballKeyMasked: string | null;\n  databaseUrlMasked: string | null;\n  supabaseUrlMasked: string | null;\n  supabaseAnonKeyMasked: string | null;\n}\n\n"
        if name == 'DatabaseView':
            imports += "interface ConfigStatus {\n  isDatabaseConnected: boolean;\n  apiFootballKeyMasked: string | null;\n  databaseUrlMasked: string | null;\n  supabaseUrlMasked: string | null;\n  supabaseAnonKeyMasked: string | null;\n}\n\n"
        elif name == 'LeaguesManagementView':
            imports += "import { CatalogBrowser } from './CatalogBrowser';\nimport { SeasonImporter } from './SeasonImporter';\nimport { LeagueConfig } from './LeagueConfig';\n\n"

        file_content = imports + f"const {name} = " + body + f"\n\nexport default {name};\n"
        with open(f"src/components/{name}.tsx", "w") as f:
            f.write(file_content)

    # Update App.tsx
    # We need to add imports to App.tsx for these new components
    imports_to_add = """
import WorkersView from './components/WorkersView';
import DashboardView from './components/DashboardView';
import ApiKeyView from './components/ApiKeyView';
import DatabaseView from './components/DatabaseView';
import LeaguesManagementView from './components/LeaguesManagementView';
"""

    import_split = re.split(r'(type Tab = )', app_tsx_top)
    new_app = import_split[0] + imports_to_add + import_split[1] + import_split[2] + app_tsx_bottom
    
    with open('src/App.tsx', 'w') as f:
        f.write(new_app)

if __name__ == '__main__':
    main()
