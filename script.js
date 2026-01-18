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
const camera = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
camera.position.set(0, 1.6, 2);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
sceneContainer.appendChild(renderer.domElement);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI / 1.8;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(2, 2, 2);
directionalLight.castShadow = true;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-2, 2, -2);
scene.add(fillLight);

// Character model and facial expressions
let character;
let headBone;
let expressions = {
    default: { eyesOpen: 1, mouthSmile: 0, mouthOpen: 0, eyebrowsUp: 0, eyebrowsDown: 0 },
    happy: { eyesOpen: 0.8, mouthSmile: 1, mouthOpen: 0.3, eyebrowsUp: 0.7, eyebrowsDown: 0 },
    sad: { eyesOpen: 0.7, mouthSmile: -0.5, mouthOpen: 0, eyebrowsUp: 0, eyebrowsDown: 0.7 },
    surprised: { eyesOpen: 1, mouthSmile: 0, mouthOpen: 0.8, eyebrowsUp: 1, eyebrowsDown: 0 },
    angry: { eyesOpen: 0.6, mouthSmile: -0.3, mouthOpen: 0.3, eyebrowsUp: 0, eyebrowsDown: 1 },
    thinking: { eyesOpen: 0.7, mouthSmile: 0, mouthOpen: 0, eyebrowsUp: 0.3, eyebrowsDown: 0.2 }
};

let currentExpression = "default";
const emotionIcons = {
    happy: "😊",
    sad: "😢",
    surprised: "😲",
    angry: "😠",
    thinking: "🤔",
    default: "😐"
};

// John's status data
let johnStatus = {
    species: "Human",
    location: "Home",
    goal: "Relaxing",
    mood: "Content",
    energy: 80,
    happiness: 70,
    social: 60
};

function updateStatusPanel() {
    johnSpecies.textContent = johnStatus.species;
    johnLocation.textContent = johnStatus.location;
    johnGoal.textContent = johnStatus.goal;
    johnMood.textContent = johnStatus.mood;
    energyBar.style.width = johnStatus.energy + '%';
    happinessBar.style.width = johnStatus.happiness + '%';
    socialBar.style.width = johnStatus.social + '%';
}

function initEmojiPicker() {
    const commonEmojis = ["😊", "😂", "❤️", "👍", "😎", "😢", "😡", "🎉", "🤔", "👋", "🙏", "🥺", "😍", "🤣", "😭", "✨", "🔥", "👀", "💯", "🤩", "🥰", "😇", "😬", "🙄", "😴", "😋", "😘", "💪", "🤗"];
    commonEmojis.forEach(emoji => {
        const emojiItem = document.createElement('div');
        emojiItem.classList.add('emoji-item');
        emojiItem.textContent = emoji;
        emojiItem.addEventListener('click', () => {
            userInput.value += emoji;
            toggleEmojiPicker(false);
            userInput.focus();
        });
        emojiPicker.appendChild(emojiItem);
    });
}

function toggleEmojiPicker(show) {
    if (show === undefined) {
        emojiPicker.classList.toggle('hidden');
    } else {
        emojiPicker.classList.toggle('hidden', !show);
    }
}

let recognition;
function setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = () => voiceButton.classList.add('recording');
        recognition.onresult = (event) => { userInput.value = event.results[0][0].transcript; };
        recognition.onend = () => voiceButton.classList.remove('recording');
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            voiceButton.classList.remove('recording');
        };
    } else {
        voiceButton.style.display = 'none';
    }
}

function toggleSpeechRecognition() {
    if (voiceButton.classList.contains('recording')) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function loadCharacterModel() {
    const geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0xbb4444 });
    character = new THREE.Mesh(geometry, material);
    character.position.set(0, 0.7, 0);
    character.castShadow = true;
    character.receiveShadow = true;
    scene.add(character);
    
    const headGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffcbb3 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.7;
    head.castShadow = true;
    character.add(head);
    headBone = head;
    
    const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(0.08, 0.05, 0.2);
    head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(-0.08, 0.05, 0.2);
    head.add(rightEye);
    
    const mouthGeometry = new THREE.BoxGeometry(0.15, 0.03, 0.05);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.1, 0.2);
    head.add(mouth);
    
    const groundGeometry = new THREE.CircleGeometry(3, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xdadada });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
    
    animateCharacter();
}

function animateCharacter() {
    if (character) {
        gsap.to(character.position, {
            y: 0.75,
            duration: 1.5,
            repeat: -1,
            yoyo: true,
            ease: "power1.inOut"
        });
    }
}

