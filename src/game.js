export class GameManager {
    constructor(snowTree, audioManager) {
        this.snowTree = snowTree;
        this.audioManager = audioManager;
        this.resonanceTimer = {};  // Track how long each cluster has been resonating
        this.RESONANCE_TIME_TO_CLEAR = 5000;  // ms of sustained resonance to clear (5 seconds)
        this.lastUpdateTime = Date.now();
        this.tutorialMode = false;  // When true, snow won't fall
    }

    update(params) {
        const now = Date.now();
        const delta = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        // Don't process resonance during tutorial
        if (this.tutorialMode) return;

        // Check which clusters are resonating
        this.snowTree.checkResonance(params);

        // Update resonance timers for clusters
        this.snowTree.resonanceClusters.forEach((cluster) => {
            if (cluster.cleared) return;

            if (cluster.resonating) {
                // Accumulate resonance time
                if (!this.resonanceTimer[cluster.id]) {
                    this.resonanceTimer[cluster.id] = 0;
                }
                this.resonanceTimer[cluster.id] += delta;

                // Check if cluster should be cleared
                if (this.resonanceTimer[cluster.id] >= this.RESONANCE_TIME_TO_CLEAR) {
                    console.log(`Cluster ${cluster.id} cleared! (Chord: ${cluster.chord}, Vol: ${cluster.volume}, Filter: ${cluster.filter})`);
                    this.snowTree.clearCluster(cluster);
                    delete this.resonanceTimer[cluster.id];
                }
            } else {
                // Reset timer if not resonating
                if (this.resonanceTimer[cluster.id]) {
                    this.resonanceTimer[cluster.id] = Math.max(0, this.resonanceTimer[cluster.id] - delta * 2);
                    if (this.resonanceTimer[cluster.id] <= 0) {
                        delete this.resonanceTimer[cluster.id];
                    }
                }
            }
        });

        // Check for win condition
        if (this.isComplete()) {
            this.onWin();
        }
    }

    getProgress() {
        const total = this.snowTree.getTotalSnowCount();
        const active = this.snowTree.getActiveSnowCount();
        if (total === 0) return 0;
        return (total - active) / total;
    }

    getZoneProgress() {
        const total = this.snowTree.getTotalZoneCount();
        const cleared = this.snowTree.getClearedZoneCount();
        if (total === 0) return 0;
        return cleared / total;
    }

    isComplete() {
        const total = this.snowTree.getTotalZoneCount();
        if (total === 0) return false; // No zones = not complete
        return this.snowTree.getClearedZoneCount() >= total;
    }

    onWin() {
        console.log('All snow cleared! You win!');
        // Could trigger win animation, sound, etc.
    }

    // Get hint for current resonating zones
    getHint() {
        const unclearedZones = this.snowTree.resonanceZones.filter(z => !z.cleared);
        if (unclearedZones.length === 0) return null;

        const zone = unclearedZones[0];
        return {
            chord: zone.chord,
            volume: zone.volume,
            filter: zone.filter,
            bassNote: zone.bassNote
        };
    }

    // Get resonance progress for a zone (0-1)
    getZoneResonanceProgress(zoneId) {
        if (!this.resonanceTimer[zoneId]) return 0;
        return Math.min(this.resonanceTimer[zoneId] / this.RESONANCE_TIME_TO_CLEAR, 1);
    }

    // Get all resonance progress values (for visual feedback)
    getAllResonanceProgress() {
        const progress = {};
        for (const id in this.resonanceTimer) {
            progress[id] = Math.min(this.resonanceTimer[id] / this.RESONANCE_TIME_TO_CLEAR, 1);
        }
        return progress;
    }
}
