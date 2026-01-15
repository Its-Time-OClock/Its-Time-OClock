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
// In a real implementation, load a GLTF model with morph targets
function loadCharacterModel() {
    // Create a placeholder character geometry
    const geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0xbb4444 });
    character = new THREE.Mesh(geometry, material);
    character.position.set(0, 0.7, 0);
    character.castShadow = true;
    character.receiveShadow = true;
    scene.add(character);
    
    // Create a head
    const headGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffcbb3 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.7;
    head.castShadow = true;
    character.add(head);
    headBone = head;
    
    // Add eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(0.08, 0.05, 0.2);
    head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(-0.08, 0.05, 0.2);
    head.add(rightEye);
    
    // Add mouth
    const mouthGeometry = new THREE.BoxGeometry(0.15, 0.03, 0.05);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.1, 0.2);
    head.add(mouth);
    
    // Create ground
    const groundGeometry = new THREE.CircleGeometry(3, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xdadada });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Simple animation
    animateCharacter();
}

// Simple breathing/idle animation
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

// Set character expression
function setExpression(expression) {
    if (!expressions[expression]) {
        expression = "default";
    }
    
    currentExpression = expression;
    
    // Update emotion indicator
    emotionIcon.textContent = emotionIcons[expression] || emotionIcons.default;
    emotionText.textContent = expression;
    
    // In a real implementation, this would set morph target values
    // Here we'll just rotate the head slightly based on expression
    
    gsap.to(headBone.rotation, {
        x: expression === "sad" ? -0.2 : 
           expression === "happy" ? 0.1 : 
           expression === "surprised" ? 0.2 : 
           expression === "angry" ? -0.1 : 0,
        y: expression === "thinking" ? 0.3 : 0,
        duration: 0.5
    });
}

// Simple animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
function handleResize() {
    camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
}

// Chat functionality
let conversationHistory = [];

function clearChat() {
    chatMessages.innerHTML = '';
    conversationHistory = [];
    setExpression("default");
}

