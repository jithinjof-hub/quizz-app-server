// Main App Controller for YouTube Shorts Quiz Video Generator
import { exporterController } from './exporter-controller.js';

// State Management
let state = {
  scenes: [
    {
      id: 'default-1',
      imageSrc: 'assets/eiffel_tower.jpg',
      correctAnswer: 'Eiffel Tower',
      imageLoaded: null // HTMLImageElement
    },
    {
      id: 'default-2',
      imageSrc: 'assets/colosseum.jpg',
      correctAnswer: 'Colosseum',
      imageLoaded: null // HTMLImageElement
    }
  ],
  template: {
    questionText: 'What is this called?',
    timerDuration: 5, // seconds
    ttsEngine: 'cloud', // 'cloud' (Puter OpenAI) or 'local' (SpeechSynthesis)
    voiceGender: 'male', // 'male' or 'female'
    voiceSpeed: 1.0, // 0.5 to 2.0
    bgType: 'gradient', // 'solid', 'gradient', 'image', 'video'
    bgStyle: 'linear-gradient(135deg, #1f0f3d, #070b19)', // current style or color
    bgImage: null, // HTMLImageElement or Image URL
    bgVideo: null, // Video file object
    textColor: '#ffffff',
    fontSize: 64, // px
    logoSrc: null, // Logo Image Data URL / ObjectURL
    logoLoaded: null, // HTMLImageElement
    logoPosition: 'top', // 'top', 'bottom', 'none'
    logoScale: 1.0 // multiplier
  },
  playback: {
    isPlaying: false,
    currentSceneIndex: 0,
    currentTime: 0, // seconds relative to current scene
    rafId: null,
    lastFrameTime: 0,
    audioContext: null
  },
  exporting: {
    isExporting: false,
    progress: 0,
    worker: null
  }
};

// UI Elements
const el = {
  questionText: document.getElementById('question-text'),
  timerDuration: document.getElementById('timer-duration'),
  ttsEngine: document.getElementById('tts-engine'),
  voiceGenderToggle: document.getElementById('voice-gender-toggle'),
  voiceSpeed: document.getElementById('voice-speed'),
  voiceSpeedVal: document.getElementById('voice-speed-val'),
  
  bgType: document.getElementById('background-type'),
  bgGradientControls: document.getElementById('bg-gradient-controls'),
  bgSolidControls: document.getElementById('bg-solid-controls'),
  solidColor: document.getElementById('solid-color'),
  bgImageControls: document.getElementById('bg-image-controls'),
  bgImageFile: document.getElementById('bg-image-file'),
  bgImageFilename: document.getElementById('bg-image-filename'),
  bgVideoControls: document.getElementById('bg-video-controls'),
  bgVideoFile: document.getElementById('bg-video-file'),
  bgVideoFilename: document.getElementById('bg-video-filename'),
  
  textColor: document.getElementById('text-color'),
  fontSize: document.getElementById('font-size'),
  fontSizeVal: document.getElementById('font-size-val'),
  logoFile: document.getElementById('logo-file'),
  logoPosition: document.getElementById('logo-position'),
  logoScaleContainer: document.getElementById('logo-scale-container'),
  logoScale: document.getElementById('logo-scale'),
  logoScaleVal: document.getElementById('logo-scale-val'),
  
  addSceneBtn: document.getElementById('add-scene-btn'),
  scenesList: document.getElementById('scenes-list'),
  
  canvas: document.getElementById('quiz-canvas'),
  statusBubble: document.getElementById('status-bubble'),
  playBtn: document.getElementById('play-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  stopBtn: document.getElementById('stop-btn'),
  exportBtn: document.getElementById('export-btn'),
  downloadLink: document.getElementById('download-link'),
  
  progressContainer: document.getElementById('progress-container'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercentage: document.getElementById('progress-percentage'),
  progressBar: document.getElementById('progress-bar'),
  newVideoBtn: document.getElementById('new-video-btn'),
  
  bgLoopVideo: document.getElementById('bg-loop-video'),
  ttsPreviewAudio: document.getElementById('tts-preview-audio'),
  exportPreviewVideo: document.getElementById('export-preview-video')
};

// Canvas Setup
const ctx = el.canvas.getContext('2d');

// Cache generated audio buffers to optimize single-export playback
let ttsCache = {};

// --- Initialization ---
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadDefaultImages();
  renderScenesList();
  drawFrame(); // Initial idle frame
});

// Load Eiffel Tower and Colosseum default images
function loadDefaultImages() {
  state.scenes.forEach(scene => {
    const img = new Image();
    img.src = scene.imageSrc;
    img.onload = () => {
      scene.imageLoaded = img;
      if (!state.playback.isPlaying) drawFrame();
    };
  });
}

