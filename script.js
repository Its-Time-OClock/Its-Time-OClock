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
let morphTargets = {};

// Emotion icons map
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

// Update John's status panel
function updateStatusPanel() {
    johnSpecies.textContent = johnStatus.species;
    johnLocation.textContent = johnStatus.location;
    johnGoal.textContent = johnStatus.goal;
    johnMood.textContent = johnStatus.mood;
    
    energyBar.style.width = johnStatus.energy + '%';
    happinessBar.style.width = johnStatus.happiness + '%';
    socialBar.style.width = johnStatus.social + '%';
}

// Initialize emoji picker
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

// Toggle emoji picker visibility
function toggleEmojiPicker(show) {
    if (show === undefined) {
        emojiPicker.classList.toggle('hidden');
    } else {
        emojiPicker.classList.toggle('hidden', !show);
    }
}

// Speech recognition setup
let recognition;
function setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = function() {
            voiceButton.classList.add('recording');
        };
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
        };
        
        recognition.onend = function() {
            voiceButton.classList.remove('recording');
        };
        
        recognition.onerror = function(event) {
            console.error('Speech recognition error', event.error);
            voiceButton.classList.remove('recording');
        };
    } else {
        voiceButton.style.display = 'none';
    }
}

// Toggle speech recognition
function toggleSpeechRecognition() {
    if (voiceButton.classList.contains('recording')) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

// Placeholder function to load character model
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
    if (!expressions[expression]) {
        expression = "default";
    }
    
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
        content = content.replace(/\[emotion:(happy|sad|surprised|angry|thinking|default)\]/gi, '').trim();
        return `${role}: ${content}`;
    }).join('\n\n');
    
    navigator.clipboard.writeText(textHistory)
        .then(() => {
            const tempMsg = document.createElement('div');
            tempMsg.classList.add('message', 'system-message');
            tempMsg.textContent = 'Chat history copied to clipboard!';
            chatMessages.appendChild(tempMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(() => tempMsg.remove(), 3000);
        })
        .catch(err => {
            console.error('Failed to copy chat history:', err);
        });
}

async function tryImportChatHistory(text) {
    try {
        if (text.includes('You:') || text.includes('John:')) {
            clearChat();
            const messageBlocks = text.split(/\n\n+/);
            messageBlocks.forEach(block => {
                const isUserMessage = block.startsWith('You:');
                const isJohnMessage = block.startsWith('John:');
                if (isUserMessage || isJohnMessage) {
                    const content = block.substring(block.indexOf(':') + 1).trim();
                    const sender = isUserMessage ? 'user' : 'john';
                    displayMessage(content, sender);
                    conversationHistory.push({
                        role: isUserMessage ? 'user' : 'assistant',
                        content: content
                    });
                }
            });
            return true;
        }
        return false;
    } catch (e) {
        console.error("Error importing chat history:", e);
        return false;
    }
}

async function sendMessage() {
    const userMessage = userInput.value.trim();
    if (userMessage && (userMessage.includes('You:') || userMessage.includes('John:'))) {
        if (tryImportChatHistory(userMessage)) {
            userInput.value = '';
            return;
        }
    }
    if (userMessage) {
        displayMessage(userMessage, 'user');
    }
    userInput.value = '';
    typingIndicator.classList.remove('hidden');
    setExpression("thinking");
    
    try {
        if (userMessage) {
            conversationHistory.push({ role: "user", content: userMessage });
        }
        conversationHistory = conversationHistory.slice(-10);
        
        // --- MODIFIED CALL TO KOBOLD CCP ---
        const completion = await websim.chat.completions.create({
            messages: conversationHistory
        });
        
        typingIndicator.classList.add('hidden');
        let response = completion.content;
        conversationHistory.push(completion);
        
        let emotion = "default";
        let statusMatch = response.match(/\[STATUS:(\{.*?\})\]/);
        
        if (statusMatch) {
            try {
                let statusData = JSON.parse(statusMatch[1]);
                emotion = statusData.emotion || "default";
                if (statusData.species) johnStatus.species = statusData.species;
                if (statusData.location) johnStatus.location = statusData.location;
                if (statusData.goal) johnStatus.goal = statusData.goal;
                if (statusData.mood) johnStatus.mood = statusData.mood;
                if (statusData.energy !== undefined) johnStatus.energy = statusData.energy;
                if (statusData.happiness !== undefined) johnStatus.happiness = statusData.happiness;
                if (statusData.social !== undefined) johnStatus.social = statusData.social;
                updateStatusPanel();
                response = response.replace(/\[STATUS:(\{.*?\})\]/, '').trim();
            } catch (e) { console.error("Error parsing status data:", e); }
        }
        
        response = response.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
        
        setTimeout(() => {
            displayMessage(response, 'john');
            setExpression(emotion);
        }, 300);
        
    } catch (error) {
        typingIndicator.classList.add('hidden');
        console.error("Error getting response:", error);
        displayMessage("Sorry, I'm having trouble responding right now.", 'john');
        setExpression("sad");
    }
}

