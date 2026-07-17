/**
 * exporter-controller.js
 * Main Thread Pipeline Orchestrator and Safe Downloader
 */

export class ExportController {
    constructor(workerUrl) {
        this.workerUrl = workerUrl;
        this.worker = null;
        this.exportTimeoutId = null;
        this.currentBlobUrl = null; // Track the current blob url
        this.frameAckResolver = null; // Resolve callback for backpressure
        
        // Configuration Safety Limits
        this.GLOBAL_WATCHDOG_MS = 60000; // 1 Minute absolute max export threshold
    }

    /**
     * Initializes the worker element and attaches message callbacks
     */
    initWorker(context) {
        if (this.worker) this.worker.terminate();
        
        // REQUIREMENT: Create the worker as type: module using URL import.meta.url syntax
        this.worker = new Worker(new URL("./exporter-worker.js", import.meta.url), { type: "module" });
        console.log('[Controller] Web Worker module instance built successfully.');
    }

    /**
     * Returns a promise that resolves when the worker sends a FRAME_ACK
     */
    awaitFrameAck() {
        return new Promise((resolve) => {
            this.frameAckResolver = resolve;
        });
    }

    /**
     * Sets up configuration parameters and boots up the pipeline
     */
    startExport(config, context) {
        console.log('[Controller] Initializing export sequence...');
        this.updateUIStatus('Configuring framework engines...', context);
        
        this.initWorker(context);
        this.frameAckResolver = null;
        
        return new Promise((resolve, reject) => {
            // Attach event handlers before posting configuration to avoid race conditions
            this.worker.onmessage = (e) => {
                const { type, buffer, error } = e.data;
                console.log(`[Controller Event] Received type: ${type}`);

                switch (type) {
                    case 'PIPELINE_READY':
                        resolve(); // Resolved when pipeline is fully ready
                        break;
                    case 'FRAME_ACK':
                        if (this.frameAckResolver) {
                            const callback = this.frameAckResolver;
                            this.frameAckResolver = null;
                            callback();
                        }
                        break;
                    case 'EXPORT_COMPLETE':
                        this.clearWatchdog();
                        this.handleExportSuccess(buffer, context);
                        break;
                    case 'EXPORT_ERROR':
                        this.clearWatchdog();
                        this.handleExportFailure(error, context);
                        reject(new Error(error));
                        break;
                }
            };

            this.worker.onerror = (err) => {
                console.error('[Controller] Core Worker Error:', err);
                this.clearWatchdog();
                this.handleExportFailure(err.message, context);
                reject(err);
            };

            // Post configuration message immediately (prevents deadlock)
            this.worker.postMessage({
                type: 'CONFIGURE_EXPORT',
                data: config
            });
        });
    }

    /**
     * Proxies a VideoFrame instance downstream safely to the WebWorker thread
     */
    submitVideoFrame(videoFrame, timestamp, isKeyframe = false) {
        if (!this.worker) return;
        
        // Pass ownership structure directly via transfer list to avoid deep-cloning
        this.worker.postMessage({
            type: 'ENCODE_VIDEO_FRAME',
            data: {
                frame: videoFrame,
                timestamp: timestamp,
                keyFrame: isKeyframe
            }
        }, [videoFrame]); 
    }

    /**
     * Proxies an AudioData instance safely to the WebWorker thread
     */
    submitAudioData(audioData) {
        if (!this.worker) return;
        this.worker.postMessage({
            type: 'ENCODE_AUDIO_CHUNK',
            data: {
                audioData: audioData
            }
        }, [audioData]);
    }

    /**
     * Triggers completion phase and starts explicit error handling timers
     */
    finalizeExport(context) {
        if (!this.worker) return;

        console.log('[Controller] UI marked 100% feed input completion. Finalizing video containers...');
        this.updateUIStatus('Finalizing video containers... (Writing Atoms)', context);

        // Fallback Watchdog: Ensures if the worker locks or hangs, the UI breaks out gracefully
        this.exportTimeoutId = setTimeout(() => {
            console.error('[Controller WATCHDOG] Container assembly hung up permanently.');
            this.handleExportFailure('Process exceeded allowed assembly execution thresholds.', context);
            if (this.worker) this.worker.terminate();
        }, this.GLOBAL_WATCHDOG_MS);

        this.worker.postMessage({ type: 'FINALIZE_EXPORT' });
    }

