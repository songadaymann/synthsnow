import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();
    }

    async init() {
        const canvas = document.getElementById('three-canvas');

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a1628);
        this.scene.fog = new THREE.Fog(0x0a1628, 30, 120);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(-31.91, 23.62, 37.31);
        this.camera.lookAt(4.13, 17.14, -3.34);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(4.13, 17.14, -3.34);
        this.controls.maxPolarAngle = Math.PI / 2 + 0.3;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 100;  // Allow zooming out much further

        // Log camera values when user stops moving (for finding good defaults)
        this.controls.addEventListener('end', () => {
            console.log('--- Camera Values ---');
            console.log(`Position: (${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})`);
            console.log(`Target: (${this.controls.target.x.toFixed(2)}, ${this.controls.target.y.toFixed(2)}, ${this.controls.target.z.toFixed(2)})`);
            console.log(`Distance: ${this.camera.position.distanceTo(this.controls.target).toFixed(2)}`);
        });

        // Lighting
        this.setupLighting();

        // Ground
        this.setupGround();

        // Ambient snow particles
        this.setupAmbientSnow();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient light - cold blue tint
        const ambientLight = new THREE.AmbientLight(0x4466aa, 0.4);
        this.scene.add(ambientLight);

        // Main directional light - moonlight
        const moonLight = new THREE.DirectionalLight(0xaaccff, 0.8);
        moonLight.position.set(10, 20, 10);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 2048;
        moonLight.shadow.mapSize.height = 2048;
        moonLight.shadow.camera.near = 1;
        moonLight.shadow.camera.far = 50;
        moonLight.shadow.camera.left = -20;
        moonLight.shadow.camera.right = 20;
        moonLight.shadow.camera.top = 20;
        moonLight.shadow.camera.bottom = -20;
        this.scene.add(moonLight);

        // Subtle warm fill light from below
        const fillLight = new THREE.DirectionalLight(0x4ecca3, 0.2);
        fillLight.position.set(-5, 2, -5);
        this.scene.add(fillLight);

        // Point light for tree highlight
        const treeLight = new THREE.PointLight(0x4ecca3, 0.5, 20);
        treeLight.position.set(0, 5, 5);
        this.scene.add(treeLight);
    }

    setupGround() {
        // Snow ground - large enough to not see edges
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xddeeff,
            roughness: 0.9,
            metalness: 0.0
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    setupAmbientSnow() {
        // Falling snow particles in background - wide spread to cover full camera view
        const particleCount = 3000;
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount);

        // Spread snow over a much larger area to cover all camera angles
        const spreadX = 200;
        const spreadZ = 200;
        const height = 50;

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * spreadX;
            positions[i * 3 + 1] = Math.random() * height;
            positions[i * 3 + 2] = (Math.random() - 0.5) * spreadZ;
            velocities[i] = 0.02 + Math.random() * 0.03;
        }

        // Store spread values for reset
        this.snowSpreadX = spreadX;
        this.snowSpreadZ = spreadZ;
        this.snowHeight = height;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.15,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });

        this.ambientSnow = new THREE.Points(geometry, material);
        this.ambientSnowVelocities = velocities;
        this.scene.add(this.ambientSnow);
    }

    update() {
        const delta = this.clock.getDelta();

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Animate ambient snow
        if (this.ambientSnow) {
            const positions = this.ambientSnow.geometry.attributes.position.array;
            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3 + 1] -= this.ambientSnowVelocities[i];

                // Reset when below ground
                if (positions[i * 3 + 1] < 0) {
                    positions[i * 3 + 1] = this.snowHeight;
                    positions[i * 3] = (Math.random() - 0.5) * this.snowSpreadX;
                    positions[i * 3 + 2] = (Math.random() - 0.5) * this.snowSpreadZ;
                }
            }
            this.ambientSnow.geometry.attributes.position.needsUpdate = true;
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
