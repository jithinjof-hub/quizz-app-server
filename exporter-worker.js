/**
 * exporter-worker.js
 * Comprehensive WebCodecs & Muxer Pipeline Worker
 * ES Module Worker importing mp4-muxer locally
 */

import * as Mp4Muxer from "mp4-muxer";

let videoEncoder = null;
let audioEncoder = null;
let muxer = null;
let targetBuffer = [];
let isFinalizing = false;
let pendingAckResolver = null; // High/low watermark backpressure resolver

// Configuration Constants
const FLUSH_TIMEOUT_MS = 8000; // Increased to 8 seconds for slow CPU/GPU setups

self.onmessage = async function (e) {
    const { type, data } = e.data;
    
    console.log(`[Worker] Received action: ${type}`);

    try {
        switch (type) {
            case 'CONFIGURE_EXPORT':
                await initializePipeline(data);
                break;
            case 'ENCODE_VIDEO_FRAME':
                encodeVideoFrame(data.frame, data.timestamp, data.keyFrame);
                break;
            case 'ENCODE_AUDIO_CHUNK':
                encodeAudioChunk(data.audioData);
                break;
            case 'FINALIZE_EXPORT':
                if (isFinalizing) return;
                isFinalizing = true;
                await executionPipelineFinalization();
                break;
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (err) {
        console.error(`[Worker CRITICAL ERROR] Processing ${type}:`, err);
        self.postMessage({
            type: 'EXPORT_ERROR',
            error: err.message || 'An unhandled pipeline error occurred.'
        });
    }
};

/**
 * Initializes Mp4Muxer and WebCodecs Encoders dynamically
 */
async function initializePipeline(config) {
    console.log('[Worker] Initializing pipeline configurations...', config);
    targetBuffer = [];
    isFinalizing = false;
    pendingAckResolver = null;

    // 1. Fallback matrix for WebCodecs H.264 video profile selection
    const requestedVideoCodec = config.video.codec || 'avc1.4d002a';
    const fallbackVideoCodecs = [
        requestedVideoCodec,
        'avc1.42e01f', // H.264 Constrained Baseline Profile - universal support
        'vp09.00.10.08', // VP9 Profile 0, 8-bit - software fallback
        'avc1.4d001f', // H.264 Main Profile
        'avc1.64001f'  // H.264 High Profile
    ];

    let selectedVideoCodec = null;
    let selectedAcceleration = 'prefer-software'; // Default to software

    const accelerationPreferences = ['prefer-software', 'no-preference', 'prefer-hardware'];

    for (const codec of fallbackVideoCodecs) {
        let found = false;
        for (const accel of accelerationPreferences) {
            try {
                const support = await VideoEncoder.isConfigSupported({
                    codec: codec,
                    width: config.video.width,
                    height: config.video.height,
                    bitrate: config.video.bitrate || 5000000,
                    hardwareAcceleration: accel,
                    avc: codec.startsWith('avc1') ? { format: 'avc' } : undefined
                });
                if (support.supported) {
                    selectedVideoCodec = codec;
                    selectedAcceleration = accel;
                    found = true;
                    break;
                }
            } catch (e) {
                console.warn(`[Worker] Config query failed for ${codec} with ${accel}:`, e);
            }
        }
        if (found) break;
    }

    if (!selectedVideoCodec) {
        throw new Error('No supported AVC/H.264 or VP9 WebCodecs configurations found in this browser.');
    }

    console.log(`[Worker] Selected video codec: ${selectedVideoCodec} (Acceleration: ${selectedAcceleration})`);

    // 2. Fallback matrix for WebCodecs Audio Profile selection (AAC-LC compatibility check)
    const requestedAudioCodec = config.audio ? (config.audio.codec || 'mp4a.40.2') : 'mp4a.40.2';
    const fallbackAudioCodecs = [
        requestedAudioCodec,
        'mp4a.40.2',  // AAC-LC (Low Complexity) - highest mobile hardware support
        'mp4a.40.5',  // HE-AAC
        'mp4a.40.29'  // HE-AAC v2
    ];

    let selectedAudioCodec = null;

    if (config.audio) {
        for (const codec of fallbackAudioCodecs) {
            try {
                const support = await AudioEncoder.isConfigSupported({
                    codec: codec,
                    sampleRate: config.audio.sampleRate,
                    numberOfChannels: config.audio.numberOfChannels,
                    bitrate: config.audio.bitrate || 128000
                });
                if (support.supported) {
                    selectedAudioCodec = codec;
                    break;
                }
            } catch (e) {
                console.warn(`[Worker] Audio config query failed for ${codec}:`, e);
            }
        }

        if (!selectedAudioCodec) {
            console.warn('[Worker] No supported AudioEncoder config found. Falling back to requested codec.');
            selectedAudioCodec = requestedAudioCodec;
        }
    }

    console.log(`[Worker] Selected audio codec: ${selectedAudioCodec}`);

    // 3. Map selected video codec to mp4-muxer supported generic video codecs
    let muxerVideoCodec = 'avc';
    if (selectedVideoCodec.startsWith('avc1')) {
        muxerVideoCodec = 'avc';
    } else if (selectedVideoCodec.startsWith('hvc1')) {
        muxerVideoCodec = 'hevc';
    } else if (selectedVideoCodec.startsWith('vp09') || selectedVideoCodec.startsWith('vp9')) {
        muxerVideoCodec = 'vp9';
    } else if (selectedVideoCodec.startsWith('av01')) {
        muxerVideoCodec = 'av1';
    }

    // 4. Map selected audio codec to mp4-muxer supported generic audio codecs ("aac", "opus")
    let muxerAudioCodec = undefined;
    if (config.audio) {
        muxerAudioCodec = 'aac'; // default fallback
        if (selectedAudioCodec.startsWith('mp4a')) {
            muxerAudioCodec = 'aac';
        } else if (selectedAudioCodec.startsWith('opus')) {
            muxerAudioCodec = 'opus';
        }
    }

    // 5. Initialize Muxer
    muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
            codec: muxerVideoCodec,
            width: config.video.width,
            height: config.video.height
        },
        audio: config.audio ? {
            codec: muxerAudioCodec,
            sampleRate: config.audio.sampleRate,
            numberOfChannels: config.audio.numberOfChannels
        } : undefined,
        firstTimestampBehavior: 'offset',
        fastStart: 'in-memory'
    });

    // 6. Initialize VideoEncoder
    videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
            console.log(`[Worker] Video Chunk Encoded. Size: ${chunk.byteLength}B, Type: ${chunk.type}`);
            muxer.addVideoChunk(chunk, metadata);

            // Watermark Backpressure: If queue size drains below Low Watermark (4), resume rendering loop
            if (pendingAckResolver && videoEncoder.encodeQueueSize < 4) {
                const resumeAck = pendingAckResolver;
                pendingAckResolver = null;
                resumeAck();
            }
        },
        error: (err) => {
            console.error('[Worker] VideoEncoder Inner Error:', err);
            self.postMessage({ type: 'EXPORT_ERROR', error: `VideoEncoder Error: ${err.message}` });
        }
    });

    videoEncoder.configure({
        codec: selectedVideoCodec,
        width: config.video.width,
        height: config.video.height,
        bitrate: config.video.bitrate || 5000000,
        hardwareAcceleration: selectedAcceleration,
        avc: selectedVideoCodec.startsWith('avc1') ? { format: 'avc' } : undefined
    });

    // 7. Initialize AudioEncoder (Optional Context)
    if (config.audio) {
        audioEncoder = new AudioEncoder({
            output: (chunk, metadata) => {
                console.log(`[Worker] Audio Chunk Encoded. Size: ${chunk.byteLength}B`);
                muxer.addAudioChunk(chunk, metadata);
            },
            error: (err) => {
                console.error('[Worker] AudioEncoder Inner Error:', err);
                self.postMessage({ type: 'EXPORT_ERROR', error: `AudioEncoder Error: ${err.message}` });
            }
        });

        audioEncoder.configure({
            codec: selectedAudioCodec,
            sampleRate: config.audio.sampleRate,
            numberOfChannels: config.audio.numberOfChannels,
            bitrate: config.audio.bitrate || 128000
        });
    }
    
    console.log('[Worker] Entire pipeline successfully configured.');
    self.postMessage({ type: 'PIPELINE_READY' });
}

