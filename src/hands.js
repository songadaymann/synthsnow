export class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.onUpdate = null;

        // Hand overlay canvas (full-screen)
        this.overlayCanvas = null;
        this.overlayCtx = null;

        // Pinch state
        this.leftPinchActive = false;
        this.rightPinchActive = false;
        this.LEFT_PINCH_THRESHOLD = 0.06;
        this.LEFT_PINCH_RELEASE = 0.10;
    }

    async init() {
        this.videoElement = document.getElementById('webcam');

        // Hand overlay canvas (full-screen)
        this.overlayCanvas = document.getElementById('hand-overlay');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.resizeOverlay();
        window.addEventListener('resize', () => this.resizeOverlay());

        // Load MediaPipe Hands
        await this.loadMediaPipe();

        // Initialize hands
        this.hands = new window.Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => this.onResults(results));

        // Initialize camera
        this.camera = new window.Camera(this.videoElement, {
            onFrame: async () => {
                await this.hands.send({ image: this.videoElement });
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        console.log('Hand tracking initialized');
    }

    resizeOverlay() {
        this.overlayCanvas.width = window.innerWidth;
        this.overlayCanvas.height = window.innerHeight;
    }

    async loadMediaPipe() {
        // Load MediaPipe scripts dynamically
        await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    onResults(results) {
        // Clear the overlay
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        const params = {};

        if (results.multiHandLandmarks && results.multiHandedness) {
            let leftHand = null;
            let rightHand = null;

            // Identify hands (mirrored video)
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i].label;

                if (handedness === 'Right') {
                    leftHand = landmarks;
                } else {
                    rightHand = landmarks;
                }

                // Draw hand skeleton in white
                this.drawHand(landmarks);
            }

            // Draw pinch line on right hand (filter control)
            if (rightHand) {
                this.drawPinchLine(rightHand);
            }

            // Draw pinch dot on left hand (bass trigger)
            if (leftHand) {
                this.drawPinchDot(leftHand, this.leftPinchActive);
            }

            // Process left hand (chords + bass)
            if (leftHand) {
                this.processLeftHand(leftHand, params);
            }

            // Process right hand (filter + volume)
            if (rightHand) {
                this.processRightHand(rightHand, params);
            }
        }

        // Call update callback
        if (this.onUpdate) {
            this.onUpdate(params);
        }
    }

    drawHand(landmarks) {
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;

        // Hand skeleton connections
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],       // Index
            [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [5, 9], [9, 13], [13, 17]             // Palm
        ];

        // Draw connections (white lines)
        this.overlayCtx.strokeStyle = 'white';
        this.overlayCtx.lineWidth = 2;

        for (const [start, end] of connections) {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];

            // Mirror X coordinate (webcam is mirrored)
            const x1 = (1 - startPoint.x) * width;
            const y1 = startPoint.y * height;
            const x2 = (1 - endPoint.x) * width;
            const y2 = endPoint.y * height;

            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(x1, y1);
            this.overlayCtx.lineTo(x2, y2);
            this.overlayCtx.stroke();
        }

        // Draw joints (white dots)
        this.overlayCtx.fillStyle = 'white';

        for (const landmark of landmarks) {
            const x = (1 - landmark.x) * width;
            const y = landmark.y * height;

            this.overlayCtx.beginPath();
            this.overlayCtx.arc(x, y, 4, 0, 2 * Math.PI);
            this.overlayCtx.fill();
        }
    }

    drawPinchLine(landmarks) {
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // Mirror X coordinates
        const x1 = (1 - thumbTip.x) * width;
        const y1 = thumbTip.y * height;
        const x2 = (1 - indexTip.x) * width;
        const y2 = indexTip.y * height;

        // Draw thick white line between thumb and index
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(x1, y1);
        this.overlayCtx.lineTo(x2, y2);
        this.overlayCtx.strokeStyle = 'white';
        this.overlayCtx.lineWidth = 4;
        this.overlayCtx.stroke();

        // Draw circles at the endpoints
        this.overlayCtx.fillStyle = 'white';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(x1, y1, 8, 0, 2 * Math.PI);
        this.overlayCtx.fill();
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(x2, y2, 8, 0, 2 * Math.PI);
        this.overlayCtx.fill();
    }

    drawPinchDot(landmarks, isActive) {
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // Pinch position (midpoint between thumb and index)
        const pinchX = (1 - (thumbTip.x + indexTip.x) / 2) * width;
        const pinchY = ((thumbTip.y + indexTip.y) / 2) * height;

        // Draw dot - larger when active (pinching)
        const size = isActive ? 16 : 10;

        this.overlayCtx.beginPath();
        this.overlayCtx.arc(pinchX, pinchY, size, 0, 2 * Math.PI);
        this.overlayCtx.fillStyle = 'white';
        this.overlayCtx.fill();
    }

    processLeftHand(landmarks, params) {
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const palmY = this.clamp((wrist.y + middleBase.y) / 2, 0, 1);

        params.leftHandY = palmY;

        // Bass pinch trigger
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const pinchX = (thumbTip.x + indexTip.x) / 2;
        const pinchY = (thumbTip.y + indexTip.y) / 2;

        params.leftPinchX = pinchX;
        params.leftPinchY = pinchY;
        params.leftPinchDist = pinchDist;

        // Trigger on pinch
        if (!this.leftPinchActive && pinchDist < this.LEFT_PINCH_THRESHOLD) {
            this.leftPinchActive = true;
            params.leftPinchTriggered = true;
        } else if (this.leftPinchActive && pinchDist > this.LEFT_PINCH_RELEASE) {
            this.leftPinchActive = false;
        }
    }

    processRightHand(landmarks, params) {
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const palmY = this.clamp((wrist.y + middleBase.y) / 2, 0, 1);

        params.rightHandY = palmY;

        // Filter pinch
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

        params.rightPinchDist = pinchDist;
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}