// Setup Event Listeners for controls
function setupEventListeners() {
  // Input fields binding to state
  el.questionText.addEventListener('input', (e) => {
    state.template.questionText = e.target.value;
    drawFrame();
  });

  el.timerDuration.addEventListener('change', (e) => {
    state.template.timerDuration = parseInt(e.target.value, 10);
  });

  el.ttsEngine.addEventListener('change', (e) => {
    state.template.ttsEngine = e.target.value;
  });

  // Gender toggle listener
  el.voiceGenderToggle.addEventListener('change', (e) => {
    state.template.voiceGender = e.target.checked ? 'female' : 'male';
    
    // Toggle active classes on labels
    const maleLabel = document.querySelector('.toggle-label.male');
    const femaleLabel = document.querySelector('.toggle-label.female');
    if (e.target.checked) {
      maleLabel.classList.remove('active');
      femaleLabel.classList.add('active');
    } else {
      maleLabel.classList.add('active');
      femaleLabel.classList.remove('active');
    }
  });

  el.voiceSpeed.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.template.voiceSpeed = val;
    el.voiceSpeedVal.textContent = val.toFixed(1) + 'x';
  });

  // Background Customization Toggle
  el.bgType.addEventListener('change', (e) => {
    const type = e.target.value;
    state.template.bgType = type;
    
    // Toggle controls visibility
    el.bgGradientControls.classList.toggle('hidden', type !== 'gradient');
    el.bgSolidControls.classList.toggle('hidden', type !== 'solid');
    el.bgImageControls.classList.toggle('hidden', type !== 'image');
    el.bgVideoControls.classList.toggle('hidden', type !== 'video');

    if (type === 'solid') {
      state.template.bgStyle = el.solidColor.value;
    } else if (type === 'gradient') {
      const activeGradient = document.querySelector('.bg-preset-btn.active');
      if (activeGradient) state.template.bgStyle = activeGradient.dataset.style;
    }
    
    drawFrame();
  });

  // Gradient presets binding
  document.querySelectorAll('.bg-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.bg-preset-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.template.bgStyle = e.target.dataset.style;
      drawFrame();
    });
  });

  // Solid Color Pick
  el.solidColor.addEventListener('input', (e) => {
    state.template.bgStyle = e.target.value;
    drawFrame();
  });

  // Background Image Upload
  el.bgImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      el.bgImageFilename.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          state.template.bgImage = img;
          drawFrame();
        };
      };
      reader.readAsDataURL(file);
    }
  });

  // Background Video Upload
  el.bgVideoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      el.bgVideoFilename.textContent = file.name;
      state.template.bgVideo = file;
      const url = URL.createObjectURL(file);
      el.bgLoopVideo.src = url;
      el.bgLoopVideo.load();
      el.bgLoopVideo.onloadeddata = () => {
        if (!state.playback.isPlaying) drawFrame();
      };
    }
  });

  // Font styling
  el.textColor.addEventListener('input', (e) => {
    state.template.textColor = e.target.value;
    drawFrame();
  });

  el.fontSize.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.template.fontSize = val;
    el.fontSizeVal.textContent = val + 'px';
    drawFrame();
  });

  // Logo setup
  el.logoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        state.template.logoSrc = event.target.result;
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          state.template.logoLoaded = img;
          el.logoScaleContainer.classList.remove('hidden');
          drawFrame();
        };
      };
      reader.readAsDataURL(file);
    }
  });

  el.logoPosition.addEventListener('change', (e) => {
    state.template.logoPosition = e.target.value;
    drawFrame();
  });

  el.logoScale.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.template.logoScale = val / 100;
    el.logoScaleVal.textContent = val + '%';
    drawFrame();
  });

  // Playback control buttons
  el.playBtn.addEventListener('click', startQuizPlayback);
  el.pauseBtn.addEventListener('click', pauseQuizPlayback);
  el.stopBtn.addEventListener('click', stopQuizPlayback);

  // Scene Editor: Add scene
  el.addSceneBtn.addEventListener('click', () => {
    const newScene = {
      id: 'scene-' + Date.now(),
      imageSrc: '',
      correctAnswer: '',
      imageLoaded: null
    };
    state.scenes.push(newScene);
    renderScenesList();
  });

  // Video Export trigger
  el.exportBtn.addEventListener('click', startVideoExport);

  // New Video trigger
  el.newVideoBtn.addEventListener('click', () => {
    resetEditorState();
  });
}

// --- Drag-to-Reorder Scene UI ---
let draggedIdx = null;

