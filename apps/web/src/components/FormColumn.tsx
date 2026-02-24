import React from 'react';

interface FormColumnProps {
    form: Array<{ result: 'W' | 'D' | 'L'; fixtureId: string }>;
}

const FormColumn: React.FC<FormColumnProps> = ({ form }) => {
    return (
        <div style={{ display: 'flex', gap: '4px' }}>
            {form.map((entry, idx) => (
                <div
                    key={idx}
                    className={`form-dot ${entry.result}`}
                    title={entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss'}
                >
                    {entry.result}
                </div>
            ))}
        </div>
    );
};

export default FormColumn;