    handleExportSuccess(arrayBuffer, context) {
        const { state, el, resetEditorState } = context;
        console.log('[Controller] File conversion finalized cleanly. Building asset link...');
        this.updateUIStatus('Export complete! Starting file download.', context);

        try {
            // 1. Explicitly revoke the previous blob URL to clear memory reference
            if (this.currentBlobUrl) {
                console.log("[Controller] Revoking previous download blob URL:", this.currentBlobUrl);
                URL.revokeObjectURL(this.currentBlobUrl);
                this.currentBlobUrl = null;
            }

            // 2. Build a Blob container using explicit structural definitions
            const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
            
            if (videoBlob.size < 1000) {
                throw new Error(`Generated file corrupted or empty: Size is ${videoBlob.size} bytes.`);
            }

            // 3. Generate a DOM URL element map
            this.currentBlobUrl = URL.createObjectURL(videoBlob);
            
            // 4. Force trigger native file download layout
            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = this.currentBlobUrl;
            
            // Ensure filename is unique using Date.now() to prevent browser name caching
            const timestampName = Date.now();
            downloadAnchor.download = `Quiz_Shorts_${timestampName}.mp4`;
            
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            
            // Clean up DOM hooks instantly
            document.body.removeChild(downloadAnchor);

            // Set UI components
            el.downloadLink.href = this.currentBlobUrl;
            el.downloadLink.download = downloadAnchor.download;
            el.downloadLink.classList.remove('hidden');
            if (el.newVideoBtn) el.newVideoBtn.classList.remove('hidden');
            el.progressStatusText.textContent = "Export complete! Click below to download.";
            el.progressBar.style.width = "100%";
            el.progressPercentage.textContent = "100%";
            
            // Set the video preview player so they can preview the finalized video and save it natively
            if (el.exportPreviewVideo) {
                el.exportPreviewVideo.src = this.currentBlobUrl;
                el.exportPreviewVideo.classList.remove('hidden');
                el.canvas.classList.add('hidden');
                el.exportPreviewVideo.load();
                el.exportPreviewVideo.play().catch(e => console.log('Auto-play blocked or failed:', e));
            }
            
            state.exporting.isExporting = false;
            
            console.log('[Controller] Complete download sequence dispatched to UI container.');
            this.cleanup();

        } catch (err) {
            this.handleExportFailure(`Blob Generation Error: ${err.message}`, context);
        }
    }

    handleExportFailure(errorMessage, context) {
        const { state, el } = context;
        console.error(`[Controller Alert] Export Pipeline Failure: ${errorMessage}`);
        this.updateUIStatus(`Export Failed: ${errorMessage}`, context);
        
        // Custom UI warning for proper error handling
        if (el && el.progressBar) {
            el.progressBar.style.background = 'var(--color-danger)';
            el.progressBar.style.width = '100%';
        }
        if (el && el.progressPercentage) {
            el.progressPercentage.textContent = 'Error';
            el.progressPercentage.style.color = 'var(--color-danger)';
        }

        alert(`Export process failed: ${errorMessage}`);

        state.exporting.isExporting = false;
        if (el && el.exportBtn) el.exportBtn.classList.remove('hidden');
        
        this.cleanup();
    }

    clearWatchdog() {
        if (this.exportTimeoutId) {
            clearTimeout(this.exportTimeoutId);
            this.exportTimeoutId = null;
        }
    }

    updateUIStatus(message, context) {
        const { el } = context;
        if (el && el.progressStatusText) {
            el.progressStatusText.textContent = message;
        }
    }

    cleanup() {
        if (this.worker) {
            console.log('[Controller] Terminating worker reference...');
            this.worker.terminate();
            this.worker = null;
        }
        this.frameAckResolver = null;
    }
}

export const exporterController = new ExportController('exporter-worker.js');