function renderScenesList() {
  el.scenesList.innerHTML = '';
  
  if (state.scenes.length === 0) {
    el.scenesList.innerHTML = '<div class="help-text" style="text-align:center; padding: 20px;">No scenes. Click Add Scene to begin.</div>';
    return;
  }

  state.scenes.forEach((scene, index) => {
    const card = document.createElement('div');
    card.className = 'scene-item-card';
    card.draggable = true;
    card.dataset.index = index;

    // Index Badge
    const badge = document.createElement('span');
    badge.className = 'scene-index-badge';
    badge.textContent = index + 1;
    card.appendChild(badge);

    // Drag Handle Icon
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = `
      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
    `;
    card.appendChild(dragHandle);

    // Thumbnail Preview
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'scene-thumb-wrapper';
    
    if (scene.imageLoaded) {
      const thumbImg = document.createElement('img');
      thumbImg.src = scene.imageSrc;
      thumbImg.className = 'scene-thumb';
      thumbWrapper.appendChild(thumbImg);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'scene-thumb-placeholder';
      placeholder.textContent = 'Upload Image';
      thumbWrapper.appendChild(placeholder);
      
      // Image upload click listener
      thumbWrapper.style.cursor = 'pointer';
      thumbWrapper.addEventListener('click', () => fileInput.click());
    }
    
    // Hidden file input for scene image
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          scene.imageSrc = evt.target.result;
          const img = new Image();
          img.src = evt.target.result;
          img.onload = () => {
            scene.imageLoaded = img;
            renderScenesList();
            if (state.playback.currentSceneIndex === index) drawFrame();
          };
        };
        reader.readAsDataURL(file);
      }
    });
    
    card.appendChild(fileInput);
    card.appendChild(thumbWrapper);

    // Details Input Panel
    const details = document.createElement('div');
    details.className = 'scene-details';
    
    const label = document.createElement('label');
    label.textContent = 'Correct Answer';
    label.style.fontSize = '11px';
    label.style.fontWeight = '600';
    label.style.color = 'var(--text-secondary)';
    
    const ansInput = document.createElement('input');
    ansInput.type = 'text';
    ansInput.value = scene.correctAnswer;
    ansInput.placeholder = 'e.g. Statue of Liberty';
    ansInput.style.padding = '6px 10px';
    ansInput.addEventListener('input', (e) => {
      scene.correctAnswer = e.target.value;
      if (state.playback.currentSceneIndex === index) drawFrame();
    });

    details.appendChild(label);
    details.appendChild(ansInput);
    card.appendChild(details);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'scene-actions';

    // Play/Preview single scene
    const playBtn = document.createElement('button');
    playBtn.className = 'btn-icon play-scene-btn';
    playBtn.title = 'Preview this scene';
    playBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
    `;
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      previewSingleScene(index);
    });

    // Delete Scene
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon delete-btn';
    deleteBtn.title = 'Delete scene';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.scenes.splice(index, 1);
      renderScenesList();
      if (state.playback.currentSceneIndex >= state.scenes.length) {
        state.playback.currentSceneIndex = Math.max(0, state.scenes.length - 1);
      }
      drawFrame();
    });

    actions.appendChild(playBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    // --- HTML5 Drag-and-Drop Event Bindings ---
    card.addEventListener('dragstart', (e) => {
      draggedIdx = index;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedIdx = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.style.borderTop = '2px solid var(--accent-purple)';
    });

    card.addEventListener('dragleave', () => {
      card.style.borderTop = '';
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.style.borderTop = '';
      const targetIdx = parseInt(card.dataset.index, 10);
      if (draggedIdx !== null && draggedIdx !== targetIdx) {
        // Swap scene positions in array
        const draggedItem = state.scenes.splice(draggedIdx, 1)[0];
        state.scenes.splice(targetIdx, 0, draggedItem);
        renderScenesList();
        drawFrame();
      }
    });

    el.scenesList.appendChild(card);
  });
}

// --- Precise Live Audio Ticking scheduler ---
function playTickTockLive(audioCtx, playTime, isTock = false) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isTock ? 2200 : 3000, playTime);
    osc.frequency.exponentialRampToValueAtTime(100, playTime + 0.03);
    
    gain.gain.setValueAtTime(isTock ? 0.25 : 0.3, playTime);
    gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.03);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(playTime);
    osc.stop(playTime + 0.05);
    
    // Save reference so we can stop it if the user pauses or stops
    liveScheduleSourceNodes.push(osc);
  } catch (e) {
    console.error("Synthesizer error:", e);
  }
}

// Old ticking scheduler kept for offline mix pipeline
function playTickTock(audioCtx, time, isTock = false) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isTock ? 2200 : 3000, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.03);
    
    gain.gain.setValueAtTime(isTock ? 0.25 : 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(time);
    osc.stop(time + 0.05);
  } catch (e) {
    console.error("Synthesizer error:", e);
  }
}

// --- Text-To-Speech (TTS) engine integration ---

async function fetchCloudTTS(text, gender) {
  const cacheKey = `${text}_${gender}`;
  if (ttsCache[cacheKey]) return ttsCache[cacheKey];

  // Hard 3.5s timeout on Puter Cloud calls to prevent hanging loops
  const ttsPromise = (async () => {
    const voice = gender === 'female' ? 'nova' : 'onyx';
    const audioEl = await puter.ai.txt2speech(text, {
      provider: 'openai',
      voice: voice
    });

    const res = await fetch(audioEl.src);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    const audioContext = getAudioContext();
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    return {
      buffer: decodedBuffer,
      blobUrl: URL.createObjectURL(blob)
    };
  })();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Cloud TTS Request Timed Out')), 3500);
  });

  const result = await Promise.race([ttsPromise, timeoutPromise]);
  ttsCache[cacheKey] = result;
  return result;
}

// Local System TTS Fallback (Offline)
let localSpeechUtterance = null;
function speakLocal(text, gender, speed, onEnd) {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }

  localSpeechUtterance = new SpeechSynthesisUtterance(text);
  localSpeechUtterance.rate = speed;

  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const highQualityPool = englishVoices.filter(v => 
    v.name.includes('Google') || 
    v.name.includes('Natural') || 
    v.name.includes('Microsoft') || 
    v.name.includes('Apple') ||
    v.name.includes('Siri')
  );

  const searchPool = highQualityPool.length > 0 ? highQualityPool : englishVoices;
  let voiceSelected = null;

  if (gender === 'female') {
    voiceSelected = searchPool.find(v => 
      v.name.toLowerCase().includes('female') || 
      v.name.toLowerCase().includes('zira') || 
      v.name.toLowerCase().includes('hazel') || 
      v.name.toLowerCase().includes('susan') ||
      v.name.toLowerCase().includes('google us english')
    );
  } else {
    voiceSelected = searchPool.find(v => 
      v.name.toLowerCase().includes('male') || 
      v.name.toLowerCase().includes('david') || 
      v.name.toLowerCase().includes('google us english male')
    );
  }

  if (!voiceSelected && searchPool.length > 0) {
    voiceSelected = searchPool[0];
  }

  if (voiceSelected) {
    localSpeechUtterance.voice = voiceSelected;
  }

  localSpeechUtterance.onend = onEnd;
  localSpeechUtterance.onerror = onEnd;

  window.speechSynthesis.speak(localSpeechUtterance);
}

// --- Web Audio Context getter ---
function getAudioContext() {
  if (!state.playback.audioContext) {
    state.playback.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return state.playback.audioContext;
}

// --- Canvas Rendering Logic (Frame Creator) ---

// Draw automatic animated branding overlay (Subscribe/Follow)
function drawBrandingOverlay(ctx, time) {
  // Anim loop of 5 seconds
  const animTime = time % 5;
  
  const canvasW = ctx.canvas.width;
  const y = 1680;
  const x = canvasW / 2 - 300; // Centered 600px width card
  const w = 600;
  const h = 130;
  
  // 1. Draw Glass Card background
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  
  ctx.fillStyle = 'rgba(20, 22, 45, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  
  // Draw rounded rect
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.stroke();
  
  // Remove shadow for inner content
  ctx.shadowColor = 'transparent';
  
  // Draw "Enjoying the Quiz?" text
  ctx.fillStyle = '#a0aec0';
  ctx.font = '700 24px Montserrat, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Enjoying the Quiz?', x + 30, y + h/2);
  
  // 2. Buttons Coordinates
  const subX = x + 280;
  const subY = y + h/2 - 25;
  const subW = 160;
  const subH = 50;
  
  const folX = x + 460;
  const folY = y + h/2 - 25;
  const folW = 110;
  const folH = 50;
  
  // States based on timeline
  const isSubscribed = (animTime >= 2.3);
  const isFollowing = (animTime >= 3.3);
  const isClickingSub = (animTime >= 2.2 && animTime < 2.3);
  const isClickingFol = (animTime >= 3.2 && animTime < 3.3);
  
  // A. Draw SUBSCRIBE Button
  ctx.save();
  if (isSubscribed) {
    ctx.fillStyle = '#2d3748'; // grey clicked state
  } else {
    ctx.fillStyle = '#e63946'; // bright red active
  }
  
  // Click feedback scale down
  if (isClickingSub) {
    ctx.translate(subX + subW/2, subY + subH/2);
    ctx.scale(0.92, 0.92);
    ctx.translate(-(subX + subW/2), -(subY + subH/2));
  }
  
  ctx.beginPath();
  ctx.roundRect(subX, subY, subW, subH, 25);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isSubscribed ? '✓ SUBSCRIBED' : 'SUBSCRIBE', subX + subW/2, subY + subH/2);
  ctx.restore();
  
  // B. Draw FOLLOW Button
  ctx.save();
  if (isFollowing) {
    ctx.fillStyle = '#2d3748'; // grey following
  } else {
    ctx.fillStyle = '#00b4d8'; // cyan follow
  }
  
  // Click feedback scale down
  if (isClickingFol) {
    ctx.translate(folX + folW/2, folY + folH/2);
    ctx.scale(0.92, 0.92);
    ctx.translate(-(folX + folW/2), -(folY + folH/2));
  }
  
  ctx.beginPath();
  ctx.roundRect(folX, folY, folW, folH, 25);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isFollowing ? '✓ FOL' : 'FOLLOW', folX + folW/2, folY + folH/2);
  ctx.restore();
  
  // 3. Mouse Cursor Graphic Animation
  let curX = 0;
  let curY = 0;
  let showCursor = false;
  
  // Cursor movement path
  if (animTime >= 1.2 && animTime < 2.2) {
    // Slide cursor to subscribe button
    showCursor = true;
    const progress = (animTime - 1.2) / 1.0; // 0 to 1
    curX = (x + w) - ((x + w) - (subX + subW/2 - 10)) * progress;
    curY = (y + h + 50) - ((y + h + 50) - (subY + subH/2 + 10)) * progress;
  } else if (animTime >= 2.2 && animTime < 2.6) {
    // Hovering on subscribe
    showCursor = true;
    curX = subX + subW/2 - 10;
    curY = subY + subH/2 + 10;
  } else if (animTime >= 2.6 && animTime < 3.2) {
    // Move from subscribe to follow
    showCursor = true;
    const progress = (animTime - 2.6) / 0.6; // 0 to 1
    curX = (subX + subW/2 - 10) + ((folX + folW/2 - 10) - (subX + subW/2 - 10)) * progress;
    curY = (subY + subH/2 + 10) + ((folY + folH/2 + 10) - (subY + subH/2 + 10)) * progress;
  } else if (animTime >= 3.2 && animTime < 3.6) {
    // Hovering on follow
    showCursor = true;
    curX = folX + folW/2 - 10;
    curY = folY + folH/2 + 10;
  } else if (animTime >= 3.6 && animTime < 4.5) {
    // Slide cursor out
    showCursor = true;
    const progress = (animTime - 3.6) / 0.9; // 0 to 1
    curX = (folX + folW/2 - 10) - 250 * progress;
    curY = (folY + folH/2 + 10) + 150 * progress;
  }
  
  if (showCursor) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    
    ctx.beginPath();
    ctx.moveTo(curX, curY);
    ctx.lineTo(curX + 15, curY + 28);
    ctx.lineTo(curX + 8, curY + 23);
    ctx.lineTo(curX - 2, curY + 31);
    ctx.lineTo(curX - 4, curY + 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  
  ctx.restore();
}

// Global drawing function for preview panel
function drawFrame(customSceneIndex = null, customSceneTime = null) {
  const idx = customSceneIndex !== null ? customSceneIndex : state.playback.currentSceneIndex;
  const t = customSceneTime !== null ? customSceneTime : state.playback.currentTime;
  
  drawFrameToContext(ctx, idx, t, state.scenes, state.template);
}

// Cover image algorithm helper
function drawCoverImage(ctx, img, x, y, w, h) {
  const imgRatio = img.naturalWidth / img.naturalHeight || img.videoWidth / img.videoHeight || 1;
  const canvasRatio = w / h;
  let sx, sy, sWidth, sHeight;
  
  const nativeW = img.naturalWidth || img.videoWidth || img.width;
  const nativeH = img.naturalHeight || img.videoHeight || img.height;

  if (imgRatio > canvasRatio) {
    sHeight = nativeH;
    sWidth = nativeH * canvasRatio;
    sx = (nativeW - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = nativeW;
    sHeight = nativeW / canvasRatio;
    sx = 0;
    sy = (nativeH - sHeight) / 2;
  }
  ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
}

// Draw static stars in background to look premium
function drawStarsPattern(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  const stars = [
    {x: 100, y: 150, r: 2}, {x: 950, y: 180, r: 3}, {x: 880, y: 350, r: 1.5},
    {x: 200, y: 500, r: 2}, {x: 150, y: 1200, r: 3}, {x: 920, y: 1400, r: 2.5},
    {x: 180, y: 1600, r: 1.5}, {x: 850, y: 1800, r: 2.5}
  ];
  stars.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

// Text wrapping algorithm
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const words = String(text).split(' ');
  let line = '';
  let lines = [];

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + (i * lineHeight));
  }
}

// --- Live Quiz Preview Playback controller ---

let liveScheduleSourceNodes = [];

// Pre-calculate TTS lengths and map timelines up front
async function precalculateAllSceneDurations() {
  el.statusBubble.textContent = "Loading voices...";
  const rate = Number(state.template.voiceSpeed) || 1.0;
  const gender = state.template.voiceGender;

  for (let i = 0; i < state.scenes.length; i++) {
    const sc = state.scenes[i];
    try {
      const qText = state.template.questionText;
      const aText = sc.correctAnswer || 'Answer';

      if (state.template.ttsEngine === 'cloud') {
        const qTTS = await fetchCloudTTS(qText, gender);
        const aTTS = await fetchCloudTTS(aText, gender);

        sc.qDuration = qTTS.buffer.duration / rate;
        sc.aDuration = aTTS.buffer.duration / rate;
      } else {
        const qWords = qText.split(/\s+/).length;
        const aWords = aText.split(/\s+/).length;
        sc.qDuration = Math.max(1.8, (qWords / 3) / rate);
        sc.aDuration = Math.max(1.8, (aWords / 3) / rate);
      }
    } catch (e) {
      console.error(`Failed to precalculate durations for scene ${i}:`, e);
      sc.qDuration = 2.0;
      sc.aDuration = 2.0;
    }
  }
}

async function startQuizPlayback() {
  if (state.playback.isPlaying) return;

  const audioCtx = getAudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Pre-calculate all scene durations up front so playback runs synchronously
  await precalculateAllSceneDurations();

  state.playback.isPlaying = true;
  el.playBtn.classList.add('hidden');
  el.pauseBtn.classList.remove('hidden');
  
  if (state.template.bgType === 'video' && state.template.bgVideo) {
    el.bgLoopVideo.play();
  }

  // Hide the exported video preview player and show the canvas when playing preview
  if (el.exportPreviewVideo) {
    el.exportPreviewVideo.classList.add('hidden');
    el.exportPreviewVideo.src = '';
    el.exportPreviewVideo.load();
  }
  el.canvas.classList.remove('hidden');

  state.playback.lastFrameTime = performance.now();
  
  playSceneAudioPhase(state.playback.currentSceneIndex, state.playback.currentTime);

  state.playback.rafId = requestAnimationFrame(playbackLoop);
}

function pauseQuizPlayback() {
  if (!state.playback.isPlaying) return;

  state.playback.isPlaying = false;
  el.playBtn.classList.remove('hidden');
  el.pauseBtn.classList.add('hidden');
  
  if (state.template.bgType === 'video' && state.template.bgVideo) {
    el.bgLoopVideo.pause();
  }

  cancelAnimationFrame(state.playback.rafId);
  stopAllLiveAudio();
}

function stopQuizPlayback() {
  pauseQuizPlayback();
  state.playback.currentTime = 0;
  state.playback.currentSceneIndex = 0;
  el.statusBubble.textContent = "Preview Idle";
  
  if (el.exportPreviewVideo) {
    el.exportPreviewVideo.classList.add('hidden');
    el.exportPreviewVideo.src = '';
    el.exportPreviewVideo.load();
  }
  el.canvas.classList.remove('hidden');
  
  drawFrame();
}

function stopAllLiveAudio() {
  liveScheduleSourceNodes.forEach(node => {
    try { node.stop(); } catch(e) {}
  });
  liveScheduleSourceNodes = [];
  
  if (localSpeechUtterance) {
    window.speechSynthesis.cancel();
  }
}

// Play TTS and schedule precision timeline ticks live (defensive fallback on network errors)
async function playSceneAudioPhase(sceneIdx, startTime) {
  stopAllLiveAudio();
  
  const scene = state.scenes[sceneIdx];
  const audioCtx = getAudioContext();
  const rate = Number(state.template.voiceSpeed) || 1.0;
  const gender = state.template.voiceGender;
  const countdownSec = Number(state.template.timerDuration) || 5;
  
  const qText = state.template.questionText;
  const aText = scene.correctAnswer || 'Answer';

  const qDuration = Number(scene.qDuration) || 2.0;
  const totalCountdownTime = qDuration + countdownSec;

  // --- Step 1: Question TTS ---
  if (startTime < qDuration) {
    if (state.template.ttsEngine === 'cloud') {
      try {
        const qTTS = await fetchCloudTTS(qText, gender);
        const src = audioCtx.createBufferSource();
        src.buffer = qTTS.buffer;
        src.playbackRate.value = rate;
        src.connect(audioCtx.destination);
        
        const offset = startTime * rate;
        src.start(0, offset);
        liveScheduleSourceNodes.push(src);
      } catch (err) {
        console.warn("[Main] Cloud TTS failed for question, falling back to local SpeechSynthesis:", err);
        speakLocal(qText, gender, rate, null);
      }
    } else {
      speakLocal(qText, gender, rate, null);
    }
  }

  // --- Step 2: Precision Web Audio Countdown Ticks (No background setInterval leakage) ---
  if (startTime < totalCountdownTime) {
    const elapsedCountdown = startTime - qDuration;
    const startTick = Math.max(0, Math.ceil(elapsedCountdown));
    
    for (let sec = startTick; sec < countdownSec; sec++) {
      const tickTimeInScene = qDuration + sec;
      const delay = tickTimeInScene - startTime;
      if (delay >= 0) {
        const playTime = audioCtx.currentTime + delay;
        const isTock = (sec % 2 === 1);
        playTickTockLive(audioCtx, playTime, isTock);
      }
    }
  }

  // --- Step 3: Answer TTS ---
  if (startTime >= totalCountdownTime) {
    const answerStartTime = totalCountdownTime;
    const answerOffset = startTime - answerStartTime;
    
    if (startTime < answerStartTime + scene.aDuration) {
      if (state.template.ttsEngine === 'cloud') {
        try {
          const aTTS = await fetchCloudTTS(aText, gender);
          const src = audioCtx.createBufferSource();
          src.buffer = aTTS.buffer;
          src.playbackRate.value = rate;
          src.connect(audioCtx.destination);
          
          src.start(0, answerOffset * rate);
          liveScheduleSourceNodes.push(src);
        } catch (err) {
          console.warn("[Main] Cloud TTS failed for answer, falling back to local SpeechSynthesis:", err);
          speakLocal(aText, gender, rate, null);
        }
      } else {
        speakLocal(aText, gender, rate, null);
      }
    }
  }
}

// Live play update loop with try-catch wrapper to avoid canvas locks
async function playbackLoop(now) {
  if (!state.playback.isPlaying) return;

  try {
    const dt = (now - state.playback.lastFrameTime) / 1000;
    state.playback.lastFrameTime = now;

    let sceneIdx = state.playback.currentSceneIndex;
    const scene = state.scenes[sceneIdx];
    const qDuration = Number(scene.qDuration) || 2.0;
    const cDuration = Number(state.template.timerDuration) || 5;
    const aDuration = Number(scene.aDuration) || 2.0;
    const aPadding = 1.5;
    
    const sceneTotalDuration = qDuration + cDuration + aDuration + aPadding;

    let phaseText = "Question";
    if (state.playback.currentTime >= qDuration && state.playback.currentTime < qDuration + cDuration) {
      phaseText = "Countdown";
    } else if (state.playback.currentTime >= qDuration + cDuration) {
      phaseText = "Reveal Answer";
    }
    el.statusBubble.textContent = `Scene ${sceneIdx + 1}/${state.scenes.length} - ${phaseText}`;

    state.playback.currentTime += dt;

    if (state.playback.currentTime >= sceneTotalDuration) {
      sceneIdx++;
      if (sceneIdx >= state.scenes.length) {
        stopQuizPlayback();
        return;
      } else {
        state.playback.currentSceneIndex = sceneIdx;
        state.playback.currentTime = 0;
        // Durations are pre-calculated, transition instantly
        playSceneAudioPhase(sceneIdx, 0);
      }
    } else {
      const oldTime = state.playback.currentTime - dt;
      const tCountStart = qDuration;
      const tAnswerStart = qDuration + cDuration;

      if (oldTime < tCountStart && state.playback.currentTime >= tCountStart) {
        playSceneAudioPhase(sceneIdx, state.playback.currentTime);
      }
      else if (oldTime < tAnswerStart && state.playback.currentTime >= tAnswerStart) {
        playSceneAudioPhase(sceneIdx, state.playback.currentTime);
      }
    }

    drawFrame();
  } catch (err) {
    console.error("[Main] Critical crash in playback loop:", err);
    stopQuizPlayback();
    alert(`Quiz playback stopped due to a renderer error: ${err.message}`);
    return;
  }

  state.playback.rafId = requestAnimationFrame(playbackLoop);
}

// Play single scene from scene editor list
async function previewSingleScene(idx) {
  stopQuizPlayback();
  state.playback.currentSceneIndex = idx;
  state.playback.currentTime = 0;
  await startQuizPlayback();
}

// --- MP4 Export Worker Pipeline routing to ExporterController ---

async function startVideoExport() {
  if (state.exporting.isExporting) return;
  if (state.scenes.length === 0) {
    alert("Please add at least one scene to export.");
    return;
  }

  // Stop any ongoing preview playback to avoid canvas drawing conflicts
  stopQuizPlayback();

  // --- REQUIREMENT RESETS: Clear all previous states & buffers ---
  
  // 1. Reset download link UI
  el.downloadLink.href = "#";
  el.downloadLink.classList.add('hidden');

  // 2. Clear TTS caches & force timeline recalculation based on latest user edits
  console.log("[Main] Clearing TTS buffer caches...");
  ttsCache = {};

  // 3. Freeze a complete clone of the current editor state so edits during export don't pollute the compilation
  console.log("[Main] Rebuilding exportScenes and exportTemplate from current live editor state...");
  const exportScenes = state.scenes.map(s => ({
    id: s.id,
    imageSrc: s.imageSrc,
    correctAnswer: s.correctAnswer,
    imageLoaded: s.imageLoaded, // Share image reference
    qDuration: null,
    aDuration: null
  }));

  const exportTemplate = {
    questionText: state.template.questionText,
    timerDuration: Number(state.template.timerDuration) || 5,
    ttsEngine: state.template.ttsEngine,
    voiceGender: state.template.voiceGender,
    voiceSpeed: Number(state.template.voiceSpeed) || 1.0,
    bgType: state.template.bgType,
    bgStyle: state.template.bgStyle,
    bgImage: state.template.bgImage,
    bgVideo: state.template.bgVideo,
    textColor: state.template.textColor,
    fontSize: Number(state.template.fontSize) || 64,
    logoSrc: state.template.logoSrc,
    logoLoaded: state.template.logoLoaded,
    logoPosition: state.template.logoPosition,
    logoScale: Number(state.template.logoScale) || 1.0
  };

  // 4. Reset progress states & internal flags
  state.exporting.isExporting = true;
  state.exporting.progress = 0;
  
  el.exportBtn.classList.add('hidden');
  el.progressContainer.classList.remove('hidden');
  el.progressStatusText.textContent = "Loading fresh Cloud Premium voices (Puter.js)...";
  el.progressPercentage.textContent = "0%";
  el.progressBar.style.width = "0%";
  el.progressBar.style.background = "linear-gradient(90deg, var(--accent-purple) 0%, var(--accent-cyan) 100%)"; // reset color in case it was red before

  try {
    const audioRate = 48000;
    const rate = exportTemplate.voiceSpeed;
    const gender = exportTemplate.voiceGender;

    // Helper to generate a silent audio buffer in case cloud TTS fails during export
    const createSilentAudioBuffer = (duration, sampleRate) => {
      const length = Math.ceil(duration * sampleRate);
      const audioContext = getAudioContext();
      return audioContext.createBuffer(1, length, sampleRate);
    };

    // 1. Fetch all TTS audios using updated text & settings (With defensive silence fallbacks)
    for (let i = 0; i < exportScenes.length; i++) {
      const sc = exportScenes[i];
      const qText = exportTemplate.questionText;
      const aText = sc.correctAnswer || 'Answer';
      
      el.progressStatusText.textContent = `Fetching voice narration for Scene ${i+1}...`;
      
      let qTTS;
      try {
        qTTS = await fetchCloudTTS(qText, gender);
      } catch (e) {
        console.warn(`[Export] Cloud TTS failed for question in scene ${i+1}. Creating fallback silence.`, e);
        const silentBuffer = createSilentAudioBuffer(2.0, audioRate);
        qTTS = { buffer: silentBuffer, blobUrl: '' };
      }

      let aTTS;
      try {
        aTTS = await fetchCloudTTS(aText, gender);
      } catch (e) {
        console.warn(`[Export] Cloud TTS failed for answer in scene ${i+1}. Creating fallback silence.`, e);
        const silentBuffer = createSilentAudioBuffer(2.0, audioRate);
        aTTS = { buffer: silentBuffer, blobUrl: '' };
      }
      
      sc.qDuration = qTTS.buffer.duration / rate;
      sc.aDuration = aTTS.buffer.duration / rate;
      
      // Store already-fetched audio buffers on the scene object
      sc.qTTS = qTTS;
      sc.aTTS = aTTS;
    }

    // 2. Mix Master Video audio track using OfflineAudioContext
    el.progressStatusText.textContent = "Mixing audio track...";
    const cDuration = exportTemplate.timerDuration;
    const aPadding = 1.5;
    
    let offsets = [];
    let currentOffset = 0;
    
    for (let i = 0; i < exportScenes.length; i++) {
      const sc = exportScenes[i];
      const sceneTotal = sc.qDuration + cDuration + sc.aDuration + aPadding;
      offsets.push({
        start: currentOffset,
        qStart: currentOffset,
        cStart: currentOffset + sc.qDuration,
        aStart: currentOffset + sc.qDuration + cDuration,
        total: sceneTotal
      });
      currentOffset += sceneTotal;
    }
    
    const totalDuration = currentOffset;
    console.log("[Main] Recalculated total duration:", totalDuration, "offsets:", JSON.stringify(offsets));

    const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioRate * totalDuration), audioRate);
    
    for (let i = 0; i < exportScenes.length; i++) {
      const sc = exportScenes[i];
      const times = offsets[i];
      
      // Question TTS - Use stored buffers
      const qSource = offlineCtx.createBufferSource();
      qSource.buffer = sc.qTTS.buffer;
      qSource.connect(offlineCtx.destination);
      qSource.start(times.qStart);
      
      // Countdown Ticks
      for (let sec = 0; sec < cDuration; sec++) {
        const tickTime = times.cStart + sec;
        const isTock = (sec % 2 === 1);
        playTickTock(offlineCtx, tickTime, isTock);
      }
      
      // Answer TTS - Use stored buffers
      const aSource = offlineCtx.createBufferSource();
      aSource.buffer = sc.aTTS.buffer;
      aSource.connect(offlineCtx.destination);
      aSource.start(times.aStart);
    }
    
    console.log("[Main] Generating offline mixed audio track...");
    const renderedAudioBuffer = await offlineCtx.startRendering();
    const rawAudioSamples = renderedAudioBuffer.getChannelData(0);

    // 3. Configure and Start Export on the Controller
    const config = {
      video: {
        width: 1088, // 16-aligned resolution for hardware encoders compatibility
        height: 1920,
        bitrate: 4500000,
        codec: 'avc1.4d002a'
      },
      audio: {
        codec: 'mp4a.40.2',
        sampleRate: audioRate,
        numberOfChannels: 1,
        bitrate: 128000
      }
    };

    const context = {
      state,
      el,
      fetchCloudTTS,
      playTickTock,
      runFramesRenderLoop,
      stopQuizPlayback,
      drawFrameToContext,
      resetEditorState
    };

    await exporterController.startExport(config, context);

    // Render loop executes when resolve is triggered by startExport
    runFramesRenderLoop(exporterController.worker, rawAudioSamples, audioRate, offsets, totalDuration, exportScenes, exportTemplate, context);

  } catch (err) {
    exporterController.handleExportFailure(err.message, { state, el });
  }
}

// Virtual rendering loop at 30 fps
async function runFramesRenderLoop(worker, audioSamples, audioRate, offsets, totalDuration, exportScenes, exportTemplate, context) {
  const fps = 30;
  const totalFrames = Math.ceil(totalDuration * fps);
  
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = 1088;
  renderCanvas.height = 1920;
  const renderCtx = renderCanvas.getContext('2d');

  const hasBgVideo = exportTemplate.bgType === 'video' && exportTemplate.bgVideo;
  if (hasBgVideo) {
    el.bgLoopVideo.pause();
  }

  // 1. Format and transfer AudioData chunks
  console.log("[Main] Slicing and transferring AudioData chunks...");
  const frameSize = 1024;
  let offset = 0;
  const totalSamples = audioSamples.length;

  while (offset < totalSamples) {
    const size = Math.min(frameSize, totalSamples - offset);
    const subArray = audioSamples.subarray(offset, offset + size);
    const chunkTimestamp = Math.round((offset / audioRate) * 1000000);

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: audioRate,
      numberOfFrames: size,
      numberOfChannels: 1,
      timestamp: chunkTimestamp,
      data: subArray
    });

    exporterController.submitAudioData(audioData);
    offset += size;
  }

  // 2. Render and transfer video frames
  console.log("[Main] Rendering and transferring video frames...");
  for (let currentFrame = 0; currentFrame < totalFrames; currentFrame++) {
    const t = currentFrame / fps;
    
    let sceneIdx = 0;
    let localTime = t;
    for (let i = 0; i < offsets.length; i++) {
      const nextSceneStart = offsets[i].start + offsets[i].total;
      if (t < nextSceneStart) {
        sceneIdx = i;
        localTime = t - offsets[i].start;
        break;
      }
    }

    if (hasBgVideo) {
      await seekVideoElement(el.bgLoopVideo, t);
    }

    drawFrameToContext(renderCtx, sceneIdx, localTime, exportScenes, exportTemplate);

    const bitmap = await createImageBitmap(renderCanvas);
    const timestampUs = Math.round(t * 1000000);
    const isKeyframe = (currentFrame % 30 === 0);

    const videoFrame = new VideoFrame(bitmap, { timestamp: timestampUs });
    exporterController.submitVideoFrame(videoFrame, timestampUs, isKeyframe);

    // Backpressure: Await worker acknowledgment before rendering/submitting the next frame
    // This prevents the VideoEncoder queue from getting overwhelmed and eliminates flush timeouts.
    await exporterController.awaitFrameAck();

    // Update UI progress
    const pct = Math.round((currentFrame / totalFrames) * 95);
    el.progressBar.style.width = pct + "%";
    el.progressPercentage.textContent = pct + "%";
    el.progressStatusText.textContent = `Rendering video frames: ${currentFrame}/${totalFrames}...`;

    // Yield control so UI stays active and worker compiles frame
    await new Promise(r => setTimeout(r, 10));
  }

  // 3. Finalize export
  exporterController.finalizeExport(context);
}

// Seek video helper for offline frame grab
function seekVideoElement(videoEl, time) {
  return new Promise((resolve) => {
    if (!videoEl || !videoEl.duration || isNaN(videoEl.duration)) {
      resolve();
      return;
    }
    const onSeeked = () => {
      videoEl.removeEventListener('seeked', onSeeked);
      resolve();
    };
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = time % videoEl.duration;
  });
}

// Reset Editor state after export completes successfully
function resetEditorState() {
  console.log("[Main] Performing editor state reset...");
  
  // Re-initialize scenes list
  state.scenes = [
    {
      id: 'default-1',
      imageSrc: 'assets/eiffel_tower.jpg',
      correctAnswer: 'Eiffel Tower',
      imageLoaded: null
    },
    {
      id: 'default-2',
      imageSrc: 'assets/colosseum.jpg',
      correctAnswer: 'Colosseum',
      imageLoaded: null
    }
  ];

  // Re-initialize template configurations
  state.template.questionText = 'What is this called?';
  state.template.timerDuration = 5;
  state.template.ttsEngine = 'cloud';
  state.template.voiceGender = 'male';
  state.template.voiceSpeed = 1.0;
  state.template.bgType = 'gradient';
  state.template.bgStyle = 'linear-gradient(135deg, #1f0f3d, #070b19)';
  state.template.bgImage = null;
  state.template.bgVideo = null;
  state.template.textColor = '#ffffff';
  state.template.fontSize = 64;
  state.template.logoSrc = null;
  state.template.logoLoaded = null;
  state.template.logoPosition = 'top';
  state.template.logoScale = 1.0;

  // Restore UI settings panels values
  if (el.questionText) el.questionText.value = state.template.questionText;
  if (el.timerDuration) el.timerDuration.value = "5";
  if (el.ttsEngine) el.ttsEngine.value = "cloud";
  if (el.voiceGenderToggle) el.voiceGenderToggle.checked = false;
  if (el.voiceSpeed) el.voiceSpeed.value = "1";
  if (el.voiceSpeedVal) el.voiceSpeedVal.textContent = "1.0x";
  
  if (el.bgType) el.bgType.value = "gradient";
  if (el.solidColor) el.solidColor.value = "#1a1a2e";
  if (el.bgImageFilename) el.bgImageFilename.textContent = "No file chosen";
  if (el.bgVideoFilename) el.bgVideoFilename.textContent = "No file chosen";
  
  if (el.textColor) el.textColor.value = "#ffffff";
  if (el.fontSize) el.fontSize.value = "64";
  if (el.fontSizeVal) el.fontSizeVal.textContent = "64px";
  if (el.logoScale) el.logoScale.value = "100";
  if (el.logoScaleVal) el.logoScaleVal.textContent = "100%";
  if (el.logoPosition) el.logoPosition.value = "top";
  
  // Re-arrange toggle labels active state
  const maleLabel = document.querySelector('.toggle-label.male');
  const femaleLabel = document.querySelector('.toggle-label.female');
  if (maleLabel) maleLabel.classList.add('active');
  if (femaleLabel) femaleLabel.classList.remove('active');

  // Toggle active gradient preset visually
  document.querySelectorAll('.bg-preset-btn').forEach((btn, index) => {
    if (index === 0) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Hide conditional control groupings
  el.bgGradientControls.classList.remove('hidden');
  el.bgSolidControls.classList.add('hidden');
  el.bgImageControls.classList.add('hidden');
  el.bgVideoControls.classList.add('hidden');
  el.logoScaleContainer.classList.add('hidden');

  // Clear export preview video element
  if (el.exportPreviewVideo) {
    el.exportPreviewVideo.classList.add('hidden');
    el.exportPreviewVideo.src = '';
    el.exportPreviewVideo.load();
  }
  el.canvas.classList.remove('hidden');

  // Hide download link and new video button
  if (el.downloadLink) el.downloadLink.classList.add('hidden');
  if (el.newVideoBtn) el.newVideoBtn.classList.add('hidden');
  if (el.progressContainer) el.progressContainer.classList.add('hidden');
  if (el.exportBtn) el.exportBtn.classList.remove('hidden');

  // Load defaults
  loadDefaultImages();
  renderScenesList();
  drawFrame();
}

// Draw frame to arbitrary 2D Context (for offscreen exporter rendering and preview drawing)
function drawFrameToContext(c, idx, t, scenes, template) {
  const w = c.canvas.width;
  const h = c.canvas.height;

  if (!scenes || scenes.length === 0 || idx >= scenes.length) {
    c.fillStyle = '#111326';
    c.fillRect(0, 0, w, h);
    return;
  }

  const scene = scenes[idx];
  const tpl = template;

  // Background
  if (tpl.bgType === 'solid') {
    c.fillStyle = tpl.bgStyle;
    c.fillRect(0, 0, w, h);
  } else if (tpl.bgType === 'gradient') {
    const grad = c.createLinearGradient(0, 0, w, h);
    if (tpl.bgStyle.includes('#1f0f3d')) {
      grad.addColorStop(0, '#1f0f3d'); grad.addColorStop(1, '#070b19');
    } else if (tpl.bgStyle.includes('#093028')) {
      grad.addColorStop(0, '#093028'); grad.addColorStop(1, '#237a57');
    } else if (tpl.bgStyle.includes('#4b1248')) {
      grad.addColorStop(0, '#4b1248'); grad.addColorStop(1, '#f0c27b');
    } else if (tpl.bgStyle.includes('#8a2387')) {
      grad.addColorStop(0, '#8a2387'); grad.addColorStop(0.5, '#e94057'); grad.addColorStop(1, '#f27121');
    } else {
      grad.addColorStop(0, '#00c6ff'); grad.addColorStop(1, '#0072ff');
    }
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
  } else if (tpl.bgType === 'image' && tpl.bgImage) {
    drawCoverImage(c, tpl.bgImage, 0, 0, w, h);
  } else if (tpl.bgType === 'video' && tpl.bgVideo) {
    drawCoverImage(c, el.bgLoopVideo, 0, 0, w, h);
  }

  drawStarsPattern(c);

  // Logo Placement
  if (tpl.logoPosition !== 'none' && tpl.logoLoaded) {
    const scale = Number(tpl.logoScale) || 1.0;
    const baseW = 180;
    const baseH = (tpl.logoLoaded.height / tpl.logoLoaded.width) * baseW;
    const logoW = baseW * scale;
    const logoH = baseH * scale;
    const logoX = w / 2 - logoW / 2;
    const logoY = tpl.logoPosition === 'top' ? 140 : 1450;
    
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.3)';
    c.shadowBlur = 10;
    c.drawImage(tpl.logoLoaded, logoX, logoY, logoW, logoH);
    c.restore();
  }

  // Question Text
  c.fillStyle = tpl.textColor;
  const fSize = Number(tpl.fontSize) || 64;
  c.font = `900 ${fSize}px Montserrat, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  wrapText(c, tpl.questionText, w / 2, 280, w - 160, fSize + 16);

  // Quiz Image Card
  const cardX = w / 2 - 450;
  const cardY = 560;
  const cardW = 900;
  const cardH = 650;
  const radius = 30;

  c.save();
  c.shadowColor = 'rgba(0, 0, 0, 0.5)';
  c.shadowBlur = 24;
  c.shadowOffsetY = 12;
  c.fillStyle = 'rgba(255, 255, 255, 0.08)';
  c.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(cardX, cardY, cardW, cardH, radius);
  c.fill();
  c.stroke();
  c.restore();

  if (scene.imageLoaded) {
    c.save();
    c.beginPath();
    c.roundRect(cardX + 15, cardY + 15, cardW - 30, cardH - 30, radius - 10);
    c.clip();
    drawCoverImage(c, scene.imageLoaded, cardX + 15, cardY + 15, cardW - 30, cardH - 30);
    c.restore();
  }

  // Chronological phases
  const countdownDuration = Number(tpl.timerDuration) || 5;
  const qDuration = Number(scene.qDuration) || 2.0;
  const countdownStart = qDuration;
  const countdownEnd = qDuration + countdownDuration;

  if (t < countdownStart) {
    // QUESTION
    c.fillStyle = 'rgba(255, 183, 3, 0.2)';
    c.strokeStyle = '#ffb703';
    c.lineWidth = 3;
    const pulseScale = 1.0 + Math.sin(t * 5) * 0.03;
    const btnW = 280 * pulseScale;
    const btnH = 70 * pulseScale;
    c.save();
    c.translate(w / 2, 1340);
    c.beginPath();
    c.roundRect(-btnW/2, -btnH/2, btnW, btnH, 35);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '900 24px Montserrat, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('THINKING...', 0, 0);
    c.restore();
  }
  else if (t >= countdownStart && t < countdownEnd) {
    // COUNTDOWN RING
    const elapsedCountdown = t - countdownStart;
    const remaining = countdownDuration - elapsedCountdown;
    const centerX = w / 2;
    const centerY = 1340;
    const circleRad = 65;
    
    c.save();
    c.fillStyle = 'rgba(10, 11, 22, 0.7)';
    c.beginPath();
    c.arc(centerX, centerY, circleRad + 10, 0, Math.PI * 2);
    c.fill();
    
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(centerX, centerY, circleRad, 0, Math.PI * 2);
    c.stroke();
    
    const arcPercent = remaining / countdownDuration;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * arcPercent);
    c.strokeStyle = '#00f2fe';
    c.shadowColor = 'rgba(0, 242, 254, 0.6)';
    c.shadowBlur = 12;
    c.beginPath();
    c.arc(centerX, centerY, circleRad, startAngle, endAngle);
    c.stroke();
    
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.font = '900 64px Montserrat, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(Math.ceil(remaining), centerX, centerY + 3);
    c.restore();
  }
  else {
    // REVEAL ANSWER
    const ansText = scene.correctAnswer || 'Answer';
    c.save();
    c.shadowColor = 'rgba(0, 180, 216, 0.4)';
    c.shadowBlur = 20;
    c.fillStyle = 'rgba(0, 180, 216, 0.15)';
    c.strokeStyle = '#00b4d8';
    c.lineWidth = 4;
    const ansBoxW = 800;
    const ansBoxH = 120;
    const ansBoxX = w / 2 - ansBoxW/2;
    const ansBoxY = 1280;
    c.beginPath();
    c.roundRect(ansBoxX, ansBoxY, ansBoxW, ansBoxH, 20);
    c.fill();
    c.stroke();
    
    c.shadowBlur = 0;
    c.fillStyle = '#00b4d8';
    c.font = '900 20px Montserrat, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText('CORRECT ANSWER', w / 2, ansBoxY + 22);
    
    c.fillStyle = '#ffffff';
    c.font = '800 38px Montserrat, sans-serif';
    c.textBaseline = 'bottom';
    c.fillText(ansText, w / 2, ansBoxY + ansBoxH - 20);
    c.restore();
  }

  // Draw branding overlay
  const totalElapsedTime = (idx * 20) + t;
  drawBrandingOverlay(c, totalElapsedTime);
}
