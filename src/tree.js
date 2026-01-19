import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

export class SnowTree {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.tree = null;
        this.snowSegments = [];   // Snow segments on branches
        this.resonanceClusters = []; // Clusters of nearby snow with same resonance

        // InstancedMesh for performance
        this.snowInstancedMesh = null;
        this.instanceMatrices = [];  // Store original matrices for reset
        this.tempMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3();
        this.tempColor = new THREE.Color();
        this.baseSnowColor = new THREE.Color(1, 1, 1);  // White
        this.resonanceColor = new THREE.Color(0.6, 1.5, 2.0);  // Bright glowing cyan (values >1 for HDR bloom effect)

        // InstancedMesh for falling snow animation (no pool limit)
        this.fallingSnowMesh = null;
        this.fallingSnowData = [];  // Track each falling piece's state
    }

    async generate() {
        // Create the tree
        this.tree = new Tree();

        // Set seed for reproducibility
        this.tree.options.seed = 12345;

        // No leaves for winter look - set count to 0 AND size to 0
        this.tree.options.leaves.count = 0;
        this.tree.options.leaves.size = 0;

        // Generate the tree
        this.tree.generate();

        // Position and shadows
        this.tree.position.set(0, 0, 0);
        this.tree.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.sceneManager.scene.add(this.tree);

        // Add snow that follows branch shapes
        await this.addBranchSnow();

        // Create resonance clusters from nearby snow
        this.createResonanceClusters();
    }

    async addBranchSnow() {
        // Get branch segments (pairs of connected points along branches)
        const branchSegments = this.getBranchSegments();

        // Snow material - single shared material
        const snowMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.0,
            emissive: 0x334455,
            emissiveIntensity: 0.05
        });

        // Create a unit snow geometry (will be scaled per instance)
        // Using a simple box that looks good when scaled
        const snowGeometry = new THREE.BoxGeometry(1, 1, 1);

        // Round the top vertices for puffy look (on unit cube)
        const positions = snowGeometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            if (y > 0) {
                // Round the top - make it dome-like
                const xFactor = 1 - Math.pow(Math.abs(x) * 2, 2) * 0.4;
                const zFactor = 1 - Math.pow(Math.abs(z) * 2, 2) * 0.2;
                positions.setY(i, y * xFactor * zFactor + 0.04);
            }
        }
        snowGeometry.computeVertexNormals();

        this.snowData = [];

        // First pass: calculate snow segment data
        const validSegments = [];
        for (let i = 0; i < branchSegments.length; i++) {
            const segment = branchSegments[i];
            const segmentData = this.calculateSnowSegmentData(segment);

            if (segmentData) {
                validSegments.push({
                    index: validSegments.length,
                    segment: segment,
                    ...segmentData
                });
            }
        }

        // Create InstancedMesh with capacity for all valid segments
        this.snowInstancedMesh = new THREE.InstancedMesh(
            snowGeometry,
            snowMaterial,
            validSegments.length
        );
        this.snowInstancedMesh.castShadow = true;
        this.snowInstancedMesh.receiveShadow = true;

        // Set up each instance
        for (let i = 0; i < validSegments.length; i++) {
            const data = validSegments[i];

            // Compose the instance matrix
            this.tempMatrix.compose(data.position, data.quaternion, data.scale);
            this.snowInstancedMesh.setMatrixAt(i, this.tempMatrix);

            // Initialize instance color to white
            this.snowInstancedMesh.setColorAt(i, this.baseSnowColor);

            // Store the original matrix for reset
            const originalMatrix = this.tempMatrix.clone();
            this.instanceMatrices.push(originalMatrix);

            this.snowData.push({
                index: i,
                instanceIndex: i,
                segment: data.segment,
                position: data.position.clone(),
                originalPosition: data.position.clone(),
                originalQuaternion: data.quaternion.clone(),
                originalScale: data.scale.clone(),
                active: true,
                velocity: new THREE.Vector3(),
                cluster: null
            });
        }

        this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
        this.snowInstancedMesh.instanceColor.needsUpdate = true;
        this.sceneManager.scene.add(this.snowInstancedMesh);

        // Initialize falling snow InstancedMesh (same capacity as main snow)
        this.initFallingSnowMesh(snowGeometry, snowMaterial, validSegments.length);

        console.log(`Created ${this.snowData.length} snow instances (single draw call)`);
    }

    calculateSnowSegmentData(segment) {
        const { start, end, radius } = segment;

        // Calculate segment direction and length
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();

        if (length < 0.08) return null; // Skip tiny segments

        direction.normalize();

        // Calculate dimensions
        const snowHeight = radius * 2.5 + 0.12;
        const snowWidth = radius * 3 + 0.2;

        // Position at center of segment, offset upward to sit on branch
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        center.y += radius * 0.8 + snowHeight * 0.4;

        // Orient along branch direction
        const quaternion = new THREE.Quaternion();
        const zAxis = new THREE.Vector3(0, 0, 1);
        quaternion.setFromUnitVectors(zAxis, direction);

        // Add slight random rotation for natural look
        const randomRotation = new THREE.Quaternion();
        randomRotation.setFromEuler(new THREE.Euler(0, 0, (Math.random() - 0.5) * 0.15));
        quaternion.multiply(randomRotation);

        // Scale to match desired dimensions
        const scale = new THREE.Vector3(snowWidth, snowHeight, length + 0.05);

        segment.center = center;

        return {
            position: center,
            quaternion: quaternion,
            scale: scale
        };
    }

    initFallingSnowMesh(geometry, material, capacity) {
        // Create InstancedMesh for falling snow - same capacity as main snow
        this.fallingSnowMesh = new THREE.InstancedMesh(
            geometry,
            material.clone(),
            capacity
        );
        this.fallingSnowMesh.castShadow = true;
        this.fallingSnowMesh.receiveShadow = false;

        // Initialize all instances as hidden (scale 0)
        const zeroMatrix = new THREE.Matrix4();
        zeroMatrix.scale(new THREE.Vector3(0, 0, 0));
        for (let i = 0; i < capacity; i++) {
            this.fallingSnowMesh.setMatrixAt(i, zeroMatrix);
        }
        this.fallingSnowMesh.instanceMatrix.needsUpdate = true;

        this.sceneManager.scene.add(this.fallingSnowMesh);
        this.nextFallingIndex = 0;
        this.fallingCapacity = capacity;
    }


    getBranchSegments() {
        const segments = [];

        this.tree.traverse((child) => {
            // Process all meshes
            if (child.isMesh && child.geometry) {
                const posAttr = child.geometry.attributes.position;
                const indexAttr = child.geometry.index;

                if (!posAttr) return;

                // Get all positions
                const positions = [];
                for (let i = 0; i < posAttr.count; i++) {
                    const pos = new THREE.Vector3(
                        posAttr.getX(i),
                        posAttr.getY(i),
                        posAttr.getZ(i)
                    );
                    child.localToWorld(pos);
                    positions.push(pos);
                }

                // Use index buffer to find connected edges (actual branch structure)
                if (indexAttr) {
                    const indices = indexAttr.array;
                    const edgeSet = new Set();

                    // Extract unique edges from triangles
                    for (let i = 0; i < indices.length; i += 3) {
                        const a = indices[i];
                        const b = indices[i + 1];
                        const c = indices[i + 2];

                        // Add edges (sorted to avoid duplicates)
                        [[a, b], [b, c], [c, a]].forEach(([v1, v2]) => {
                            const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
                            if (!edgeSet.has(key)) {
                                edgeSet.add(key);

                                const p1 = positions[v1];
                                const p2 = positions[v2];
                                const dist = p1.distanceTo(p2);

                                // Filter edges - snow on branches above ground, reasonable length
                                const midY = (p1.y + p2.y) / 2;
                                if (midY > 0.5 && dist > 0.1 && dist < 2) {
                                    // Estimate radius from height
                                    const radius = Math.max(0.03, 0.25 - midY * 0.012);

                                    segments.push({
                                        start: p1.clone(),
                                        end: p2.clone(),
                                        radius: radius,
                                        center: new THREE.Vector3()
                                    });
                                }
                            }
                        });
                    }
                } else {
                    // Fallback: sample vertices densely
                    const sampleRate = Math.max(1, Math.floor(posAttr.count / 500));

                    for (let i = 0; i < positions.length - 1; i += sampleRate) {
                        const p1 = positions[i];
                        const p2 = positions[Math.min(i + sampleRate, positions.length - 1)];
                        const dist = p1.distanceTo(p2);
                        const midY = (p1.y + p2.y) / 2;

                        if (midY > 0.5 && dist > 0.1 && dist < 2) {
                            const radius = Math.max(0.03, 0.25 - midY * 0.012);
                            segments.push({
                                start: p1.clone(),
                                end: p2.clone(),
                                radius: radius,
                                center: new THREE.Vector3()
                            });
                        }
                    }
                }
            }
        });

        console.log(`Found ${segments.length} branch segments for snow`);
        return segments;
    }

    createResonanceClusters() {
        // Group nearby snow into clusters that share resonance parameters
        const chords = ['Eb', 'Bb', 'Cm', 'Ab'];
        const volumeLevels = ['low', 'mid', 'high'];
        const filterRanges = ['dark', 'medium', 'bright'];
        const bassNotes = ['Eb', 'Ab', 'Bb'];

        // Use spatial clustering - snow pieces within certain distance share a cluster
        const clusterRadius = 2.5;
        const assigned = new Set();

        for (let i = 0; i < this.snowData.length; i++) {
            if (assigned.has(i)) continue;

            const snow = this.snowData[i];
            const clusterMembers = [snow];
            assigned.add(i);

            // Find nearby unassigned snow
            for (let j = i + 1; j < this.snowData.length; j++) {
                if (assigned.has(j)) continue;

                const other = this.snowData[j];
                const dist = snow.position.distanceTo(other.position);

                if (dist < clusterRadius) {
                    clusterMembers.push(other);
                    assigned.add(j);
                }
            }

            // Create cluster with random musical parameters
            const cluster = {
                id: this.resonanceClusters.length,
                members: clusterMembers,
                chord: chords[Math.floor(Math.random() * chords.length)],
                volume: volumeLevels[Math.floor(Math.random() * volumeLevels.length)],
                filter: filterRanges[Math.floor(Math.random() * filterRanges.length)],
                bassNote: bassNotes[Math.floor(Math.random() * bassNotes.length)],
                cleared: false,
                resonating: false,
                resonanceStrength: 0
            };

            // Assign cluster to all members
            clusterMembers.forEach(member => {
                member.cluster = cluster;
            });

            this.resonanceClusters.push(cluster);
        }

        console.log(`Created ${this.resonanceClusters.length} resonance clusters from ${this.snowData.length} snow pieces`);
    }

    checkResonance(params) {
        // Check which clusters are resonating with current musical parameters
        const matchedClusters = [];

        this.resonanceClusters.forEach((cluster) => {
            if (cluster.cleared) return;

            let matches = 0;
            let totalChecks = 0;

            // Check chord match
            if (params.chordName) {
                totalChecks++;
                if (params.chordName.includes(cluster.chord)) {
                    matches++;
                }
            }

            // Check volume match
            if (params.volume !== undefined) {
                totalChecks++;
                const volLevel = params.volume > -10 ? 'high' : params.volume > -20 ? 'mid' : 'low';
                if (volLevel === cluster.volume) {
                    matches++;
                }
            }

            // Check filter match
            if (params.filterFreq !== undefined) {
                totalChecks++;
                const filterLevel = params.filterFreq > 4000 ? 'bright' : params.filterFreq > 1000 ? 'medium' : 'dark';
                if (filterLevel === cluster.filter) {
                    matches++;
                }
            }

            // Check bass note match (only if bass was recently triggered)
            if (params.bassNote && params.bassTriggered) {
                totalChecks++;
                if (params.bassNote.includes(cluster.bassNote)) {
                    matches++;
                }
            }

            // Calculate resonance strength
            if (totalChecks > 0) {
                cluster.resonanceStrength = matches / totalChecks;
                cluster.resonating = cluster.resonanceStrength > 0.6;

                if (cluster.resonating) {
                    matchedClusters.push(cluster);
                }
            }
        });

        return matchedClusters;
    }

    clearCluster(cluster) {
        if (cluster.cleared) return;

        cluster.cleared = true;

        // Make all snow in this cluster fall
        cluster.members.forEach((snow) => {
            if (snow.active) {
                this.startSnowFall(snow);
            }
        });
    }

    startSnowFall(snow) {
        if (!snow.active) return;

        snow.active = false;

        // Hide the instance by scaling to 0
        this.tempScale.set(0, 0, 0);
        this.tempMatrix.compose(snow.originalPosition, snow.originalQuaternion, this.tempScale);
        this.snowInstancedMesh.setMatrixAt(snow.instanceIndex, this.tempMatrix);
        this.snowInstancedMesh.instanceMatrix.needsUpdate = true;

        // Add to falling snow InstancedMesh
        const fallingIndex = this.nextFallingIndex;
        this.nextFallingIndex = (this.nextFallingIndex + 1) % this.fallingCapacity;

        // Set initial matrix for falling instance
        this.tempMatrix.compose(snow.originalPosition, snow.originalQuaternion, snow.originalScale);
        this.fallingSnowMesh.setMatrixAt(fallingIndex, this.tempMatrix);

        // Track falling data
        this.fallingSnowData.push({
            instanceIndex: fallingIndex,
            position: snow.originalPosition.clone(),
            rotation: new THREE.Euler().setFromQuaternion(snow.originalQuaternion),
            scale: snow.originalScale.clone(),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,
                -0.01 - Math.random() * 0.02,
                (Math.random() - 0.5) * 0.03
            ),
            rotationVelocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02
            ),
            index: snow.index
        });
    }

    update(resonanceProgress = {}) {
        // Update falling snow (using InstancedMesh)
        let fallingNeedsUpdate = false;

        this.fallingSnowData = this.fallingSnowData.filter((falling) => {
            // Apply gravity
            falling.velocity.y -= 0.0008;

            // Update position
            falling.position.add(falling.velocity);

            // Add tumbling rotation (using Euler angles)
            falling.rotation.x += falling.rotationVelocity.x;
            falling.rotation.y += falling.rotationVelocity.y;
            falling.rotation.z += falling.rotationVelocity.z;

            // Add some drift
            falling.position.x += Math.sin(Date.now() * 0.003 + falling.index) * 0.003;
            falling.position.z += Math.cos(Date.now() * 0.004 + falling.index) * 0.003;

            // Update instance matrix (convert Euler to Quaternion for matrix)
            this.tempQuaternion.setFromEuler(falling.rotation);
            this.tempMatrix.compose(falling.position, this.tempQuaternion, falling.scale);
            this.fallingSnowMesh.setMatrixAt(falling.instanceIndex, this.tempMatrix);
            fallingNeedsUpdate = true;

            // Hide when below ground
            if (falling.position.y < -0.5) {
                // Set scale to 0 to hide
                this.tempScale.set(0, 0, 0);
                this.tempMatrix.compose(falling.position, this.tempQuaternion, this.tempScale);
                this.fallingSnowMesh.setMatrixAt(falling.instanceIndex, this.tempMatrix);
                return false;
            }

            return true;
        });

        if (fallingNeedsUpdate) {
            this.fallingSnowMesh.instanceMatrix.needsUpdate = true;
        }

        // Update resonating snow (shake + color effect) using instance matrices
        let needsMatrixUpdate = false;
        let needsColorUpdate = false;
        const time = Date.now() * 0.015;

        this.snowData.forEach((snow) => {
            if (!snow.active) return;

            const cluster = snow.cluster;
            if (cluster && cluster.resonating) {
                // Get resonance progress (0-1) from game manager
                const progress = resonanceProgress[cluster.id] || 0;

                // Shake intensity increases with progress (starts gentle, gets more intense)
                const baseShake = cluster.resonanceStrength * 0.01;
                const progressShake = progress * 0.025;
                const shake = baseShake + progressShake;

                // Calculate shaken position
                this.tempPosition.set(
                    snow.originalPosition.x + Math.sin(time + snow.index) * shake,
                    snow.originalPosition.y + Math.cos(time * 1.3 + snow.index) * shake * 0.5,
                    snow.originalPosition.z + Math.sin(time * 0.8 + snow.index * 1.5) * shake
                );

                // Update instance matrix with shaken position
                this.tempMatrix.compose(this.tempPosition, snow.originalQuaternion, snow.originalScale);
                this.snowInstancedMesh.setMatrixAt(snow.instanceIndex, this.tempMatrix);
                needsMatrixUpdate = true;

                // Update color - lerp from white to cyan based on progress
                this.tempColor.copy(this.baseSnowColor).lerp(this.resonanceColor, progress);
                this.snowInstancedMesh.setColorAt(snow.instanceIndex, this.tempColor);
                needsColorUpdate = true;

                snow.needsReset = true;
                snow.needsColorReset = true;
            } else {
                // Reset position when not resonating
                if (snow.needsReset) {
                    this.snowInstancedMesh.setMatrixAt(snow.instanceIndex, this.instanceMatrices[snow.instanceIndex]);
                    snow.needsReset = false;
                    needsMatrixUpdate = true;
                }
                // Reset color when not resonating
                if (snow.needsColorReset) {
                    this.snowInstancedMesh.setColorAt(snow.instanceIndex, this.baseSnowColor);
                    snow.needsColorReset = false;
                    needsColorUpdate = true;
                }
            }
        });

        if (needsMatrixUpdate) {
            this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
        }
        if (needsColorUpdate) {
            this.snowInstancedMesh.instanceColor.needsUpdate = true;
        }
    }

    getActiveSnowCount() {
        return this.snowData.filter(s => s.active).length;
    }

    getTotalSnowCount() {
        return this.snowData.length;
    }

    getClearedZoneCount() {
        return this.resonanceClusters.filter(c => c.cleared).length;
    }

    getTotalZoneCount() {
        return this.resonanceClusters.length;
    }
}
