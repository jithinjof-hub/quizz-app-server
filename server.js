const express = require('express');
const path = require('path');
const fs = require('fs');
const googleTTS = require('google-tts-api'); 

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to handle video generation
app.post('/generate-video', async (req, res) => {
    try {
        const { text, audioData } = req.body;
        let audioPath = path.join(__dirname, 'temp_audio.mp3');

        // Check if audio data was received from the client
        if (!audioData) {
            console.log("Audio data missing from client. Generating English TTS on server...");
            const base64Audio = await googleTTS.getAudioBase64(text, {
                lang: 'en',
                slow: false,
                host: 'https://translate.google.com',
                timeout: 10000,
            });
            fs.writeFileSync(audioPath, Buffer.from(base64Audio, 'base64'));
        } else {
            console.log("Audio data received successfully. Saving file...");
            const base64Data = audioData.replace(/^data:audio\/mp3;base64,/, "");
            fs.writeFileSync(audioPath, Buffer.from(base64Data, 'base64'));
        }

        // --- Your existing FFmpeg / Video rendering logic goes here ---

        res.json({ success: true, message: "Video generated successfully with English audio!" });

    } catch (error) {
        console.error("Error during video or audio generation:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});