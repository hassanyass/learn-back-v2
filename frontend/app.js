/**
 * LearnBack - Upload Slides Application
 * Connects to FastAPI backend for PDF processing
 * Authentication: JWT via apiClient.js (Bearer token)
 */

// ── Auth Guard ──────────────────────────────────────────────
// Redirect to login if no JWT token is present
if (window.LearnBackAPI && typeof window.LearnBackAPI.isLoggedIn === 'function' && !window.LearnBackAPI.isLoggedIn()) {
    window.location.href = 'auth.html';
} else if (!window.LearnBackAPI) {
    try {
        if (!window.localStorage.getItem('learnback_token')) {
            window.location.href = 'auth.html';
        }
    } catch (_) { /* proceed */ }
}

// ============================================
// Configuration
// ============================================
const CONFIG = {
    validExtensions: ['pdf'],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    minFileSize: 50 * 1024, // 50KB
    maxFiles: 1,
    apiBaseUrl: window.LearnBackAPI && typeof window.LearnBackAPI.getApiBaseUrl === 'function'
        ? window.LearnBackAPI.getApiBaseUrl()
        : 'http://127.0.0.1:8000',
    uploadEndpoint: '/api/upload_lecture'
};

const SESSION_TITLE = 'Machine Learning';


// ============================================
// State Management
// ============================================
const AppState = {
    currentScreen: 'upload',
    uploadedFile: null,
    uploadedFileData: null,
    categories: [],
    mainCategories: [],
    additionalCategories: [],
    isProcessing: false
};

// ============================================
// DOM Elements
// ============================================
const elements = {
    uploadScreen: document.getElementById('upload-screen'),
    processingScreen: document.getElementById('processing-screen'),
    contentScreen: document.getElementById('content-screen'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    fileListSection: document.getElementById('file-list-section'),
    fileList: document.getElementById('file-list'),
    errorBanner: document.getElementById('error-banner'),
    errorText: document.getElementById('error-text'),
    validateBtn: document.getElementById('validate-btn'),
    processingProgress: document.getElementById('processing-progress'),
    processingTitle: document.querySelector('.processing-title'),
    processingMessage: document.querySelector('.processing-message'),
    mainCategories: document.getElementById('main-categories'),
    additionalCategories: document.getElementById('additional-categories'),
    reuploadBtn: document.getElementById('reupload-btn'),
    startSessionBtn: document.getElementById('start-session-btn'),
    steps: document.querySelectorAll('.step')
};

// ============================================
// Screen Navigation
// ============================================
function navigateToScreen(screenName) {
    elements.uploadScreen.classList.remove('active');
    elements.processingScreen.classList.remove('active');
    elements.contentScreen.classList.remove('active');

    updateStepIndicator(screenName);

    switch (screenName) {
        case 'upload':
            elements.uploadScreen.classList.add('active');
            AppState.currentScreen = 'upload';
            break;
        case 'processing':
            elements.processingScreen.classList.add('active');
            AppState.currentScreen = 'processing';
            startProcessing();
            break;
        case 'content':
            elements.contentScreen.classList.add('active');
            AppState.currentScreen = 'content';
            renderCategoryCards();
            break;
    }
}

function updateStepIndicator(screenName) {
    const stepMap = { 'upload': 1, 'processing': 2, 'content': 3 };
    const currentStep = stepMap[screenName];

    elements.steps.forEach((step) => {
        const stepNumber = parseInt(step.dataset.step);
        step.classList.remove('completed', 'current', 'upcoming');

        if (stepNumber < currentStep) {
            step.classList.add('completed');
        } else if (stepNumber === currentStep) {
            step.classList.add('current');
        } else {
            step.classList.add('upcoming');
        }
    });
}

// ============================================
// File Upload Handling
// ============================================
function initializeUploadHandlers() {
    const dropZone = elements.dropZone;
    const fileInput = elements.fileInput;

    dropZone.addEventListener('click', () => {
        if (!AppState.uploadedFile) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!AppState.uploadedFile) {
            dropZone.classList.add('dragover');
        }
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        if (!AppState.uploadedFile) {
            handleFileSelection(e.dataTransfer.files);
        } else {
            showError('File already uploaded', 'Please remove the current file first.');
        }
    });
}