function copyChatHistory() {
    const textHistory = conversationHistory.map(msg => {
        const role = msg.role === 'user' ? 'You' : 'John';
        // Clean up status markers
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
            const tempMsg = document.createElement('div');
            tempMsg.classList.add('message', 'system-message', 'error-message');
            tempMsg.textContent = 'Failed to copy chat history. Please try again.';
            chatMessages.appendChild(tempMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(() => tempMsg.remove(), 3000);
        });
}

async function tryImportChatHistory(text) {
    try {
        // First try the new plaintext format
        if (text.includes('You:') || text.includes('John:')) {
            clearChat();
            
            // Split by double newlines to get message blocks
            const messageBlocks = text.split(/\n\n+/);
            
            messageBlocks.forEach(block => {
                const isUserMessage = block.startsWith('You:');
                const isJohnMessage = block.startsWith('John:');
                
                if (isUserMessage || isJohnMessage) {
                    // Extract content after the prefix
                    const content = block.substring(block.indexOf(':') + 1).trim();
                    const sender = isUserMessage ? 'user' : 'john';
                    
                    // Display the message
                    displayMessage(content, sender);
                    
                    // Add to conversation history
                    conversationHistory.push({
                        role: isUserMessage ? 'user' : 'assistant',
                        content: content
                    });
                }
            });
            
            return true;
        }
        
        // Fallback to try JSON format for backward compatibility
        const parsedHistory = JSON.parse(text);
        
        if (Array.isArray(parsedHistory) && parsedHistory.length > 0 && 
            parsedHistory.every(msg => msg.role && typeof msg.content === 'string')) {
            
            clearChat();
            conversationHistory = parsedHistory;
            
            parsedHistory.forEach(msg => {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    const sender = msg.role === 'user' ? 'user' : 'john';
                    let content = msg.content;
                    
                    // Clean up status markers if they exist
                    content = content.replace(/\[STATUS:(\{.*?\})\]/g, '').trim();
                    content = content.replace(/\[emotion:(happy|sad|surprised|angry|thinking|default)\]/gi, '').trim();
                    
                    displayMessage(content, sender);
                }
            });
            
            // Update status based on last response if available
            const lastResponse = parsedHistory.filter(msg => msg.role === 'assistant').pop()?.content;
            if (lastResponse) {
                let statusMatch = lastResponse.match(/\[STATUS:(\{.*?\})\]/);
                if (statusMatch) {
                    try {
                        let statusData = JSON.parse(statusMatch[1]);
                        if (statusData.emotion) setExpression(statusData.emotion);
                        if (statusData.location) johnStatus.location = statusData.location;
                        if (statusData.goal) johnStatus.goal = statusData.goal;
                        if (statusData.mood) johnStatus.mood = statusData.mood;
                        if (statusData.energy !== undefined) johnStatus.energy = statusData.energy;
                        if (statusData.happiness !== undefined) johnStatus.happiness = statusData.happiness;
                        if (statusData.social !== undefined) johnStatus.social = statusData.social;
                        if (statusData.species) johnStatus.species = statusData.species;
                        updateStatusPanel();
                    } catch (e) {
                        console.error("Error parsing imported status data:", e);
                    }
                }
            }
            
            return true;
        }
        return false;
    } catch (e) {
        // If JSON parsing failed, try to handle as plaintext anyway
        if (text.includes(':')) {
            // This might be plaintext even if it's not perfectly formatted
            const lines = text.split('\n');
            let currentSender = null;
            let currentContent = '';
            
            clearChat();
            conversationHistory = [];
            
            lines.forEach(line => {
                if (line.includes('You:') || line.includes('John:')) {
                    // Save previous message if there was one
                    if (currentSender && currentContent.trim()) {
                        displayMessage(currentContent.trim(), currentSender);
                        conversationHistory.push({
                            role: currentSender === 'user' ? 'user' : 'assistant',
                            content: currentContent.trim()
                        });
                    }
                    
                    // Start new message
                    currentSender = line.includes('You:') ? 'user' : 'john';
                    currentContent = line.substring(line.indexOf(':') + 1).trim();
                } else if (currentSender) {
                    // Continue previous message
                    currentContent += '\n' + line;
                }
            });
            
            // Add the last message if there is one
            if (currentSender && currentContent.trim()) {
                displayMessage(currentContent.trim(), currentSender);
                conversationHistory.push({
                    role: currentSender === 'user' ? 'user' : 'assistant',
                    content: currentContent.trim()
                });
            }
            
            return true;
        }
        
        console.error("Error importing chat history:", e);
        return false;
    }
}