function displayMessage(content, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender + '-message');
    const linkedContent = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    
    const contentContainer = document.createElement('div');
    contentContainer.classList.add('message-content');
    contentContainer.innerHTML = linkedContent;
    messageElement.appendChild(contentContainer);
    
    const timestamp = document.createElement('div');
    timestamp.classList.add('timestamp');
    timestamp.textContent = getTimeString();
    messageElement.appendChild(timestamp);
    
    if (sender === 'john') {
        const actionButtons = document.createElement('div');
        actionButtons.classList.add('message-actions');
        const editButton = document.createElement('button');
        editButton.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">edit</span>';
        editButton.addEventListener('click', () => toggleEditMode(messageElement, contentContainer.innerHTML));
        actionButtons.appendChild(editButton);
        messageElement.appendChild(actionButtons);
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function toggleEditMode(messageElement, content) {
    const contentContainer = messageElement.querySelector('.message-content');
    if (messageElement.classList.contains('edit-mode')) {
        messageElement.classList.remove('edit-mode');
        return;
    }
    messageElement.dataset.originalContent = contentContainer.innerHTML;
    messageElement.classList.add('edit-mode');
    const textarea = document.createElement('textarea');
    textarea.classList.add('edit-textarea');
    let cleanContent = content.replace(/<a href="(.*?)".*?>(.*?)<\/a>/g, '$1').replace(/<[^>]*>/g, '');
    textarea.value = cleanContent.trim();
    const editActions = document.createElement('div');
    editActions.classList.add('edit-actions');
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => saveMessageEdit(messageElement, textarea.value));
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => cancelMessageEdit(messageElement));
    editActions.appendChild(cancelButton);
    editActions.appendChild(saveButton);
    contentContainer.innerHTML = '';
    contentContainer.appendChild(textarea);
    contentContainer.appendChild(editActions);
    textarea.focus();
}

function saveMessageEdit(messageElement, newContent) {
    const contentContainer = messageElement.querySelector('.message-content');
    const linkedContent = newContent.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    contentContainer.innerHTML = linkedContent;
    messageElement.classList.remove('edit-mode');
}

function cancelMessageEdit(messageElement) {
    const contentContainer = messageElement.querySelector('.message-content');
    contentContainer.innerHTML = messageElement.dataset.originalContent;
    messageElement.classList.remove('edit-mode');
}

userInput.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');
    if (pastedText && (pastedText.includes('You:') || pastedText.includes('John:'))) {
        e.preventDefault();
        if (tryImportChatHistory(pastedText)) userInput.value = '';
    }
});

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
voiceButton.addEventListener('click', toggleSpeechRecognition);
emojiButton.addEventListener('click', () => toggleEmojiPicker());
clearChatButton.addEventListener('click', clearChat);
copyButton.addEventListener('click', copyChatHistory);
window.addEventListener('resize', handleResize);

// Initialize
loadCharacterModel();
initEmojiPicker();
setupSpeechRecognition();
updateStatusPanel();
animate();

// --- KOBOLD CCP API ADAPTER ---
const websim = {
    chat: {
        completions: {
            create: async function(options) {
                try {
                    // System prompt for John's personality
                    const systemPrompt = `You are roleplaying as John Timbles, a complex 3D human character.
Respond in the first person AS John Timbles. Keep responses under 100 words.
After your response, ALWAYS include status JSON:
[STATUS:{"emotion":"happy","species":"Human","location":"Home","goal":"Relaxing","mood":"Content","energy":80,"happiness":70,"social":60}]
Emotions: happy, sad, surprised, angry, thinking, default.`;

                    // Construct the prompt string from history
                    let fullPrompt = systemPrompt + "\n\n";
                    options.messages.forEach(msg => {
                        const name = msg.role === 'user' ? 'You' : 'John';
                        fullPrompt += `${name}: ${msg.content}\n`;
                    });
                    fullPrompt += "John:";

                    const response = await fetch("https://compressed-discovery-jan-maple.trycloudflare.com/api/v1/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            prompt: fullPrompt,
                            max_length: 120,
                            max_context_length: 2048,
                            temperature: 0.7,
                            top_p: 0.9,
                            quiet: true
                        })
                    });

                    const data = await response.json();
                    return {
                        content: data.results[0].text.trim(),
                        role: "assistant"
                    };
                } catch (error) {
                    console.error("Kobold Error:", error);
                    return {
                        content: "I'm having trouble connecting to my brain. [STATUS:{\"emotion\":\"sad\",\"mood\":\"Disconnected\"}]",
                        role: "assistant"
                    };
                }
            }
        }
    }
};

function getTimeString() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}