function handleFileSelection(fileList) {
    hideError();
    const files = Array.from(fileList);

    if (files.length > 1) {
        showError('Error', 'Please upload only one file.');
        return;
    }

    if (files.length === 0) return;

    const file = files[0];
    const extension = getFileExtension(file.name);

    if (!CONFIG.validExtensions.includes(extension)) {
        showError('Invalid file type', 'Please upload a PDF file.');
        return;
    }

    if (file.size < CONFIG.minFileSize) {
        showError('Invalid file', 'File is too small or empty.');
        return;
    }

    if (file.size > CONFIG.maxFileSize) {
        showError('File too large', 'Maximum file size is 50MB.');
        return;
    }

    // Store the actual File object for upload
    AppState.uploadedFile = file;
    AppState.uploadedFileData = {
        name: file.name,
        size: file.size,
        type: extension,
        progress: 0
    };

    updateUploadZoneState();
    simulateUploadProgress();
    renderFileList();
    updateValidateButtonState();
}

function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function simulateUploadProgress() {
    if (!AppState.uploadedFileData) return;

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 30 + 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
        }
        AppState.uploadedFileData.progress = Math.min(progress, 100);
        renderFileList();
        updateValidateButtonState();
    }, 200);
}

function updateUploadZoneState() {
    if (AppState.uploadedFile) {
        elements.dropZone.classList.add('disabled');
    } else {
        elements.dropZone.classList.remove('disabled');
    }
}

