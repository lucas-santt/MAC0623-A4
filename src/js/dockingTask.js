import * as THREE from 'three';

const TARGET_SIZE = 0.11;
const TARGET_OPACITY = 0.2;
const CUBE_SIZE = 0.1;
const COLORS = [0xff0000, 0x0000ff, 0xffff00];

const DOCK_POS_TOLERANCE = 0.03;
const DOCK_YAW_TOLERANCE = 0.17;

const NEXT_TARGET_MIN_DISTANCE = 0.25; 
const NEXT_TARGET_MAX_DISTANCE = 0.5;  

export class DockingTask {
    /* Abstract class for different techniques */

    _arScene; _reticle; _enabled;
    _workspacePlaced = false;
    _targetObject = null;
    _selectableObjects = [];
    _nextButton = null;

    _logger; _targetColor = null;
    _trial = null; _trialCount = 0;
    _trackingOk = true;

    constructor(arSceneInstance, { enabled = true, logger = null } = {}) {
        if (new.target === DockingTask) throw new Error('DockingTask é abstrata: use Baseline ou Teleport.');

        this._arScene = arSceneInstance;
        this._enabled = enabled;
        this._logger = logger;

        this._createReticle();
        this._createNextButton();

        const controller = this._arScene.getController(0);
        controller.addEventListener('select', () => this._onSelect());

        window.addEventListener('pointerdown', (e) => this._countTouch(e));
        this._arScene.subscribeToHitTest(this);
    }

    get techniqueName() { return 'unknown'; }
    _onFrame() {}
    _onNextTarget() {}
    _onReset() {}   

