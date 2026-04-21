// frontend/pdfViewer.js
window.LearnBackPDF = (function() {
  let pdfDoc = null;
  let currentPageNum = 1;
  let pdfTotalPages = 0;
  let currentZoom = 1;
  let container = null;
  let renderLayer = null;
  let pageNavDisplay = null;
  let fitWidthScale = 1;
  let resizeObserver = null;
  const renderedPages = new Map();
  const pendingRenders = new Map();

  async function renderPage(pageNum, wrapper, forceRedraw = false) {
    if (!pdfDoc || !wrapper) return;
    
    // Skip if already rendered at this zoom level (unless forced by zoom)
    if (!forceRedraw && renderedPages.has(pageNum)) return; 
    if (pendingRenders.has(pageNum)) return;
    pendingRenders.set(pageNum, true);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentZoom });
      
      // ── Double Buffer: Draw on a NEW off-screen canvas first ──
      const newCanvas = document.createElement('canvas');
      const ctx = newCanvas.getContext('2d', { alpha: false });
      
      const outputScale = window.devicePixelRatio || 1;
      newCanvas.width = Math.floor(viewport.width * outputScale);
      newCanvas.height = Math.floor(viewport.height * outputScale);
      newCanvas.style.width = `${viewport.width}px`;
      newCanvas.style.height = `${viewport.height}px`;
      newCanvas.style.display = 'block'; // ensure no inline-block gap
      
      const transform = outputScale !== 1 
        ? [outputScale, 0, 0, outputScale, 0, 0] 
        : null;

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      };
      
      // Render completely off-screen FIRST (old canvas still visible → no flicker)
      await page.render(renderContext).promise;
      
      // ── Atomic Swap: Only NOW replace the old canvas with the new one ──
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.innerHTML = ''; // Clear old canvas
      wrapper.appendChild(newCanvas);
      
      renderedPages.set(pageNum, newCanvas);
      wrapper.dataset.rendered = "true";
      
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, e);
        wrapper.innerHTML = `<div style="padding: 20px; color: #ef4444; font-size: 14px;">Failed to render page ${pageNum}</div>`;
      }
    } finally {
      pendingRenders.delete(pageNum);
    }
  }

  function unrenderPage(pageNum, wrapper) {
    if (renderedPages.has(pageNum)) {
      wrapper.innerHTML = '';
      wrapper.dataset.rendered = "false";
      renderedPages.delete(pageNum);
    }
  }


  // isZoom=true means force a redraw (double-buffer path) for all visible pages
  function updateVisiblePages(isZoom = false) {
    if (!pdfDoc || !renderLayer) return;
    
    // Render current, prev, next
    const targetPages = new Set([
      currentPageNum - 1,
      currentPageNum,
      currentPageNum + 1
    ]);
    
    for (let i = 1; i <= pdfTotalPages; i++) {
        const wrapper = renderLayer.querySelector(`.pdf-page-wrapper[data-page-num="${i}"]`);
        if (!wrapper) continue;

        if (targetPages.has(i)) {
            if (isZoom) {
                // Force double-buffered redraw at new zoom scale
                renderedPages.delete(i);
                renderPage(i, wrapper, true);
            } else if (!renderedPages.has(i)) {
                renderPage(i, wrapper);
            }
        } else {
            unrenderPage(i, wrapper);
        }
    }
  }

  function updatePageDisplay() {
      if (pageNavDisplay) {
          pageNavDisplay.textContent = `${currentPageNum} / ${pdfTotalPages}`;
      }
  }

  async function calculateFitWidthScale() {
      if (!pdfDoc || !container) return 1;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const availableWidth = container.clientWidth - 40; 
      return Math.max(0.5, availableWidth / viewport.width);
  }

  async function updateAllWrappers() {
      if (!pdfDoc || !renderLayer) return;
      try {
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: currentZoom });
          // First, resize ALL placeholder wrappers to the new scale dimensions
          const wrappers = renderLayer.querySelectorAll('.pdf-page-wrapper');
          wrappers.forEach(w => {
              w.style.width = `${viewport.width}px`;
              w.style.height = `${viewport.height}px`;
          });
      } catch(e) {}
      // Then trigger double-buffered redraws only on the visible pages
      updateVisiblePages(true);
  }

  return {
    open: async (pdfUrl) => {
        container = document.getElementById('pdf-viewer-container');
        renderLayer = document.getElementById('pdf-render-layer');
        if (!container || !renderLayer) return;
        
        pageNavDisplay = document.getElementById('pdf-page-display');
        
        renderLayer.innerHTML = '';
        renderedPages.clear();
        pendingRenders.clear();

        const pdfInstance = window.pdfjsLib;
        if (!pdfInstance) {
          console.error("PDF.js library missing.");
          renderLayer.innerHTML = '<div style="padding: 24px; color: #925E78;">PDF.js library not loaded.</div>';
          return;
        }

        try {
            pdfDoc = await pdfInstance.getDocument(pdfUrl).promise;
            pdfTotalPages = pdfDoc.numPages;
            currentPageNum = 1;
            
            fitWidthScale = await calculateFitWidthScale();
            currentZoom = fitWidthScale;

            for (let i = 1; i <= pdfTotalPages; i++) {
                const wrapper = document.createElement('div');
                wrapper.className = 'pdf-page-wrapper bg-white shadow flex-shrink-0';
                wrapper.dataset.pageNum = i;
                wrapper.dataset.rendered = "false";
                
                wrapper.style.width = '800px';
                wrapper.style.height = `${800 * 0.5625}px`;
                wrapper.style.marginBottom = '16px';
                
                renderLayer.appendChild(wrapper);
            }

            updateVisiblePages();
            updatePageDisplay();

            container.addEventListener('scroll', () => {
                if (!pdfDoc) return;
                const wrappers = renderLayer.querySelectorAll('.pdf-page-wrapper');
                let newCurrentPage = currentPageNum;
                let minDistance = Infinity;
                
                const containerCenter = container.scrollTop + (container.clientHeight / 2);

                wrappers.forEach(w => {
                    const rect = w.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    
                    const top = rect.top - containerRect.top + container.scrollTop;
                    const center = top + (rect.height / 2);
                    
                    const dist = Math.abs(center - containerCenter);
                    if (dist < minDistance) {
                        minDistance = dist;
                        newCurrentPage = parseInt(w.dataset.pageNum);
                    }
                });

                if (newCurrentPage !== currentPageNum) {
                    currentPageNum = newCurrentPage;
                    updatePageDisplay();
                    updateVisiblePages();
                }
            }, { passive: true });

            // --- Drag to Scroll ---
            let isDown = false;
            let startX, startY, scrollLeft, scrollTop;

            container.style.overflow = 'auto'; // Fallback guarantee

            container.addEventListener('mousedown', (e) => {
                isDown = true;
                container.style.cursor = 'grabbing';
                startX = e.pageX - container.offsetLeft;
                startY = e.pageY - container.offsetTop;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
            });
            container.addEventListener('mouseleave', () => { 
                isDown = false; 
                container.style.cursor = 'grab';
            });
            container.addEventListener('mouseup', () => { 
                isDown = false; 
                container.style.cursor = 'grab';
            });
            container.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const y = e.pageY - container.offsetTop;
                const walkX = (x - startX) * 1.5; 
                const walkY = (y - startY) * 1.5;
                container.scrollLeft = scrollLeft - walkX;
                container.scrollTop = scrollTop - walkY;
            });

            // --- Pinch to Zoom / Ctrl+Scroll ---
            container.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        currentZoom = Math.min(currentZoom + 0.15, 3.0);
                    } else {
                        currentZoom = Math.max(currentZoom - 0.15, 0.5);
                    }
                    updateAllWrappers();
                }
            }, { passive: false });

            resizeObserver = new ResizeObserver(async () => {
                if (!pdfDoc) return;
                const newFit = await calculateFitWidthScale();
                if (Math.abs(newFit - fitWidthScale) > 0.05) {
                    // Update zoom directly if we were already fit width, or just recalibrate it
                    fitWidthScale = newFit;
                }
            });
            resizeObserver.observe(container);

        } catch (e) {
            console.error("Failed to load PDF:", e);
            renderLayer.innerHTML = `<div style="padding: 24px; color: #ef4444;">Failed to load PDF: ${e.message}</div>`;
        }
    },
    
    close: () => {
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
        if (renderLayer) renderLayer.innerHTML = '';
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        renderedPages.clear();
        pendingRenders.clear();
        pdfTotalPages = 0;
        currentPageNum = 1;
        currentZoom = 1;
    },

    goToPage: (n) => {
        if (!pdfDoc || !container || !renderLayer) return;
        const target = Math.max(1, Math.min(n, pdfTotalPages));
        const wrapper = renderLayer.querySelector(`.pdf-page-wrapper[data-page-num="${target}"]`);
        if (wrapper) {
            // Precise scroll offset calculation relative to the scroll container's current state
            const targetOffsetBottom = wrapper.offsetTop + wrapper.offsetHeight;
            const scrollBottom = container.scrollTop + container.clientHeight;
            
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            currentPageNum = target;
            updatePageDisplay();
            updateVisiblePages();
        }
    },
    
    zoomIn: () => {
        if (!pdfDoc) return;
        currentZoom = Math.min(currentZoom + 0.15, 3.0);
        updateAllWrappers();
    },
    
    zoomOut: () => {
        if (!pdfDoc) return;
        currentZoom = Math.max(currentZoom - 0.15, 0.5);
        updateAllWrappers();
    },
    
    zoomFit: async () => {
        if (!pdfDoc) return;
        currentZoom = await calculateFitWidthScale();
        updateAllWrappers();
    }
  };
})();