function renderFileList() {
    const container = elements.fileListSection;
    const list = elements.fileList;

    if (!AppState.uploadedFileData) {
        container.classList.remove('visible');
        return;
    }

    container.classList.add('visible');
    const file = AppState.uploadedFileData;

    const iconPath = 'Components/Upload-slides-icons/icon-pdf.svg';

    list.innerHTML = `
        <li class="file-item">
            <img src="${iconPath}" alt="${file.type.toUpperCase()}" class="file-item-icon">
            <div class="file-item-details">
                <div class="file-item-name">${escapeHtml(file.name)}</div>
                <div class="file-item-size">${formatFileSize(file.size)}</div>
            </div>
            <div class="file-progress-bar">
                <div class="file-progress-fill" style="width: ${file.progress}%"></div>
            </div>
            <button class="file-remove-btn" onclick="removeFile()" aria-label="Remove file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </li>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function removeFile() {
    AppState.uploadedFile = null;
    AppState.uploadedFileData = null;
    updateUploadZoneState();
    renderFileList();
    updateValidateButtonState();
    hideError();
}

function updateValidateButtonState() {
    const hasFile = AppState.uploadedFileData !== null;
    const isComplete = hasFile && AppState.uploadedFileData.progress >= 100;
    elements.validateBtn.disabled = !(hasFile && isComplete);
}

function showError(title, message) {
    const errorTitle = document.getElementById('error-title');
    const errorText = document.getElementById('error-text');

    if (errorTitle) errorTitle.textContent = title;
    if (errorText) errorText.textContent = message;

    elements.errorBanner.classList.add('visible');
}

function hideError() {
    elements.errorBanner.classList.remove('visible');
}

// ============================================
// Processing & Backend API Call
// ============================================
async function startProcessing() {
    if (AppState.isProcessing) return;
    AppState.isProcessing = true;

    console.log('Starting processing for:', AppState.uploadedFile?.name);

    // Update UI
    if (elements.processingTitle) {
        elements.processingTitle.textContent = 'Analyzing slides...';
    }
    const uploadType = AppState.uploadedFileData?.type || getFileExtension(AppState.uploadedFile?.name || '');
    if (elements.processingMessage) {
        elements.processingMessage.textContent = 'Uploading to server...';
    }

    // Start progress animation
    const progressFill = elements.processingProgress;
    progressFill.style.width = '0%';

    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) progress += 1;
        else if (progress < 98) progress += 0.2;
        progressFill.style.width = `${Math.min(progress, 98)}%`;
    }, 100);

    try {
        // Create FormData and upload to backend
        const formData = new FormData();
        formData.append('file', AppState.uploadedFile);

        console.log('Uploading via authenticated API client...');

        // All uploads go through LearnBackAPI which attaches the JWT Bearer token.
        // No legacy X-User-Id headers or mock user fallbacks.
        let result;
        if (window.LearnBackAPI && typeof window.LearnBackAPI.uploadLecture === 'function') {
            result = await window.LearnBackAPI.uploadLecture(formData);
        } else {
            throw new Error('API client not loaded. Please refresh the page.');
        }

        // ── DIAGNOSTIC: log the raw upload response ─────────────────────────
        console.group('%c[startProcessing] upload result', 'color: #925E78; font-weight: bold;');
        console.log('result:', result);
        console.log('result.topics:', result && result.topics);
        console.log('result.document_id:', result && result.document_id);
        console.log('result.pdf_url:', result && result.pdf_url);
        console.groupEnd();
        // ── END DIAGNOSTIC ───────────────────────────────────────────────────

        if (!result) {
            throw new Error('Server returned an empty response. Please try again.');
        }

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        if (result.classification === 'invalid' || result.Classification === 'invalid') {
            AppState.isProcessing = false;
            showValidationFailedState();
            return;
        }

        // Successfully educational
        // Aggressively search for arrays in the response to tolerate AI deviations
        let extractedSegments = [];
        if (result.segmentation && Array.isArray(result.segmentation.extracted_segments)) {
            // Map the backend's specific schema to what the UI expects
            extractedSegments = result.segmentation.extracted_segments.map(seg => ({
                title: seg.topic_title || "Untitled Segment",
                core_concepts: seg.extracted_concepts || []
            }));
        } else if (result.segments && Array.isArray(result.segments)) extractedSegments = result.segments;
        else if (result.Segments && Array.isArray(result.Segments)) extractedSegments = result.Segments;
        else if (result.sections && Array.isArray(result.sections)) extractedSegments = result.sections;
        else if (result.Sections && Array.isArray(result.Sections)) extractedSegments = result.Sections;
        else if (result.topics && Array.isArray(result.topics)) extractedSegments = result.topics;
        else if (result.Topics && Array.isArray(result.Topics)) extractedSegments = result.Topics;
        else if (result.response && result.response.segments) extractedSegments = result.response.segments;
        
        // If it entirely failed to map to known keys, dump a diagnostic card to the screen
        if (extractedSegments.length === 0) {
            console.error("RAW JSON Payload:", result);
            const strDump = JSON.stringify(result).substring(0, 150);
            extractedSegments = [{
                title: "AI Payload Misalignment",
                core_concepts: [`Raw data: ${strDump}... Please check browser console.`]
            }];
        }

        AppState.categories = extractedSegments;

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        console.log('Processed Segments:', AppState.categories);
        
        if (result.pdf_url) {
            localStorage.setItem('learnback_pdf_url', result.pdf_url);
        }
        if (result.text_id) {
            localStorage.setItem('learnback_text_id', result.text_id);
        }
        if (result.document_id) {
            localStorage.setItem('learnback_document_id', result.document_id);
        }

        // Navigate to content screen
        setTimeout(() => {
            AppState.isProcessing = false;
            navigateToScreen('content');
        }, 800);

    } catch (error) {
        clearInterval(progressInterval);
        console.error('Upload error:', error);
        AppState.isProcessing = false;
        
        // Show validation failed specifically if it's a known bad file type
        if (error.message.includes('Unsupported') || error.message.includes('Could not extract')) {
            showValidationFailedState(error.message);
        } else {
            showError('Processing Error', error.message);
            navigateToScreen('upload'); // Go back to start
        }
    }
}

function showValidationFailedState(customMessage) {
    // Hide the processing UI
    const wrapper = document.querySelector('.processing-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    
    // Create or show the validation failed screen within the processing zone
    let failWrapper = document.getElementById('validation-failed-wrapper');
    if (!failWrapper) {
        failWrapper = document.createElement('div');
        failWrapper.id = 'validation-failed-wrapper';
        failWrapper.style.textAlign = 'center';
        failWrapper.style.padding = '20px 0';
        
        const zone = document.querySelector('#processing-screen .zone');
        if (zone) zone.appendChild(failWrapper);
    }
    
    failWrapper.style.display = 'block';
    failWrapper.innerHTML = `
        <div style="margin-bottom: 24px;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--plum)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        </div>
        <h2 class="processing-title" style="color: var(--plum);">Validation Failed</h2>
        <p class="processing-message" style="margin-bottom: 32px; max-width: 400px; margin-left: auto; margin-right: auto;">
            ${customMessage || "This document does not appear to be a valid educational lecture. Please upload a valid Computer Science or Machine Learning resource."}
        </p>
        <button class="btn btn--primary" onclick="window.location.reload()" style="padding: 10px 32px;">Try Again</button>
    `;
}

// ============================================
// Category Cards Rendering - Unified Symmetric Layout
// ============================================
function renderCategoryCards() {
    const categoriesContainer = document.getElementById('categories-container');
    if (!categoriesContainer) return;

    // Clear existing inner containers to inject the syllabus list
    categoriesContainer.innerHTML = '<div class="syllabus-list" id="syllabus-list"></div>';
    const syllabusList = document.getElementById('syllabus-list');

    const bookIcon = `<svg class="syllabus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

    // Render using the REAL data from Groq
    AppState.categories.forEach((segment, index) => {
        const card = document.createElement('div');
        card.className = 'syllabus-card';
        card.style.opacity = '0';
        card.style.transform = 'translateY(10px)';
        card.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        
        // Map Groq JSON fields (`title` and `core_concepts` array) to our UI
        const displayTitle = segment.title || segment.name || "Untitled Segment";
        
        let displayDesc = "No description generated.";
        if (segment.core_concepts && Array.isArray(segment.core_concepts)) {
            displayDesc = segment.core_concepts.join(", ");
        } else if (segment.content) {
            displayDesc = segment.content.length > 90 ? segment.content.substring(0, 90) + "..." : segment.content;
        } else if (segment.description) {
            displayDesc = segment.description.length > 90 ? segment.description.substring(0, 90) + "..." : segment.description;
        }
        
        card.innerHTML = `
            ${bookIcon}
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                <span class="syllabus-title">${displayTitle}</span>
                <span class="syllabus-desc">${displayDesc}</span>
            </div>
        `;
        syllabusList.appendChild(card);
        
        // Staggered fade in
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 50 + (index * 80));
    });
}

