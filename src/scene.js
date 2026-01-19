import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// PSX-style dithering shader
const PSXDitherShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2() },
        'colorDepth': { value: 8.0 },  // Color levels per channel
        'ditherStrength': { value: 1.5 },
        'ditherScale': { value: 3.0 }  // Scale up the dither pattern (bigger dots)
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float colorDepth;
        uniform float ditherStrength;
        uniform float ditherScale;
        varying vec2 vUv;

        // 4x4 Bayer dithering matrix (classic PSX pattern)
        float bayer4x4(vec2 pos) {
            int x = int(mod(pos.x, 4.0));
            int y = int(mod(pos.y, 4.0));
            int index = x + y * 4;

            // Bayer matrix values normalized to 0-1
            float matrix[16];
            matrix[0] = 0.0/16.0;    matrix[1] = 8.0/16.0;    matrix[2] = 2.0/16.0;    matrix[3] = 10.0/16.0;
            matrix[4] = 12.0/16.0;   matrix[5] = 4.0/16.0;    matrix[6] = 14.0/16.0;   matrix[7] = 6.0/16.0;
            matrix[8] = 3.0/16.0;    matrix[9] = 11.0/16.0;   matrix[10] = 1.0/16.0;   matrix[11] = 9.0/16.0;
            matrix[12] = 15.0/16.0;  matrix[13] = 7.0/16.0;   matrix[14] = 13.0/16.0;  matrix[15] = 5.0/16.0;

            // Return matrix value
            for (int i = 0; i < 16; i++) {
                if (i == index) return matrix[i];
            }
            return 0.0;
        }

        vec3 dither(vec3 color, vec2 pixelCoord) {
            // Scale down coordinates to make pattern bigger
            vec2 scaledCoord = floor(pixelCoord / ditherScale);

            // Get bayer value for this pixel
            float bayerValue = bayer4x4(scaledCoord);

            // Offset to center the dither pattern
            float ditherOffset = (bayerValue - 0.5) * ditherStrength / colorDepth;

            // Apply dither offset and quantize
            vec3 dithered = color + vec3(ditherOffset);

            // Quantize to limited color palette
            vec3 quantized = floor(dithered * colorDepth + 0.5) / colorDepth;

            return clamp(quantized, 0.0, 1.0);
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 pixelCoord = vUv * resolution;

            vec3 ditheredColor = dither(texel.rgb, pixelCoord);

            gl_FragColor = vec4(ditheredColor, texel.a);
        }
    `
};

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null;
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
            antialias: false  // Disable antialiasing for retro look
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1);  // Force pixel ratio of 1 for crisp pixels
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Post-processing
        this.setupPostProcessing();

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(4.13, 17.14, -3.34);
        this.controls.maxPolarAngle = Math.PI / 2 + 0.3;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 100;

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

    setupPostProcessing() {
        // Create composer
        this.composer = new EffectComposer(this.renderer);

        // Render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // PSX dither pass - subtle retro dithering
        const ditherPass = new ShaderPass(PSXDitherShader);
        ditherPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        ditherPass.uniforms['colorDepth'].value = 12.0;   // Moderate color palette
        ditherPass.uniforms['ditherStrength'].value = 1.0; // Medium dither
        ditherPass.uniforms['ditherScale'].value = 1.5;   // Slightly bigger dots
        this.composer.addPass(ditherPass);

        this.ditherPass = ditherPass;
    }

    setupLighting() {
        // Ambient light - bright cold blue tint
        const ambientLight = new THREE.AmbientLight(0x88aadd, 1.2);
        this.scene.add(ambientLight);

        // Main directional light - bright moonlight
        const moonLight = new THREE.DirectionalLight(0xffffff, 1.5);
        moonLight.position.set(15, 30, 15);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 4096;
        moonLight.shadow.mapSize.height = 4096;
        moonLight.shadow.camera.near = 1;
        moonLight.shadow.camera.far = 100;
        // Expand shadow camera to capture full tree shadow
        moonLight.shadow.camera.left = -50;
        moonLight.shadow.camera.right = 50;
        moonLight.shadow.camera.top = 50;
        moonLight.shadow.camera.bottom = -50;
        this.scene.add(moonLight);

        // Fill light from the side
        const fillLight = new THREE.DirectionalLight(0xaaccee, 0.8);
        fillLight.position.set(-10, 10, -5);
        this.scene.add(fillLight);

        // Point light for tree highlight
        const treeLight = new THREE.PointLight(0x4ecca3, 1.0, 40);
        treeLight.position.set(0, 8, 8);
        this.scene.add(treeLight);

        // Additional fill from below to brighten shadows
        const bottomFill = new THREE.HemisphereLight(0x6688bb, 0x334466, 0.6);
        this.scene.add(bottomFill);
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

        // Render with post-processing
        this.composer.render();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);

        // Update dither resolution uniform
        if (this.ditherPass) {
            this.ditherPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        }
    }
}
