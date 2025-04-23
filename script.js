const recordButton = document.getElementById('recordButton');
const statusDiv = document.getElementById('status');
const yourInputDiv = document.getElementById('yourInput');
const agentResponseDiv = document.getElementById('agentResponse');
const researchPlanDiv = document.getElementById('researchPlanOutput');
const pageBody = document.body; // Get reference to the body element

// --- N8N Production URL (Should be correct from before) ---
const N8N_WEBHOOK_URL = 'https://aiuxr.app.n8n.cloud/webhook/f418c980-faf8-46bb-920b-b97361ffaa5c';
// -----------------------------------------------------------

// --- Generate a UNIQUE Session ID for this page load ---
const currentSessionId = crypto.randomUUID();
console.log("Using Session ID:", currentSessionId); // Log to console for debugging
// -----------------------------------------------------

// Basic check if URL was somehow missed
if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL === 'YOUR_N8N_PRODUCTION_WEBHOOK_URL_HERE') {
    alert('ERROR: Please paste your n8n Production Webhook URL into the script.js file.');
}

// Check for browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false; // Process single utterances
    recognition.lang = 'en-US'; // Adjust language if needed
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        statusDiv.textContent = 'Status: Recording...';
        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('recording');
        yourInputDiv.textContent = ''; // Clear previous input
        agentResponseDiv.textContent = 'Listening to you...';
        pageBody.classList.add('pulsating'); // Start pulsing on record
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        yourInputDiv.textContent = transcript;
        statusDiv.textContent = 'Status: Processing...';
        sendToN8n(transcript);
    };

    recognition.onspeechend = () => {
        recognition.stop();
        // Setting isRecording = false is handled in onend or onerror
    };

    recognition.onnomatch = () => {
        statusDiv.textContent = 'Status: Speech not recognized. Try again.';
        resetButton();
        // No need to explicitly remove pulse here, onend will handle it
    };

    recognition.onerror = (event) => {
        statusDiv.textContent = `Status: Error during recognition: ${event.error}`;
        console.error('Speech recognition error:', event.error);
        resetButton();
        // No need to explicitly remove pulse here, onend will handle it
    };

    // onend is called both after successful recognition and after errors/no match
    recognition.onend = () => {
        isRecording = false; // Ensure recording stops regardless of success
        recordButton.textContent = 'Start Recording';
        recordButton.classList.remove('recording');
         // Don't overwrite specific error messages shown by onerror/onnomatch
        if (statusDiv.textContent.includes('Recording') || statusDiv.textContent.includes('Processing')) {
             statusDiv.textContent = 'Status: Recording stopped. Ready.';
        }
        // Stop pulsing only if not immediately playing audio
        // We rely on sendToN8n/audio.onended to manage pulse during playback
        if (!statusDiv.textContent.includes('Playing agent response')) {
             pageBody.classList.remove('pulsating');
        }
    };

} else {
    statusDiv.textContent = 'Status: Speech Recognition not supported by this browser.';
    recordButton.disabled = true;
}

recordButton.addEventListener('click', () => {
    if (!SpeechRecognition) return;

    if (isRecording) {
        recognition.stop(); // Will trigger onspeechend then onend
    } else {
        try {
            // Ensure clean state before starting
            yourInputDiv.textContent = '';
            agentResponseDiv.textContent = 'Agent is waiting...';
            statusDiv.textContent = 'Status: Initializing...';
            recognition.start();
            isRecording = true;
            // onstart will update button text and status, and start pulse
        } catch (error) {
            console.error("Error starting recognition:", error);
            statusDiv.textContent = 'Status: Could not start recording. Check permissions/browser.';
            resetButton();
            pageBody.classList.remove('pulsating'); // Stop pulse on error
        }
    }
});

function resetButton() {
     isRecording = false;
     recordButton.textContent = 'Start Recording';
     recordButton.classList.remove('recording');
     // No need to control pulse here, onend or error handlers do it
}

async function sendToN8n(text) {
    if (!N8N_WEBHOOK_URL) { // Should not happen with URL hardcoded
        statusDiv.textContent = 'Status: n8n URL missing.';
        pageBody.classList.remove('pulsating'); // Stop pulse if error
        return;
    }
    agentResponseDiv.textContent = 'Sending to agent...';
    // Pulse may already be active from recording, but ensure it is for processing/playback
    pageBody.classList.add('pulsating');

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send the dynamically generated session ID
            body: JSON.stringify({
                 inputText: text,
                 sessionId: currentSessionId // Use the unique ID for this page load
                 }),
        });

        if (!response.ok) {
             // Try to get error details from n8n if possible
             let errorDetails = `HTTP error! status: ${response.status}`;
             try {
                  const errorJson = await response.json();
                  errorDetails += ` - ${errorJson.message || JSON.stringify(errorJson)}`;
             } catch (e) {
                  // Ignore if response body is not JSON
             }
            pageBody.classList.remove('pulsating'); // Stop pulse on error
            throw new Error(errorDetails);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('audio/mpeg')) {
            statusDiv.textContent = 'Status: Received audio response.';
            agentResponseDiv.textContent = 'Playing agent response...';
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // Ensure pulse is active before playing
            pageBody.classList.add('pulsating');

            // Play audio and update status when finished
            audio.play()
              .then(() => {
                  statusDiv.textContent = 'Status: Playing agent response...'; // Keep this until audio ends
                  console.log("Audio playback started");
                  // Event listener for when audio finishes playing
                  audio.onended = () => {
                       statusDiv.textContent = 'Status: Agent response finished. Ready.';
                       console.log("Audio playback finished");
                       pageBody.classList.remove('pulsating'); // Stop pulsing when audio ends
                  };
              })
              .catch(e => {
                  console.error("Error playing audio:", e);
                  statusDiv.textContent = 'Status: Error playing audio. Ready.';
                  agentResponseDiv.textContent = 'Could not play audio automatically (Check console for details).';
                  pageBody.classList.remove('pulsating'); // Stop pulsing on playback error
              });

        } else {
             // Handle cases where n8n might send back text instead of audio
             const responseText = await response.text();
             statusDiv.textContent = 'Status: Research plan received. Ready.';
             researchPlanDiv.textContent = responseText;
             console.warn("Received non-audio response:", responseText);
             pageBody.classList.remove('pulsating'); // Stop pulsing if no audio
        }

    } catch (error) {
        console.error('Error sending/receiving from n8n:', error);
        statusDiv.textContent = `Status: Error communicating with agent. Ready.`;
        agentResponseDiv.textContent = `Error: ${error.message}`;
        pageBody.classList.remove('pulsating'); // Stop pulsing on network/fetch error
    }
}