function setExpression(expression) {
    if (!expressions[expression]) expression = "default";
    currentExpression = expression;
    emotionIcon.textContent = emotionIcons[expression] || emotionIcons.default;
    emotionText.textContent = expression;
    gsap.to(headBone.rotation, {
        x: expression === "sad" ? -0.2 : 
           expression === "happy" ? 0.1 : 
           expression === "surprised" ? 0.2 : 
           expression === "angry" ? -0.1 : 0,
        y: expression === "thinking" ? 0.3 : 0,
        duration: 0.5
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function handleResize() {
    camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
}

let conversationHistory = [];

function clearChat() {
    chatMessages.innerHTML = '';
    conversationHistory = [];
    setExpression("default");
}

function copyChatHistory() {
    const textHistory = conversationHistory.map(msg => {
        const role = msg.role === 'user' ? 'You' : 'John';
        let content = msg.content.replace(/\[STATUS:(\{.*?\})\]/g, '').trim();
        return `${role}: ${content}`;
    }).join('\n\n');
    
    navigator.clipboard.writeText(textHistory).then(() => {
        const tempMsg = document.createElement('div');
        tempMsg.className = 'message system-message';
        tempMsg.textContent = 'Chat history copied!';
        chatMessages.appendChild(tempMsg);
        setTimeout(() => tempMsg.remove(), 3000);
    });
}

async function tryImportChatHistory(text) {
    try {
        if (text.includes('You:') || text.includes('John:')) {
            clearChat();
            const messageBlocks = text.split(/\n\n+/);
            messageBlocks.forEach(block => {
                const isUser = block.startsWith('You:');
                const content = block.substring(block.indexOf(':') + 1).trim();
                if (content) {
                    displayMessage(content, isUser ? 'user' : 'john');
                    conversationHistory.push({ role: isUser ? 'user' : 'assistant', content });
                }
            });
            return true;
        }
        return false;
    } catch (e) { return false; }
}

async function sendMessage() {
    const userMessage = userInput.value.trim();
    if (!userMessage) return;

    if (tryImportChatHistory(userMessage)) {
        userInput.value = '';
        return;
    }

    displayMessage(userMessage, 'user');
    userInput.value = '';
    typingIndicator.classList.remove('hidden');
    setExpression("thinking");

    const newMessage = { role: "user", content: userMessage };
    conversationHistory.push(newMessage);
    conversationHistory = conversationHistory.slice(-10);

    try {
        const response = await fetch("https://compressed-discovery-jan-maple.trycloudflare.com", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: `You are John Timbles. Respond in 1st person. Keep under 100 words. 
                        Always end with status JSON: [STATUS:{"emotion":"happy","species":"Human","location":"Home","goal":"Relaxing","mood":"Content","energy":80,"happiness":70,"social":60}]`
                    },
                    ...conversationHistory
                ],
                max_tokens: 200
            })
        });

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        typingIndicator.classList.add('hidden');
        
        let displayContent = aiResponse;
        let emotion = "default";
        const statusMatch = aiResponse.match(/\[STATUS:(\{.*?\})\]/);

        if (statusMatch) {
            try {
                const statusData = JSON.parse(statusMatch[1]);
                emotion = statusData.emotion || "default";
                Object.assign(johnStatus, statusData);
                updateStatusPanel();
                displayContent = aiResponse.replace(/\[STATUS:(\{.*?\})\]/, '').trim();
            } catch (e) { console.error(e); }
        }

        conversationHistory.push({ role: "assistant", content: aiResponse });
        displayMessage(displayContent, 'john');
        setExpression(emotion);

    } catch (error) {
        typingIndicator.classList.add('hidden');
        console.error("Connection Error:", error);
        displayMessage("Connection to local AI failed. Make sure KoboldCpp and Ngrok are running.", 'john');
        setExpression("sad");
    }
}

function displayMessage(content, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    
    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content';
    contentContainer.innerHTML = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    
    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.appendChild(contentContainer);
    messageElement.appendChild(timestamp);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

userInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text.includes('You:') || text.includes('John:')) {
        e.preventDefault();
        tryImportChatHistory(text);
    }
});

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
voiceButton.addEventListener('click', toggleSpeechRecognition);
emojiButton.addEventListener('click', () => toggleEmojiPicker());
clearChatButton.addEventListener('click', clearChat);
copyButton.addEventListener('click', copyChatHistory);
window.addEventListener('resize', handleResize);

loadCharacterModel();
initEmojiPicker();
setupSpeechRecognition();
updateStatusPanel();
animate();