async function sendMessage() {
    const userMessage = userInput.value.trim();
    
    // Check if this is a pasted chat history even if message is empty
    if (userMessage && (userMessage.includes('You:') || userMessage.includes('John:') || 
        (userMessage.startsWith('[') && userMessage.includes('"role"')) || 
        (userMessage.startsWith('{') && userMessage.includes('"role"')))) {
        if (tryImportChatHistory(userMessage)) {
            userInput.value = '';
            return;
        }
    }
    
    // Only display user message if not empty
    if (userMessage) {
        displayMessage(userMessage, 'user');
    }
    
    // Clear input
    userInput.value = '';
    
    // Show typing indicator
    typingIndicator.classList.remove('hidden');
    
    // Simulate thinking
    setExpression("thinking");
    
    try {
        // Only add user message to history if not empty
        if (userMessage) {
            const newMessage = {
                role: "user",
                content: userMessage
            };
            conversationHistory.push(newMessage);
        }
        conversationHistory = conversationHistory.slice(-10);
        
        // Get response from AI
       // 1. Change this to your actual ngrok or tunnel URL!
const KOBOLD_URL = "https://your-ngrok-url-here.ngrok-free.app/v1/chat/completions";

const websim = {
    chat: {
        completions: {
            create: async function(options) {
                try {
                    // Show typing indicator
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Call your local KoboldCPP
                    const response = await fetch(KOBOLD_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "koboldcpp",
                            // We pass the messages (including the system prompt) to your local AI
                            messages: options.messages, 
                            max_tokens: 200,
                            temperature: 0.7
                        })
                    });

                    const data = await response.json();
                    
                    // Return the response in the format the rest of your script expects
                    return {
                        content: data.choices[0].message.content,
                        role: "assistant"
                    };

                } catch (error) {
                    console.error("Kobold Error:", error);
                    return {
                        content: "I'm having trouble connecting to your local AI. Is KoboldCPP and ngrok running?",
                        role: "assistant"
                    };
                }
            }
        }
    }
};
        
        // Hide typing indicator
        typingIndicator.classList.add('hidden');
        
        let response = completion.content;
        conversationHistory.push(completion);
        
        // Parse status from response
        let emotion = "default";
        let statusMatch = response.match(/\[STATUS:(\{.*?\})\]/);
        
        if (statusMatch) {
            try {
                let statusData = JSON.parse(statusMatch[1]);
                emotion = statusData.emotion || "default";
                
                // Update John's status
                if (statusData.species) johnStatus.species = statusData.species;
                if (statusData.location) johnStatus.location = statusData.location;
                if (statusData.goal) johnStatus.goal = statusData.goal;
                if (statusData.mood) johnStatus.mood = statusData.mood;
                if (statusData.energy !== undefined) johnStatus.energy = statusData.energy;
                if (statusData.happiness !== undefined) johnStatus.happiness = statusData.happiness;
                if (statusData.social !== undefined) johnStatus.social = statusData.social;
                
                // Update status panel
                updateStatusPanel();
                
                // Remove status data from display
                response = response.replace(/\[STATUS:(\{.*?\})\]/, '').trim();
            } catch (e) {
                console.error("Error parsing status data:", e);
            }
        } else {
            // Legacy emotion parsing
            const emotionMatch = response.match(/\[emotion:(happy|sad|surprised|angry|thinking|default)\]/i);
            if (emotionMatch) {
                emotion = emotionMatch[1].toLowerCase();
                // Remove emotion tag from display
                response = response.replace(/\[emotion:(happy|sad|surprised|angry|thinking|default)\]/i, '').trim();
            }
        }
        
        // Additional cleanup to remove any remaining code blocks or JSON formatting
        response = response.replace(/```json[\s\S]*?```/g, '').trim();
        response = response.replace(/```[\s\S]*?```/g, '').trim();
        
        // Display John's response with a slight delay for realism
        setTimeout(() => {
            displayMessage(response, 'john');
            // Set character expression
            setExpression(emotion);
        }, 300);
        
    } catch (error) {
        // Hide typing indicator
        typingIndicator.classList.add('hidden');
        
        console.error("Error getting response:", error);
        displayMessage("Sorry, I'm having trouble responding right now.", 'john');
        setExpression("sad");
    }
}

function displayMessage(content, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender + '-message');
    
    // Convert URLs to clickable links
    const linkedContent = content.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank">$1</a>'
    );
    
    // Create main content container
    const contentContainer = document.createElement('div');
    contentContainer.classList.add('message-content');
    contentContainer.innerHTML = linkedContent;
    messageElement.appendChild(contentContainer);
    
    // Add timestamp
    const timestamp = document.createElement('div');
    timestamp.classList.add('timestamp');
    timestamp.textContent = getTimeString();
    messageElement.appendChild(timestamp);
    
    // Add edit button for John's messages
    if (sender === 'john') {
        const actionButtons = document.createElement('div');
        actionButtons.classList.add('message-actions');
        
        const editButton = document.createElement('button');
        editButton.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">edit</span>';
        editButton.title = 'Edit message';
        editButton.addEventListener('click', () => {
            toggleEditMode(messageElement, contentContainer.innerHTML);
        });
        actionButtons.appendChild(editButton);
        messageElement.appendChild(actionButtons);
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle edit mode for a message
function toggleEditMode(messageElement, content) {
    const contentContainer = messageElement.querySelector('.message-content');
    
    // If already in edit mode, exit
    if (messageElement.classList.contains('edit-mode')) {
        messageElement.classList.remove('edit-mode');
        return;
    }
    
    // Save original content for potential cancellation
    messageElement.dataset.originalContent = contentContainer.innerHTML;
    
    // Enter edit mode
    messageElement.classList.add('edit-mode');
    
    // Hide message actions while editing
    const messageActions = messageElement.querySelector('.message-actions');
    if (messageActions) messageActions.style.display = 'none';
    
    // Create edit textarea
    const textarea = document.createElement('textarea');
    textarea.classList.add('edit-textarea');
    
    // Clean content of HTML tags for editing
    let cleanContent = content;
    cleanContent = cleanContent.replace(/<a href="(.*?)".*?>(.*?)<\/a>/g, '$1');
    cleanContent = cleanContent.replace(/<[^>]*>/g, '');
    
    textarea.value = cleanContent.trim();
    
    // Create edit actions container
    const editActions = document.createElement('div');
    editActions.classList.add('edit-actions');
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.classList.add('save-btn');
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => {
        saveMessageEdit(messageElement, textarea.value);
    });
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.classList.add('cancel-btn');
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
        cancelMessageEdit(messageElement);
    });
    
    // Add buttons to actions container
    editActions.appendChild(cancelButton);
    editActions.appendChild(saveButton);
    
    // Clear and rebuild content area
    contentContainer.innerHTML = '';
    contentContainer.appendChild(textarea);
    contentContainer.appendChild(editActions);
    
    // Focus the textarea
    textarea.focus();
}

