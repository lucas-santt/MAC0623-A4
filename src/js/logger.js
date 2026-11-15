const COLUMNS = [
    'participant_id',
    'technique',
    'trial',
    'completion_time_s',
    'pos_error_cm',
    'yaw_error_deg',
    'wrong_selections',
    'touch_count',
    'tracking_lost',
];

const FORMATTERS = {
    completion_time_s: (v) => v.toFixed(3),
    pos_error_cm: (v) => v.toFixed(2),
    yaw_error_deg: (v) => v.toFixed(2),
};

function escapeCsv(value) {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class Logger {
    #participantId;
    #rows = [];

    constructor() {
        this.#participantId = 'P-' + Math.random().toString(36).slice(2, 8);
    }

    get participantId() {
        return this.#participantId;
    }

    setParticipantId(id) {
        this.#participantId = String(id);
    }

    addTrial(trial) {
        this.#rows.push({ participant_id: this.#participantId, ...trial });
    }

    toCSV() {
        const lines = [COLUMNS.join(',')];

        for (const row of this.#rows) {
            lines.push(
                COLUMNS.map((col) => {
                    const format = FORMATTERS[col];
                    const value = row[col];
                    return escapeCsv(format && typeof value === 'number' ? format(value) : value);
                }).join(',')
            );
        }

        return lines.join('\n');
    }

    download() {
        const blob = new Blob([this.toCSV()], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `experiment_${this.#participantId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}