// ============================================
// Button Handlers
// ============================================
function initializeButtonHandlers() {
    elements.validateBtn.addEventListener('click', () => {
        if (!elements.validateBtn.disabled) {
            navigateToScreen('processing');
        }
    });

    elements.reuploadBtn.addEventListener('click', () => {
        resetAppState();
        navigateToScreen('upload');
    });

    elements.startSessionBtn.addEventListener('click', () => {
        handleStartSession();
    });
}

function resetAppState() {
    // Clear localStorage to ensure fresh session
    localStorage.removeItem('learnback_categories');
    localStorage.removeItem('learnback_session_complete');
    localStorage.removeItem('learnback_final_progress');
    localStorage.removeItem('learnback_message_count');
    localStorage.removeItem('learnback_pdf_url');
    localStorage.removeItem('learnback_document_id');

    AppState.uploadedFile = null;
    AppState.uploadedFileData = null;
    AppState.categories = [];
    AppState.mainCategories = [];
    AppState.additionalCategories = [];
    AppState.isProcessing = false;

    updateUploadZoneState();
    renderFileList();
    updateValidateButtonState();
    hideError();

    elements.startSessionBtn.innerHTML = `
        <img src="Components/Gamification-icon/icon-star.svg" alt="" class="btn-icon" style="margin-right: 8px; filter: brightness(0) invert(1);">
        <span>Start Session</span>
    `;
    elements.startSessionBtn.disabled = false;
    elements.startSessionBtn.style.background = '';
}