// Save edited message
function saveMessageEdit(messageElement, newContent) {
    const contentContainer = messageElement.querySelector('.message-content');
    
    // Convert URLs to clickable links
    const linkedContent = newContent.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank">$1</a>'
    );
    
    // Update content
    contentContainer.innerHTML = linkedContent;
    
    // Update in conversation history if needed
    // This would need to update the actual history array that's sent to the AI
    
    // Exit edit mode
    messageElement.classList.remove('edit-mode');
    
    // Show message actions again
    const messageActions = messageElement.querySelector('.message-actions');
    if (messageActions) messageActions.style.display = '';
}

// Cancel message editing
function cancelMessageEdit(messageElement) {
    const contentContainer = messageElement.querySelector('.message-content');
    
    // Restore original content
    contentContainer.innerHTML = messageElement.dataset.originalContent;
    
    // Exit edit mode
    messageElement.classList.remove('edit-mode');
    
    // Show message actions again
    const messageActions = messageElement.querySelector('.message-actions');
    if (messageActions) messageActions.style.display = '';
}

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!emojiButton.contains(e.target) && !emojiPicker.contains(e.target)) {
        toggleEmojiPicker(false);
    }
});

// User input paste handler
userInput.addEventListener('paste', (e) => {
    // Get pasted content directly from clipboard data
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');
    
    if (pastedText && (pastedText.includes('You:') || pastedText.includes('John:') || 
        (pastedText.startsWith('[') && pastedText.includes('"role"')) || 
        (pastedText.startsWith('{') && pastedText.includes('"role"')))) {
        e.preventDefault(); // Prevent default paste
        if (tryImportChatHistory(pastedText)) {
            userInput.value = '';
        }
    }
});

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
voiceButton.addEventListener('click', toggleSpeechRecognition);
emojiButton.addEventListener('click', () => toggleEmojiPicker());
clearChatButton.addEventListener('click', clearChat);
copyButton.addEventListener('click', copyChatHistory);
window.addEventListener('resize', handleResize);

// Initialize
loadCharacterModel();
initEmojiPicker();
setupSpeechRecognition();
updateStatusPanel(); // Initialize status panel
animate();

// Mock websim API for chat completions
const websim = {
    chat: {
        completions: {
            create: async function(options) {
                try {
                    // Show typing indicator for a realistic delay
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Use the actual LLM API
                    const completion = await window.websim.chat.completions.create(options);
                    return completion;
                } catch (error) {
                    console.error("Error calling AI:", error);
                    return {
                        content: "I'm having trouble connecting. Let's try again in a moment. [STATUS:{\"emotion\":\"sad\",\"species\":\"Human\",\"location\":\"" + johnStatus.location + "\",\"goal\":\"Trying to communicate\",\"mood\":\"Concerned\",\"energy\":" + johnStatus.energy + ",\"happiness\":" + (johnStatus.happiness - 10) + ",\"social\":" + johnStatus.social + "}]",
                        role: "assistant"
                    };
                }
            }
        }
    }
};

function getTimeString() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + 
           now.getMinutes().toString().padStart(2, '0');
}
