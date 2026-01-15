import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';

// DOM elements
const sceneContainer = document.getElementById('scene-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const voiceButton = document.getElementById('voice-btn');
const emojiButton = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const clearChatButton = document.getElementById('clear-chat');
const emotionIcon = document.getElementById('emotion-icon');
const emotionText = document.getElementById('emotion-text');
const copyButton = document.getElementById('copy-chat');

// Status panel elements
const johnLocation = document.getElementById('john-location');
const johnGoal = document.getElementById('john-goal');
const johnMood = document.getElementById('john-mood');
const johnSpecies = document.getElementById('john-species');
const energyBar = document.getElementById('energy-bar');
const happinessBar = document.getElementById('happiness-bar');
const socialBar = document.getElementById('social-bar');

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f2f5);

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / (window.innerHeight * 0.66), 0.1, 1000);
camera.position.set(0, 1.6, 2);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight * 0.66);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
sceneContainer.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Character state
let character, mixer, actions = {};
let currentEmotion = 'default';
let johnStatus = {
    emotion: 'happy',
    species: 'Human',
    location: 'Home',
    goal: 'Relaxing',
    mood: 'Content',
    energy: 80,
    happiness: 70,
    social: 60
};

const conversationHistory = [];

// YOUR LOCAL AI CONFIGURATION
const KOBOLD_URL = "https://overgreasy-maxine-transonic.ngrok-free.dev/v1/chat/completions";

const websim = {
    chat: {
        completions: {
            create: async function(options) {
                try {
                    const response = await fetch(KOBOLD_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messages: options.messages,
                            max_tokens: 200,
                            temperature: 0.7
                        })
                    });
                    if (!response.ok) throw new Error("Local AI Offline");
                    const data = await response.json();
                    return {
                        content: data.choices[0].message.content,
                        role: "assistant"
                    };
                } catch (error) {
                    console.error("AI Error:", error);
                    return {
                        content: "I'm having trouble connecting to your computer. Check KoboldCPP and ngrok! [STATUS:{\"emotion\":\"sad\",\"species\":\"Human\",\"location\":\"Error\",\"goal\":\"Fixing connection\",\"mood\":\"Lost\",\"energy\":10,\"happiness\":10,\"social\":10}]",
                        role: "assistant"
                    };
                }
            }
        }
    }
};

// Character loading
function loadCharacterModel() {
    // Create a placeholder character if model fails to load
    const geometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x3498db });
    character = new THREE.Mesh(geometry, material);
    character.position.set(0, 0.8, 0);
    character.castShadow = true;
    scene.add(character);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.25, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.8, 0);
    character.add(head);
}

// UI Functions
function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    // Clean status JSON from text
    let cleanContent = content.replace(/\[STATUS:.*?\]/g, '').trim();
    messageDiv.textContent = cleanContent;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Process status if present
    const statusMatch = content.match(/\[STATUS:(.*?)\]/);
    if (statusMatch) {
        try {
            const newStatus = JSON.parse(statusMatch[1]);
            updateJohnState(newStatus);
        } catch (e) {
            console.error("Error parsing status:", e);
        }
    }
}

function updateJohnState(newStatus) {
    johnStatus = { ...johnStatus, ...newStatus };
    updateStatusPanel();
    setEmotion(johnStatus.emotion);
}

function updateStatusPanel() {
    johnLocation.textContent = johnStatus.location;
    johnGoal.textContent = johnStatus.goal;
    johnMood.textContent = johnStatus.mood;
    johnSpecies.textContent = johnStatus.species;
    
    gsap.to(energyBar, { width: `${johnStatus.energy}%`, duration: 0.5 });
    gsap.to(happinessBar, { width: `${johnStatus.happiness}%`, duration: 0.5 });
    gsap.to(socialBar, { width: `${johnStatus.social}%`, duration: 0.5 });
}

function setEmotion(emotion) {
    currentEmotion = emotion;
    const emotions = {
        happy: '😊', sad: '😢', surprised: '😲', 
        angry: '😠', thinking: '🤔', default: '😐'
    };
    emotionIcon.textContent = emotions[emotion] || emotions.default;
    emotionText.textContent = emotion;
    
    // Simple visual reaction
    if (character) {
        if (emotion === 'happy') gsap.to(character.scale, { y: 1.1, duration: 0.2, yoyo: true, repeat: 1 });
        if (emotion === 'sad') gsap.to(character.position, { y: 0.7, duration: 0.5 });
        else gsap.to(character.position, { y: 0.8, duration: 0.5 });
    }
}

async function handleSendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = '';
    addMessage(text, 'user');
    conversationHistory.push({ role: "user", content: text });

    typingIndicator.classList.remove('hidden');

    try {
        const response = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are roleplaying as John Timbles, a complex 3D human character. Respond in the first person AS John Timbles. Keep responses under 100 words. Always include status JSON: [STATUS:{"emotion":"happy","species":"Human","location":"Home","goal":"Relaxing","mood":"Content","energy":80,"happiness":70,"social":60}]`
                },
                ...conversationHistory
            ]
        });

        typingIndicator.classList.add('hidden');
        addMessage(response.content, 'assistant');
        conversationHistory.push(response);
    } catch (err) {
        typingIndicator.classList.add('hidden');
        console.error(err);
    }
}

// Event Listeners
sendButton.addEventListener('click', handleSendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / (window.innerHeight * 0.66);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight * 0.66);
});

// Init
loadCharacterModel();
updateStatusPanel();
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

function getTimeString() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + 
           now.getMinutes().toString().padStart(2, '0');
}
