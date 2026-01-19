import { SceneManager } from './scene.js';
import { SnowTree } from './tree.js';
import { AudioManager } from './audio.js';
import { HandTracker } from './hands.js';
import { GameManager } from './game.js';

let sceneManager;
let snowTree;
let audioManager;
let handTracker;
let gameManager;

// Tutorial state
const tutorial = {
    active: false,
    step: 0,
    transitioning: false,
    steps: [
        { message: 'put up your left hand', check: 'leftHandVisible' },
        { message: 'move your hand up and down\nto try different chords', check: 'leftHandMoved' },
        { message: 'put your thumb and\npointer finger together\nto play a note', check: 'leftPinched' },
        { message: 'put up your right hand', check: 'rightHandVisible' },
        { message: 'move it higher and lower\nto change the volume', check: 'rightHandMoved' },
        { message: 'move your thumb and\npointer fingers together\nand apart to change the sound', check: 'rightPinchMoved' },
        { message: 'try different combinations\nto make snow fall\noff the tree', check: 'complete' }
    ],
    // Tracking values for detecting gestures
    leftHandY: null,
    leftHandMinY: Infinity,
    leftHandMaxY: -Infinity,
    rightHandY: null,
    rightHandMinY: Infinity,
    rightHandMaxY: -Infinity,
    rightPinchDist: null,
    rightPinchMinDist: Infinity,
    rightPinchMaxDist: -Infinity,
    leftPinched: false,
    gameUnlocked: false
};

async function init() {
    const startScreen = document.getElementById('start-screen');
    const startPrompt = document.getElementById('start-prompt');

    // Initialize Three.js scene immediately (shows tree behind title)
    sceneManager = new SceneManager();
    await sceneManager.init();

    // Create tree with snow
    snowTree = new SnowTree(sceneManager);
    await snowTree.generate();

    // Start rendering the scene (tree visible behind title)
    animateBackground();

    // Wait for click/tap to start the game
    startScreen.addEventListener('click', async () => {
        startPrompt.textContent = 'loading...';
        startPrompt.style.animation = 'none';

        try {
            // Initialize audio
            audioManager = new AudioManager();
            await audioManager.init();

            // Initialize hand tracking
            handTracker = new HandTracker();
            await handTracker.init();

            // Initialize game logic (but snow falling is locked)
            gameManager = new GameManager(snowTree, audioManager);
            gameManager.tutorialMode = true;  // Lock snow falling

            // Connect hand tracking to audio and game
            handTracker.onUpdate = (params) => {
                audioManager.updateFromHands(params);

                // Only run game logic if tutorial is complete
                if (tutorial.gameUnlocked) {
                    gameManager.update(params);
                }

                // Process tutorial
                if (tutorial.active) {
                    updateTutorial(params);
                }
            };

            // Hide start screen
            startScreen.classList.add('hidden');

            // Start tutorial
            startTutorial();

            // Start full animation loop
            animate();

        } catch (error) {
            console.error('Error initializing:', error);
            startPrompt.textContent = 'error - tap to retry';
            startPrompt.style.animation = 'pulse 2s ease-in-out infinite';
        }
    }, { once: true });
}

function startTutorial() {
    const tutorialDiv = document.getElementById('tutorial');
    tutorialDiv.classList.remove('hidden');

    // Set initial volume to 50% (-15 dB) so they can hear chords before right hand
    audioManager.setVolume(-15);

    tutorial.active = true;
    tutorial.step = 0;
    showTutorialMessage(tutorial.steps[0].message);
}

function showTutorialMessage(message) {
    const messageDiv = document.getElementById('tutorial-message');

    // Convert \n to <br> for line breaks
    messageDiv.innerHTML = message.replace(/\n/g, '<br>');

    // Fade in
    messageDiv.classList.remove('fade-out');
}

