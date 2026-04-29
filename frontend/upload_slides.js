(function () {
  'use strict';
  console.warn("🚨 UPLOAD_SLIDES.JS HAS SUCCESSFULLY LOADED 🚨");

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-upload');
    const submitBtn = document.getElementById('upload-submit');
    const loadingContainer = document.getElementById('upload-loading');
    const errorContainer = document.getElementById('upload-error');
    const errorText = document.getElementById('upload-error-text');

    if (!fileInput || !submitBtn) {
      console.error("Missing critical DOM elements in upload_slides.html");
      return;
    }

    // Quick file selection listener so user can open file picker by clicking the zone
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput.click());
      
      // Update text when file selected
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          const fileName = fileInput.files[0].name;
          const primaryText = dropZone.querySelector('.upload-text-primary');
          if (primaryText) primaryText.textContent = `Selected: ${fileName}`;
        }
      });
    }

    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      if (!fileInput.files || fileInput.files.length === 0) {
        if (errorText) errorText.textContent = "Please select a file to upload.";
        errorContainer.classList.remove('hidden');
        return;
      }

      // Hide errors
      errorContainer.classList.add('hidden');
      
      // Hide button, show loading
      submitBtn.style.display = 'none';
      
      // The CSS might rely on removing "active" from the first screen, but let's just show the loader
      document.getElementById('upload-screen').classList.remove('active');
      document.getElementById('upload-screen').style.display = 'none';
      
      loadingContainer.classList.remove('hidden');
      loadingContainer.classList.add('active'); // CSS hook

      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append("file", file);

      try {
        // 5. Call uploadLecture
        const uploadResponse = await window.LearnBackAPI.uploadLecture(formData);
        
        // 6. Parse response
        const documentId = uploadResponse.document_id || uploadResponse.id;
        if (!documentId) {
          throw new Error("Invalid response from ingestion engine: Missing document_id");
        }

        // 6b. Content validation — ensure segmentation produced usable topics.
        const seg = uploadResponse.segmentation;
        const segments = seg && seg.extracted_segments;
        if (!segments || !Array.isArray(segments) || segments.length === 0) {
          throw new Error(
            "This document does not contain enough educational content for a structured learning session. " +
            "Please upload lecture slides or study material."
          );
        }

        // 7. IMMEDIATELY call startSession
        const sessionResponse = await window.LearnBackAPI.startSession({ documentId: documentId });
        
        // 8. Parse session response
        const sessionId = sessionResponse.sessionId || sessionResponse.session_id || sessionResponse.id;
        if (!sessionId) {
          throw new Error("Invalid response from session creation: Missing session_id");
        }

        // 9. Redirect to session interface
        window.location.href = `session.html?sessionId=${encodeURIComponent(sessionId)}`;
        
      } catch (error) {
        console.error("Upload/Session initialization failed:", error);
        
        // Hide loading UI
        loadingContainer.classList.add('hidden');
        loadingContainer.classList.remove('active');
        
        // Restore initial UI
        document.getElementById('upload-screen').classList.add('active');
        document.getElementById('upload-screen').style.display = '';
        submitBtn.style.display = '';
        
        // Show user-friendly error message (via centralized normalizer)
        if (errorText) {
          if (window.LearnBackAPI && window.LearnBackAPI.normalizeUserError) {
            var friendly = window.LearnBackAPI.normalizeUserError(error);
            errorText.textContent = friendly.title + ' ' + friendly.suggestion;
          } else {
            errorText.textContent = "Failed to process slides. Please try again.";
          }
        }
        errorContainer.classList.remove('hidden');
      }
    });
  });
})();
