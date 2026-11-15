import * as THREE from 'three';
import { DockingTask } from './dockingTask.js';

const ROTATION_SPEED = 0.01;      // rad por pixel arrastado
const MAX_CARRY_DISTANCE = 2.5;   // distância horizontal máxima (m) do cubo até a câmera
const FOLLOW_SMOOTHING = 0.35;    // 0..1 -> quanto maior, mais "colado" ao centro

export class Teleport extends DockingTask {
    #heldObject = null;

    #raycaster = new THREE.Raycaster();
    #screenCenter = new THREE.Vector2(0, 0);
    #carryPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    #carryPoint = new THREE.Vector3();

    // Estado do toque atual (apenas um dedo é considerado)
    #activePointerId = null;
    #lastX = 0;

    constructor(arSceneInstance, options) {
        super(arSceneInstance, options);

        window.addEventListener('pointerdown', this.#onPointerDown.bind(this));
        window.addEventListener('pointermove', this.#onPointerMove.bind(this));
        window.addEventListener('pointerup', this.#onPointerUp.bind(this));
        window.addEventListener('pointercancel', this.#onPointerUp.bind(this));
    }

    get techniqueName() { return 'teleport'; }

    _onFrame() {
        this.#updateCarriedObject();
    }

    _onNextTarget() {
        this.#heldObject = null;
    }

    _onReset() {
        this.#heldObject = null;
        this.#activePointerId = null;
    }

    #onPointerDown(event) {
        if(!this._enabled) return;
        if (this.#activePointerId !== null || !this._workspacePlaced) return; // Ignores multi-touch

        this.#activePointerId = event.pointerId;
        this.#lastX = event.clientX;

        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        this.#raycaster.setFromCamera(pointer, this._arScene.getCamera());

        if (this.#heldObject) {
            if (this.#raycaster.intersectObject(this.#heldObject).length > 0) {
                const dropped = this.#heldObject;
                this.#heldObject = null;
                this._updateObjectVisual(dropped);
            }
            return;
        }

        // Isn't holding any object
        const intersects = this.#raycaster.intersectObjects(this._selectableObjects);
        if (intersects.length > 0) {
            this.#heldObject = intersects[0].object;
            this._registerSelection(this.#heldObject);
            this._updateObjectVisual(this.#heldObject);
        }
    }

    #onPointerMove(event) {
        if(!this._enabled) return;
        if (event.pointerId !== this.#activePointerId) return;

        if (this.#heldObject) {
            const dx = event.clientX - this.#lastX;
            this.#heldObject.rotation.y += dx * ROTATION_SPEED;
            this._updateObjectVisual(this.#heldObject);
        }

        this.#lastX = event.clientX;
    }

    #onPointerUp(event) {
        if (event.pointerId !== this.#activePointerId) return;
        this.#activePointerId = null;
    }

    #updateCarriedObject() {
        /* Follows the carried object to the center of the screen */
        if (!this.#heldObject || !this._targetObject) return;

        this.#raycaster.setFromCamera(this.#screenCenter, this._arScene.getCamera());

        this.#carryPlane.constant = -this._targetObject.position.y;
        const hit = this.#raycaster.ray.intersectPlane(this.#carryPlane, this.#carryPoint);
        if (!hit) return;

        const origin = this.#raycaster.ray.origin;
        const dx = hit.x - origin.x;
        const dz = hit.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > MAX_CARRY_DISTANCE) {
            const k = MAX_CARRY_DISTANCE / dist;
            hit.x = origin.x + dx * k;
            hit.z = origin.z + dz * k;
        }

        // Segue o centro com leve suavização para reduzir tremor
        this.#heldObject.position.x += (hit.x - this.#heldObject.position.x) * FOLLOW_SMOOTHING;
        this.#heldObject.position.z += (hit.z - this.#heldObject.position.z) * FOLLOW_SMOOTHING;

        this._updateObjectVisual(this.#heldObject);
    }
}