function advanceTutorial() {
    // Prevent advancing while transitioning
    if (tutorial.transitioning) return;
    tutorial.transitioning = true;

    const messageDiv = document.getElementById('tutorial-message');

    // Fade out current message
    messageDiv.classList.add('fade-out');

    // Wait for fade out, then show next message
    setTimeout(() => {
        tutorial.step++;
        tutorial.transitioning = false;

        if (tutorial.step < tutorial.steps.length) {
            showTutorialMessage(tutorial.steps[tutorial.step].message);

            // If this is the final step, unlock the game
            if (tutorial.steps[tutorial.step].check === 'complete') {
                tutorial.gameUnlocked = true;
                gameManager.tutorialMode = false;

                // Show progress bar
                const progressContainer = document.getElementById('progress-container');
                progressContainer.classList.add('visible');

                // Hide tutorial message after a delay
                setTimeout(() => {
                    messageDiv.classList.add('fade-out');
                    setTimeout(() => {
                        const tutorialDiv = document.getElementById('tutorial');
                        tutorialDiv.classList.add('hidden');
                        tutorial.active = false;
                    }, 1000);
                }, 5000);
            }
        }
    }, 1000); // Wait for fade out animation
}

function updateTutorial(params) {
    // Don't process during transitions
    if (tutorial.transitioning) return;

    const currentStep = tutorial.steps[tutorial.step];
    if (!currentStep) return;

    switch (currentStep.check) {
        case 'leftHandVisible':
            // Check if left hand is detected
            if (params.leftHandY !== undefined) {
                tutorial.leftHandY = params.leftHandY;
                advanceTutorial();
            }
            break;

        case 'leftHandMoved':
            // Track left hand movement range
            if (params.leftHandY !== undefined) {
                tutorial.leftHandMinY = Math.min(tutorial.leftHandMinY, params.leftHandY);
                tutorial.leftHandMaxY = Math.max(tutorial.leftHandMaxY, params.leftHandY);

                // Need to move at least 30% of the range
                const leftRange = tutorial.leftHandMaxY - tutorial.leftHandMinY;
                if (leftRange > 0.3) {
                    advanceTutorial();
                }
            }
            break;

        case 'leftPinched':
            // Check for left hand pinch (bass trigger)
            if (params.leftPinchTriggered) {
                advanceTutorial();
            }
            break;

        case 'rightHandVisible':
            // Check if right hand is detected
            if (params.rightHandY !== undefined) {
                tutorial.rightHandY = params.rightHandY;
                advanceTutorial();
            }
            break;

        case 'rightHandMoved':
            // Track right hand movement range
            if (params.rightHandY !== undefined) {
                tutorial.rightHandMinY = Math.min(tutorial.rightHandMinY, params.rightHandY);
                tutorial.rightHandMaxY = Math.max(tutorial.rightHandMaxY, params.rightHandY);

                // Need to move at least 30% of the range
                const rightRange = tutorial.rightHandMaxY - tutorial.rightHandMinY;
                if (rightRange > 0.3) {
                    advanceTutorial();
                }
            }
            break;

        case 'rightPinchMoved':
            // Track right hand pinch distance range
            if (params.rightPinchDist !== undefined) {
                tutorial.rightPinchMinDist = Math.min(tutorial.rightPinchMinDist, params.rightPinchDist);
                tutorial.rightPinchMaxDist = Math.max(tutorial.rightPinchMaxDist, params.rightPinchDist);

                // Need to vary pinch distance significantly
                const pinchRange = tutorial.rightPinchMaxDist - tutorial.rightPinchMinDist;
                if (pinchRange > 0.15) {
                    advanceTutorial();
                }
            }
            break;
    }
}

// Background animation (just scene, no game logic)
function animateBackground() {
    const startScreen = document.getElementById('start-screen');

    if (sceneManager) {
        sceneManager.update();
    }

    if (snowTree) {
        snowTree.update();
    }

    // Keep animating until start screen is hidden
    if (startScreen && !startScreen.classList.contains('hidden')) {
        requestAnimationFrame(animateBackground);
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (sceneManager) {
        sceneManager.update();
    }

    if (snowTree && gameManager) {
        const resonanceProgress = gameManager.getAllResonanceProgress();
        snowTree.update(resonanceProgress);

        // Update progress bar
        if (tutorial.gameUnlocked) {
            const progress = gameManager.getProgress();
            const progressBar = document.getElementById('progress-bar');
            progressBar.style.width = `${progress * 100}%`;
        }
    } else if (snowTree) {
        snowTree.update();
    }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
