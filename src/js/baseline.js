import * as THREE from 'three';
import { DockingTask } from './dockingTask.js';

export class Baseline extends DockingTask {
    #selectedObject = null;

    #raycaster = new THREE.Raycaster();
    #pointers = new Map();
    #previousTouchAngle = 0;

    constructor(arSceneInstance, options) {
        super(arSceneInstance, options);

        window.addEventListener('pointerdown', this.#onPointerDown.bind(this));
        window.addEventListener('pointermove', this.#onPointerMove.bind(this));
        window.addEventListener('pointerup', this.#onPointerUp.bind(this));
        window.addEventListener('pointercancel', this.#onPointerUp.bind(this));
    }

    get techniqueName() { return 'baseline'; }

    _onReset() {
        this.#selectedObject = null;
        this.#pointers.clear();
    }

    #onPointerDown(event) {
        if(!this._enabled) return;
        if(!this._workspacePlaced) return;
        this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        
        if (this.#pointers.size === 1 && !this.#selectedObject) {
            // One finger -> select object
            const pointer = new THREE.Vector2();
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

            this.#raycaster.setFromCamera(pointer, this._arScene.getCamera());
            const intersects = this.#raycaster.intersectObjects(this._selectableObjects);

            if (intersects.length > 0) {
                this.#selectedObject = intersects[0].object;
                this._registerSelection(this.#selectedObject);
                this._updateObjectVisual(this.#selectedObject);
            }
        } else if (this.#pointers.size === 2 && this.#selectedObject) {
            // Two fingers -> rotation
            const points = Array.from(this.#pointers.values());
            this.#previousTouchAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
        }
    }

    #onPointerMove(event) {
        if(!this._enabled) return;
        if (!this.#pointers.has(event.pointerId)) return;
        this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (!this.#selectedObject) return;

        if (this.#pointers.size === 1) {
            // Moves selected object
            const pointer = new THREE.Vector2();
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

            this.#raycaster.setFromCamera(pointer, this._arScene.getCamera());

            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._targetObject.position.y);
            const intersectPoint = new THREE.Vector3();
            const hitPoint = this.#raycaster.ray.intersectPlane(plane, intersectPoint);

            if (hitPoint) {
                this.#selectedObject.position.x = hitPoint.x;
                this.#selectedObject.position.z = hitPoint.z;
            }
        } else if (this.#pointers.size === 2) {
            // Rotates selected object
            const points = Array.from(this.#pointers.values());
            const currAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);

            this.#selectedObject.rotation.y += currAngle - this.#previousTouchAngle;
            this.#previousTouchAngle = currAngle;
        }

        this._updateObjectVisual(this.#selectedObject);
    }

    #onPointerUp(event) {
        this.#pointers.delete(event.pointerId);

        if (this.#pointers.size === 0 && this.#selectedObject) {
            const released = this.#selectedObject;
            this.#selectedObject = null;
            this._updateObjectVisual(released);
        }
    }
}