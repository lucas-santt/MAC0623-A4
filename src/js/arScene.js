import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

export class ARScene {
    #container; #overlay;
    #camera; #scene; #renderer;

    #objectsSubscribed = [];
    #hitTestSource = null;

    constructor() {
        this.#initiateScene();
    }

    #initiateScene() {
        this.#container = document.createElement( 'div' );
        document.body.appendChild( this.#container );
    
        this.#overlay = document.getElementById('overlay');

        this.#scene = new THREE.Scene();
    
        this.#camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 20 );
    
        const light = new THREE.HemisphereLight( 0xffffff, 0xbbbbff, 3 );
        light.position.set( 0.5, 1, 0.25 );
        this.#scene.add( light );

        this.#renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
        this.#renderer.setPixelRatio( window.devicePixelRatio );
        this.#renderer.setSize( window.innerWidth, window.innerHeight );
        this.#renderer.xr.enabled = true;
        this.#renderer.domElement.style.touchAction = 'none';
        document.body.style.touchAction = 'none';
        this.#container.appendChild( this.#renderer.domElement );

        const arButton = ARButton.createButton(this.#renderer, {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: this.#overlay }
        });
        this.#overlay.appendChild(arButton);

        this.#renderer.xr.addEventListener('sessionend', () => {
            document.body.classList.remove('in-ar');
            this.#overlay.style.display = '';
            for (const object of this.#objectsSubscribed) {
                object.onSessionEnd?.();
            }
        });
        
        window.addEventListener( 'resize', this.#onWindowResize.bind(this) );
        
        this.#startSession();
        this.#renderer.setAnimationLoop( this.#animate.bind(this) );
    }

    #onWindowResize() {
        this.#camera.aspect = window.innerWidth / window.innerHeight;
        this.#camera.updateProjectionMatrix();

        if ( !this.#renderer.xr.isPresenting ) {
            this.#renderer.setSize( window.innerWidth, window.innerHeight );
        }
    }

    #startSession() {
        this.#renderer.xr.addEventListener('sessionstart', async () => {
            document.body.classList.add('in-ar');
            const session = this.#renderer.xr.getSession();

            const viewerSpace = await session.requestReferenceSpace('viewer');
            this.#hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

            session.addEventListener('end', () => {
                this.#hitTestSource?.cancel();
                this.#hitTestSource = null;
            });
        });
    }

    #animate( timestamp, frame ) {
        const referenceSpace = this.#renderer.xr.getReferenceSpace();

        if (frame && referenceSpace) {
            const pose = frame.getViewerPose( referenceSpace );

            if (!pose) {
                for ( const object of this.#objectsSubscribed ) {
                    object.onPoseLost?.();
                }
            } else if (this.#hitTestSource) {
                const hitTestResults = frame.getHitTestResults( this.#hitTestSource );

                if ( hitTestResults.length ) {
                    const hit = hitTestResults[ 0 ];
                    for ( const object of this.#objectsSubscribed ) {
                        object.onSurfaceHit( hit, referenceSpace );
                    }
                } else {
                    for ( const object of this.#objectsSubscribed ) {
                        object.onSurfaceMiss();
                    }
                }
            }
        }

        this.#renderer.render( this.#scene, this.#camera );
    }
    
    getController(index) {
        return this.#renderer.xr.getController( index );
    }

    Add(object) {
        this.#scene.add(object);
    }

    getCamera() {
        return this.#renderer.xr.isPresenting
            ? this.#renderer.xr.getCamera()
            : this.#camera;
    }

    subscribeToHitTest(object) {
        this.#objectsSubscribed.push(object);
    }

    unsubscribeFromHitTest(object) {
        const index = this.#objectsSubscribed.indexOf(object);
        if (index > -1) {
            this.#objectsSubscribed.splice(index, 1);
        }
    }

    getOverlay() {
        return this.#overlay;
    }

    Remove(object) {
        this.#scene.remove(object);
    }
}