import { useEffect, useState } from 'react';
import { getMockFixtures, getMockTeams } from '../services/mockData';

const SCHEMA_DESCRIPTIONS: Record<string, string> = {
    id: 'Unique identifier for the record',
    name: 'Full name of the team or league',
    shortCode: '3-letter abbreviation (e.g., ARB)',
    venue: 'Stadium name',
    city: 'City where the team is based',
    date: 'Match date in ISO 8601 format (UTC)',
    timestamp: 'Unix timestamp of the match start time',
    status: 'Current status of the match (scheduled, played, postponed)',
    homeGoals: 'Goals scored by home team',
    awayGoals: 'Goals scored by away team',
    round: 'Matchday or round number (e.g., "Regular Season - 1")',
    referee: 'Name of the match official',
    timezone: 'Timezone of the fixture (usually UTC)',
};

function JsonViewer({ data, level = 0 }: { data: any; level?: number }) {
    if (data === null) return <span className="json-null">null</span>;
    if (typeof data !== 'object') {
        const type = typeof data;
        return <span className={`json-${type}`}>{JSON.stringify(data)}</span>;
    }

    const isArray = Array.isArray(data);
    const isEmpty = Object.keys(data).length === 0;

    if (isEmpty) return <span>{isArray ? '[]' : '{}'}</span>;

    return (
        <div className="json-object" style={{ marginLeft: level * 20 }}>
            {isArray ? '[' : '{'}
            <div className="json-content">
                {Object.entries(data).map(([key, value], idx, arr) => (
                    <div key={key} className="json-row">
                        {!isArray && (
                            <span
                                className="json-key"
                                title={SCHEMA_DESCRIPTIONS[key] || ''}
                            >
                                "{key}":
                            </span>
                        )}
                        <JsonViewer data={value} level={level + 1} />
                        {idx < arr.length - 1 && ','}
                    </div>
                ))}
            </div>
            <div style={{ marginLeft: level * 20 }}>{isArray ? ']' : '}'}</div>
        </div>
    );
}

export default function DataPage() {
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        async function loadData() {
            const teams = await getMockTeams();
            const fixtures = await getMockFixtures();
            // Show a sample of data: 1 team, 1 fixture
            setData({
                team: teams[0],
                fixture: fixtures[0],
                // meta: { totalTeams: teams.length, totalFixtures: fixtures.length }
            });
        }
        loadData();
    }, []);

    if (!data) return <div>Loading example data...</div>;

    return (
        <div className="page data-page">
            <h1 className="page__title">Data Schema</h1>
            <p className="page__subtitle">
                Hover over keys to see field descriptions. This is the source of truth for the application's data structure.
            </p>
            <div className="json-container">
                <JsonViewer data={data} />
            </div>
        </div>
    );
}