function encodeVideoFrame(frame, timestamp, keyFrame) {
    if (!videoEncoder || videoEncoder.state === 'unconfigured') {
        frame.close();
        throw new Error('VideoEncoder not ready or closed.');
    }
    
    videoEncoder.encode(frame, { keyFrame });
    frame.close(); // Crucial: Free GPU/CPU memory instantly

    // Watermark Backpressure Check
    if (videoEncoder.encodeQueueSize < 8) {
        self.postMessage({ type: 'FRAME_ACK', timestamp: timestamp });
    } else {
        pendingAckResolver = () => {
            self.postMessage({ type: 'FRAME_ACK', timestamp: timestamp });
        };
    }
}

function encodeAudioChunk(audioData) {
    if (!audioEncoder || audioEncoder.state === 'unconfigured') {
        audioData.close();
        return;
    }
    audioEncoder.encode(audioData);
    audioData.close();
}

/**
 * Wraps any promise with a hard timeout to avoid permanent hanging states
 */
function promiseWithTimeout(promise, ms, timeoutErrorMsg) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout Error: ${timeoutErrorMsg} after ${ms}ms`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).then((res) => {
        timeoutId && clearTimeout(timeoutId);
        return res;
    });
}

/**
 * Orchestrates synchronous flushes, finalizes container, and extracts the buffer
 */
async function executionPipelineFinalization() {
    console.log('[Worker] Starting strict sequence finalization process...');

    try {
        // 1. Flush Video Encoder with Timeout protection
        if (videoEncoder && videoEncoder.state === 'configured') {
            console.log('[Worker] Flushing Video Encoder...');
            await promiseWithTimeout(
                videoEncoder.flush(),
                FLUSH_TIMEOUT_MS,
                'VideoEncoder flush timed out.'
            );
            console.log('[Worker] Video Encoder flushed cleanly.');
        }

        // 2. Flush Audio Encoder with Timeout protection
        if (audioEncoder && audioEncoder.state === 'configured') {
            console.log('[Worker] Flushing Audio Encoder...');
            await promiseWithTimeout(
                audioEncoder.flush(),
                FLUSH_TIMEOUT_MS,
                'AudioEncoder flush timed out.'
            );
            console.log('[Worker] Audio Encoder flushed cleanly.');
        }

        // 3. Finalize the Muxer with Watchdog protection
        if (muxer) {
            console.log('[Worker] Invoking Muxer finalization...');
            
            // Safe execution wrapper for container assembly
            await promiseWithTimeout(
                Promise.resolve().then(() => muxer.finalize()),
                FLUSH_TIMEOUT_MS,
                'Container Muxer finalization hung up.'
            );
            
            console.log('[Worker] Container finalized successfully.');

            // 4. Retrieve data from the Target Storage
            const buffer = muxer.target.buffer;
            console.log(`[Worker] Final file created. Total size: ${buffer.byteLength} bytes.`);

            if (buffer.byteLength < 1024 * 100) {
                console.warn('[Worker Warning] Final buffer looks suspiciously small (< 100KB). Check asset feeds.');
            }

            // 5. Transfer ArrayBuffer back to main thread (Zero-copy optimization)
            self.postMessage({
                type: 'EXPORT_COMPLETE',
                buffer: buffer
            }, [buffer]);

        } else {
            throw new Error('Muxer reference was lost before finalization.');
        }

    } catch (err) {
        console.error('[Worker Finalize Exception]', err);
        throw err;
    } finally {
        cleanupPipeline();
    }
}

function cleanupPipeline() {
    console.log('[Worker] Cleaning up all WebCodecs components...');
    try {
        if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch (e) {
        console.error('[Worker] Error closing codecs safely:', e);
    }
    videoEncoder = null;
    audioEncoder = null;
    muxer = null;
    targetBuffer = [];
    isFinalizing = false;
    pendingAckResolver = null;
}
