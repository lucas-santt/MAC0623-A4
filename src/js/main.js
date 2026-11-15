import { ARScene } from './arScene.js';
import { Baseline } from './baseline.js';
import { Teleport } from './teleport.js';
import { Logger } from './logger.js';

function init() {
    const scene = new ARScene();
    const logger = new Logger();

    const options = { enabled: false, uiRoot: scene.getOverlay(), logger };

    const techniques = {
        baseline: new Baseline(scene, options),
        teleport: new Teleport(scene, options),
    };

    const select = document.getElementById('technique-select');

    const applyTechnique = (name) => {
        Object.entries(techniques).forEach(([key, technique]) => {
            technique.setEnabled(key === name);
        });
    };

    select.addEventListener('change', () => applyTechnique(select.value));
    applyTechnique(select.value);

    // Header: baixar CSV (e impedir que toques nele disparem o 'select' do WebXR)
    document.getElementById('download-csv-btn').addEventListener('click', () => logger.download());
    document.querySelector('.app-header').addEventListener('beforexrselect', (e) => e.preventDefault());
}

init();