import sys
import re

def extract_component(lines, comp_name):
    # Find start and end
    start_idx = -1
    for i, line in enumerate(lines):
        if line.startswith(f"const {comp_name} ="):
            start_idx = i
            break
            
    if start_idx == -1:
        return []
        
    # Count braces
    open_braces = 0
    end_idx = -1
    
    for i in range(start_idx, len(lines)):
        line = lines[i]
        open_braces += line.count('{')
        open_braces -= line.count('}')
        
        if open_braces == 0 and line.startswith('};'):
            end_idx = i
            break
            
    if end_idx == -1:
        # fallback for implicit return without braces
        for i in range(start_idx, len(lines)):
            if lines[i].startswith(');'):
                end_idx = i
                break
                
    if end_idx == -1:
        end_idx = start_idx
        
    extracted = lines[start_idx:end_idx+1]
    
    # Remove from original
    for i in range(start_idx, end_idx+1):
        lines[i] = None
        
    return extracted

def main():
    with open('/Users/dave/workspace/ultratable/apps/admin/src/App.tsx', 'r') as f:
        lines = f.read().splitlines()
        
    components_to_extract = ['WorkersView', 'DashboardView', 'ApiKeyView', 'DatabaseView', 'LeaguesManagementView', 'StatCard']
    
    extracted = {}
    
    for comp in components_to_extract:
        comp_lines = extract_component(lines, comp)
        extracted[comp] = comp_lines

    # Ensure StatCard is in DashboardView, or make it its own file
    # Or just combine StatCard logic into DashboardView? Better keep them separate or put StatCard into StatCard.tsx
    
    # Imports for each:
    imports = "import React, { useState } from 'react';\\nimport { Database, Activity, Key, Globe, LayoutDashboard, CheckCircle2, AlertCircle, Trophy, Play, History, Settings, Loader2 } from 'lucide-react';\\nimport { cn } from '../utils';\\n\\n"
    
    # Write files
    for comp in components_to_extract:
        if extracted[comp]:
            with open(f'/Users/dave/workspace/ultratable/apps/admin/src/components/{comp}.tsx', 'w') as f:
                f.write(imports)
                if comp == 'DashboardView':
                    if extracted.get('StatCard'):
                        f.write('\\n'.join(extracted['StatCard']) + '\\n\\n')
                        # remove from extracted so it doesn't get written twice
                        extracted['StatCard'] = []
                f.write('\\n'.join(extracted[comp]))
                f.write(f'\\n\\nexport default {comp};\\n')
                
    # Also write StatCard if it wasn't swallowed by DashboardView
    if extracted.get('StatCard'):
         with open(f'/Users/dave/workspace/ultratable/apps/admin/src/components/StatCard.tsx', 'w') as f:
             f.write(imports)
             f.write('\\n'.join(extracted['StatCard']))
             f.write(f'\\n\\nexport default StatCard;\\n')

    # Update App.tsx logic
    # Clean up None lines
    lines = [l for l in lines if l is not None]
    
    # Add imports to top of App.tsx
    import_statements = []
    for comp in components_to_extract:
        if comp != 'StatCard':  # StatCard is only used in DashboardView, so App doesn't need it
            import_statements.append(f"import {comp} from './components/{comp}';")
            
    # Find import position
    imp_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('import { LogsView }'):
            imp_idx = i + 1
            break
            
    for imp in import_statements:
        lines.insert(imp_idx, imp)
        imp_idx += 1
        
    with open('/Users/dave/workspace/ultratable/apps/admin/src/App.tsx', 'w') as f:
        f.write('\\n'.join(lines) + '\\n')
        
    print("Done extracting variables.")

if __name__ == '__main__':
    main()