    _createReticle() {
        this._reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial()
        );
        this._reticle.matrixAutoUpdate = false;
        this._reticle.visible = false;
        this._arScene.Add(this._reticle);
    }

    _createNextButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'next-target-btn';
        btn.textContent = '→';
        btn.setAttribute('aria-label', 'Próximo target');
        btn.addEventListener('click', () => this._getRandomTarget());
        // impede que o toque no botão dispare o 'select' do WebXR (colocar workspace)
        btn.addEventListener('beforexrselect', (e) => e.preventDefault());

        this._arScene.getOverlay().appendChild(btn);   // <- dentro do overlay
        this._nextButton = btn;
    }

    _onSelect() {
        /* Place workspace if it hasn't been placed yet */
        if (!this._enabled || !this._reticle.visible || this._workspacePlaced) return;

        this._targetObject = new THREE.Mesh(
            new THREE.BoxGeometry(TARGET_SIZE, TARGET_SIZE, TARGET_SIZE),
            new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: TARGET_OPACITY })
        );

        this._reticle.matrix.decompose(this._targetObject.position, new THREE.Quaternion(), new THREE.Vector3());
        this._targetObject.quaternion.identity();
        this._targetObject.rotation.set(0, Math.random() * Math.PI * 2, 0);
        this._targetColor = this._randomColor();
        this._targetObject.material.color.setHex(this._targetColor);
        this._arScene.Add(this._targetObject);

        COLORS.forEach((color) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
                new THREE.MeshPhongMaterial({ color: color })
            );
            mesh.userData.originalColor = color;
            
            this._arScene.Add(mesh);
            this._selectableObjects.push(mesh);
        });

        this._layoutCubes();

        this._workspacePlaced = true;
        this._reticle.visible = false;

        this._startTrial();
    }

    _getRandomTarget() {
        if (!this._targetObject) return;
        this._finishTrial();

        const angle = Math.random() * Math.PI * 2;
        const dist = NEXT_TARGET_MIN_DISTANCE +
            Math.random() * (NEXT_TARGET_MAX_DISTANCE - NEXT_TARGET_MIN_DISTANCE);

        this._targetObject.position.x += Math.cos(angle) * dist;
        this._targetObject.position.z += Math.sin(angle) * dist;
        this._targetObject.rotation.set(0, Math.random() * Math.PI * 2, 0);
        this._targetColor = this._randomColor();
        this._targetObject.material.color.setHex(this._targetColor);

        this._onNextTarget();
        this._layoutCubes();

        this._selectableObjects.forEach((o) => this._updateObjectVisual(o));
    }

    _layoutCubes() {
        this._selectableObjects.forEach((mesh, index) => {
            mesh.position.copy(this._targetObject.position);
            mesh.position.x += (index - 1) * 0.2;
            mesh.position.z += 0.2;
            mesh.rotation.set(0, 0, 0);
        });
    }

    _startTrial() {
        this._trialCount++;
        this._trial = {
            number: this._trialCount,
            selectionStart: null,
            dockedAt: null,
            wrongSelections: 0,
            touchCount: 0,
            trackingLost: 0,
        };
    }

    _isCorrect(object) {
        return object.userData.originalColor === this._targetColor;
    }

    _correctObject() {
        return this._selectableObjects.find((o) => this._isCorrect(o));
    }

    _registerSelection(object) {
        if (!this._trial) return;
        if (this._isCorrect(object)) {
            if (this._trial.selectionStart === null) this._trial.selectionStart = performance.now();
        } else {
            this._trial.wrongSelections++;
        }
    }

    _countTouch(event) {
        if (!this._enabled || !this._trial) return;
        if (event.target.closest?.('button, select, label, .app-header')) return;
        this._trial.touchCount++;
    }

    _reportTracking(ok) {
        if (!ok && this._trackingOk && this._trial) this._trial.trackingLost++;
        this._trackingOk = ok;
    }

    _updateTrialDockState() {
        if (!this._trial) return;
        const correct = this._correctObject();
        const solved = !!correct && this._isSolved(correct);

        if (solved && this._trial.dockedAt === null) {
            this._trial.dockedAt = performance.now();
        } else if (!solved) {
            this._trial.dockedAt = null;
        }
    }

    _finishTrial() {
        const t = this._trial;
        const correct = this._correctObject();
        if (!t || !correct) return;

        const end = t.dockedAt ?? performance.now();
        const start = t.selectionStart ?? end;

        this._logger?.addTrial({
            technique: this.techniqueName,
            trial: t.number,
            completion_time_s: (end - start) / 1000,
            pos_error_cm: this._posError(correct) * 100,
            yaw_error_deg: THREE.MathUtils.radToDeg(this._yawError(correct)),
            wrong_selections: t.wrongSelections,
            touch_count: t.touchCount,
            tracking_lost: t.trackingLost,
        });
    }

    _posError(object) {
        return object.position.distanceTo(this._targetObject.position);
    }

    _yawError(object) {
        const quarter = Math.PI / 2;
        const err = Math.abs(object.rotation.y - this._targetObject.rotation.y) % quarter;
        return Math.min(err, quarter - err);
    }

    _isDocked(object) {
        if (!object || !this._targetObject) return false;
        return this._posError(object) < DOCK_POS_TOLERANCE &&
            this._yawError(object) < DOCK_YAW_TOLERANCE;
    }

    _isSolved(object) {
        return this._isCorrect(object) && this._isDocked(object);
    }

    _updateObjectVisual(object) {
        if (this._isSolved(object)) object.material.color.setHex(0x00ff00);
        else object.material.color.setHex(object.userData.originalColor);

        this._updateTrialDockState();
        this._refreshNextButton();
    }

    _refreshNextButton() {
        const correct = this._correctObject();
        const show = this._enabled && !!correct && this._isSolved(correct);
        this._nextButton.classList.toggle('visible', show);
    }

    _randomColor() {
        return COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    onSurfaceHit(hit, referenceSpace) {
        if(!this._enabled) return;
        this._onFrame();

        if (this._workspacePlaced) return;

        this._reticle.visible = true;
        this._reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
    }

    onSurfaceMiss() {
        if(!this._enabled) return;
        this._onFrame();

        if (this._workspacePlaced) return;

        this._reticle.visible = false;
    }

    onSessionEnd() {
        const objects = [this._targetObject, ...this._selectableObjects];
        objects.forEach((o) => {
            if (!o) return;
            this._arScene.Remove(o);
            o.geometry.dispose();
            o.material.dispose();
        });

        this._targetObject = null;
        this._selectableObjects = [];
        this._workspacePlaced = false;
        this._targetColor = null;
        this._trial = null;
        this._trackingOk = true;
        this._reticle.visible = false;
        this._nextButton.classList.remove('visible');

        this._onReset();
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        if (!enabled) this._reticle.visible = false;
        this._refreshNextButton();
    }

    onPoseLost() {
        if (!this._enabled) return;
        this._reportTracking(false);
    }
}