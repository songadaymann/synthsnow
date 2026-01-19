import * as Tone from 'tone';

// Chord definitions - two octaves
const CHORDS = {
    'Eb2': ['Eb2', 'G2', 'Bb2'],
    'Bb2': ['Bb2', 'D3', 'F3'],
    'Cm3': ['C3', 'Eb3', 'G3'],
    'Ab2': ['Ab2', 'C3', 'Eb3'],
    'Eb3': ['Eb3', 'G3', 'Bb3'],
    'Bb3': ['Bb3', 'D4', 'F4'],
    'Cm4': ['C4', 'Eb4', 'G4'],
    'Ab3': ['Ab3', 'C4', 'Eb4'],
};

const CHORD_NAMES = ['Eb2', 'Bb2', 'Cm3', 'Ab2', 'Eb3', 'Bb3', 'Cm4', 'Ab3'];

// Bass notes: 1, 4, 5 (Eb, Ab, Bb) across octaves
const BASS_NOTES_BY_OCTAVE = [
    ['Eb1', 'Ab1', 'Bb1'],
    ['Eb2', 'Ab2', 'Bb2'],
    ['Eb3', 'Ab3', 'Bb3'],
    ['Eb4', 'Ab4', 'Bb4'],
];

export class AudioManager {
    constructor() {
        this.synth = null;
        this.bassSynth = null;
        this.filter = null;
        this.volume = null;
        this.isStarted = false;
        this.currentChord = null;
        this.lastChordIndex = -1;
        this.lastBassNote = null;
        this.bassTriggered = false;
        this.bassTriggeredTime = 0;
    }

    async init() {
        // Set tempo
        Tone.Transport.bpm.value = 120;
        Tone.Transport.start();

        await Tone.start();

        // Create effects chain
        const limiter = new Tone.Limiter(-3).toDestination();

        const compressor = new Tone.Compressor({
            threshold: -20,
            ratio: 4,
            attack: 0.003,
            release: 0.25
        }).connect(limiter);

        // Reverb for pad
        const reverb = new Tone.Reverb({
            decay: 2.5,
            wet: 0.35
        }).connect(compressor);

        // Filter
        this.filter = new Tone.Filter({
            frequency: 2000,
            type: 'lowpass',
            rolloff: -24
        }).connect(reverb);

        // Volume
        this.volume = new Tone.Volume(-6).connect(this.filter);

        // Pad synth
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sawtooth' },
            envelope: {
                attack: 0.1,
                decay: 0.2,
                sustain: 0.8,
                release: 1.0
            }
        }).connect(this.volume);

        // Bass effects
        const bassDelay = new Tone.FeedbackDelay({
            delayTime: '8n',
            feedback: 0.3,
            wet: 0.4
        }).connect(compressor);

        const bassReverb = new Tone.Reverb({
            decay: 1.5,
            wet: 0.2
        }).connect(bassDelay);

        const bassFilter = new Tone.Filter({
            frequency: 1200,
            type: 'lowpass',
            rolloff: -24
        }).connect(bassReverb);

        // Bass synth
        this.bassSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: 'fatsawtooth',
                spread: 20,
                count: 3
            },
            envelope: {
                attack: 0.01,
                decay: 0.4,
                sustain: 0.2,
                release: 0.5
            }
        }).connect(bassFilter);

        this.isStarted = true;
        console.log('Audio initialized');
    }

    playChord(chordIndex) {
        if (!this.isStarted || !this.synth) return null;
        if (chordIndex < 0 || chordIndex >= CHORD_NAMES.length) return null;

        const chordName = CHORD_NAMES[chordIndex];
        const notes = CHORDS[chordName];
        if (!notes) return null;

        if (chordIndex !== this.lastChordIndex) {
            this.synth.releaseAll();
            this.synth.triggerAttack(notes);
            this.lastChordIndex = chordIndex;
            this.currentChord = chordName;
        }

        return chordName;
    }

    releaseChord() {
        if (this.synth) {
            this.synth.releaseAll();
            this.currentChord = null;
            this.lastChordIndex = -1;
        }
    }

    setVolume(db) {
        if (this.volume && isFinite(db)) {
            this.volume.volume.rampTo(db, 0.1);
        }
    }

    setFilter(freq) {
        if (this.filter && freq > 0) {
            this.filter.frequency.rampTo(freq, 0.1);
        }
    }

    triggerBass(x, y) {
        if (!this.bassSynth) return null;

        const numCols = BASS_NOTES_BY_OCTAVE[0].length;
        const numRows = BASS_NOTES_BY_OCTAVE.length;

        const colIndex = Math.floor(Math.min(Math.max(x, 0), 0.99) * numCols);
        const rowIndex = Math.floor(Math.min(Math.max(y, 0), 0.99) * numRows);
        const octaveIndex = numRows - 1 - rowIndex;

        const note = BASS_NOTES_BY_OCTAVE[octaveIndex][colIndex];

        this.bassSynth.triggerAttackRelease(note, '8n', undefined, 0.8);
        this.lastBassNote = note;
        this.bassTriggered = true;
        this.bassTriggeredTime = Date.now();

        return note;
    }

    updateFromHands(params) {
        // Update chord based on left hand Y
        if (params.leftHandY !== undefined) {
            const chordIndex = Math.floor(params.leftHandY * CHORD_NAMES.length);
            this.playChord(Math.min(chordIndex, CHORD_NAMES.length - 1));
        } else {
            // No left hand, release chord
            // this.releaseChord();
        }

        // Update volume based on right hand Y
        if (params.rightHandY !== undefined) {
            const volDb = this.mapRange(1 - params.rightHandY, 0, 1, -30, -3);
            this.setVolume(volDb);
            params.volume = volDb;
        }

        // Update filter based on right hand pinch
        if (params.rightPinchDist !== undefined) {
            const filterFreq = this.mapRange(params.rightPinchDist, 0.03, 0.33, 80, 12000);
            this.setFilter(filterFreq);
            params.filterFreq = filterFreq;
        }

        // Trigger bass on left hand pinch
        if (params.leftPinchTriggered && params.leftPinchX !== undefined && params.leftPinchY !== undefined) {
            const note = this.triggerBass(params.leftPinchX, params.leftPinchY);
            params.bassNote = note;
            params.bassTriggered = true;
        }

        // Clear bass triggered flag after a short time
        if (this.bassTriggered && Date.now() - this.bassTriggeredTime > 500) {
            this.bassTriggered = false;
        }

        // Add current state to params
        params.chordName = this.currentChord;
        params.bassTriggered = this.bassTriggered;
        if (!params.bassNote && this.lastBassNote) {
            params.bassNote = this.lastBassNote;
        }
    }

    mapRange(value, inMin, inMax, outMin, outMax) {
        const clampedValue = Math.min(Math.max(value, inMin), inMax);
        return outMin + (outMax - outMin) * ((clampedValue - inMin) / (inMax - inMin));
    }
}