async function handleStartSession() {
    console.log("🔥 handleStartSession triggered");
    // ── DIAGNOSTIC ─────────────────────────────────────────────────────────────
    console.group('%c[handleStartSession] called', 'color: #925E78; font-weight: bold;');
    console.log('categories count:', AppState.categories.length);
    console.log('categories:', AppState.categories);
    console.log('localStorage learnback_document_id:', localStorage.getItem('learnback_document_id'));
    console.log('localStorage learnback_token exists:', !!localStorage.getItem('learnback_token'));
    console.groupEnd();
    // ── END DIAGNOSTIC ──────────────────────────────────────────────────────────
    console.log('Starting session with categories:', AppState.categories);

    if (!AppState.categories.length) {
        showError('No session topics', 'Upload a lecture first so we can build your session roadmap.');
        return;
    }

    // Disable button immediately to prevent double-clicks
    elements.startSessionBtn.disabled = true;
    elements.startSessionBtn.innerHTML = `<span>Launching...</span>`;

    const localSessionId = crypto.randomUUID();
    const documentId = localStorage.getItem('learnback_document_id') || null;
    const textId     = localStorage.getItem('learnback_text_id')     || null;
    const pdfUrl     = localStorage.getItem('learnback_pdf_url')      || null;

    // ✅ FIX: Save categories to localStorage BEFORE the async call so they
    // are always available even if the page reloads unexpectedly.
    localStorage.setItem('learnback_categories', JSON.stringify(AppState.categories));
    localStorage.setItem('learnback_session_complete', 'false');

    let sessionMeta = {
        sessionId: localSessionId,
        status: 'IN_PROGRESS',
        progressPercent: 0,
        startedAt: new Date().toISOString()
    };

    // Create the backend session.
    console.log("LearnBackAPI:", window.LearnBackAPI);
    console.log("startSession fn:", window.LearnBackAPI?.startSession);
    try {
        if (window.LearnBackAPI && typeof window.LearnBackAPI.startSession === 'function') {
            sessionMeta = await window.LearnBackAPI.startSession({
                sessionId: localSessionId,
                documentId: documentId || textId || null
            });
        }
        console.log('Session created successfully:', sessionMeta);
    } catch (error) {
        console.error('Failed to create backend session:', error);

        // ✅ FIX: Show the real error and re-enable the button.
        //    Do NOT redirect — the session was not created.
        elements.startSessionBtn.disabled = false;
        elements.startSessionBtn.innerHTML = `
            <img src="Components/Gamification-icon/icon-star.svg" alt="" class="btn-icon"
                style="margin-right: 8px; filter: brightness(0) invert(1);">
            <span>Start Session</span>`;
        showError(
            'Session Error',
            (error && error.message) ? error.message : 'Could not start session. Please try again.'
        );
        return; // ← CRITICAL: stop here, do not redirect
    }

    const resolvedTitle = sessionMeta.title || SESSION_TITLE;
    const sessionPayload = {
        sessionId: sessionMeta.sessionId || localSessionId,
        sessionTitle: resolvedTitle,
        topics: AppState.categories,
        topicIndex: 0,
        progress: 0,
        documentId: documentId,
        textId: textId,
        pdfUrl: pdfUrl,
        status: sessionMeta.status || 'IN_PROGRESS',
        startedAt: sessionMeta.startedAt || new Date().toISOString()
    };

    if (window.SessionStore && typeof window.SessionStore.createSession === 'function') {
        window.SessionStore.createSession(sessionPayload);
    } else {
        localStorage.setItem('learnback_session_id', sessionPayload.sessionId);
    }

    localStorage.setItem('learnback_session_title', resolvedTitle);

    // Redirect to session interface with the real session ID.
    const resolvedSessionId = sessionPayload.sessionId;
    console.log("🚨 Redirecting to session.html with sessionId:", resolvedSessionId);
    window.location.href = 'session.html?sessionId=' + encodeURIComponent(resolvedSessionId);
}


function initTheme() {
    var saved = localStorage.getItem('lb-theme') || 'light';
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    updateThemeUI(saved === 'dark' ? 'dark' : 'light');

    var btn = document.getElementById('btn-theme-toggle');
    if (btn) {
        btn.addEventListener('click', function () {
            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('lb-theme', 'light');
                updateThemeUI('light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('lb-theme', 'dark');
                updateThemeUI('dark');
            }
        });
    }
}

function updateThemeUI(theme) {
    var sun = document.querySelector('.theme-icon-sun');
    var moon = document.querySelector('.theme-icon-moon');
    var label = document.querySelector('.theme-toggle-text');
    if (theme === 'dark') {
        if (sun) sun.style.display = 'inline-block';
        if (moon) moon.style.display = 'none';
        if (label) label.textContent = 'Light';
    } else {
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'inline-block';
        if (label) label.textContent = 'Dark';
    }
}

// ============================================
// Initialize
// ============================================
function init() {
    console.log('LearnBack Upload initialized (Resetting session)');
    localStorage.removeItem('learnback_categories');
    if (window.SessionStore && typeof window.SessionStore.clearSession === 'function') {
        window.SessionStore.clearSession();
    }

    initTheme();
    initializeUploadHandlers();
    initializeButtonHandlers();
    navigateToScreen('upload');
}

document.addEventListener('DOMContentLoaded', init);
