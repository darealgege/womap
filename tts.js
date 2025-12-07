// tts.js

var ttsVoices = [];
var ttsSelectedVoice = null;

// Function to retrieve the user's locale
function getLocale() {
    return navigator.language || navigator.userLanguage || 'en-US';
}

// Function to populate the TTS voice dropdown
function populateVoiceOptions(targetLang = null) {
    const voiceSelect = document.getElementById('ttsSelect');
    if (!voiceSelect) {
        console.error("Element with id 'ttsSelect' not found.");
        return;
    }

    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';

    ttsVoices = voices;

    // Use provided targetLang or global currentLanguage (from translations.js) or fallback to navigator
    let locale = targetLang || (typeof currentLanguage !== 'undefined' ? currentLanguage : getLocale());
    locale = locale.toLowerCase();

    // Special handling for generic 'en' to prefer 'en-US'
    let preferredLocale = locale;
    if (locale === 'en') {
        preferredLocale = 'en-us';
    }

    let filteredVoices = [];

    // Filter voices by language (broad match)
    ttsVoices.forEach((voice, index) => {
        if (voice.lang.toLowerCase().startsWith(locale)) {
            filteredVoices.push({ voice: voice, index: index });
        }
    });

    // If no voices found for this language, fallback to all
    if (filteredVoices.length === 0) {
        console.warn(`No voices found for ${locale}, showing all.`);
        filteredVoices = ttsVoices.map((v, i) => ({ voice: v, index: i }));
    }

    // Determine which voice to select by default
    let selectedIndexToSet = -1;

    // Check for stored preference
    const storedVoiceName = localStorage.getItem('womap_tts_voice');
    let storedVoiceMatch = null;

    if (storedVoiceName) {
        storedVoiceMatch = filteredVoices.find(item => item.voice.name === storedVoiceName);
    }

    // 1. Try stored voice match
    if (storedVoiceMatch) {
        selectedIndexToSet = storedVoiceMatch.index;
        ttsSelectedVoice = storedVoiceMatch.voice;
    } else {
        // 2. Try exact match with preferredLocale (e.g. en-us)
        let bestMatch = filteredVoices.find(item => item.voice.lang.toLowerCase() === preferredLocale);

        // 3. If not found, try exact match with original locale (e.g. en)
        if (!bestMatch && locale !== preferredLocale) {
            bestMatch = filteredVoices.find(item => item.voice.lang.toLowerCase() === locale);
        }

        // 4. If still not found and locale is 'en', try to find one that contains 'us' (e.g. en_US)
        if (!bestMatch && locale === 'en') {
            bestMatch = filteredVoices.find(item => item.voice.lang.toLowerCase().includes('us'));
        }

        // 5. Fallback to the first one
        if (!bestMatch && filteredVoices.length > 0) {
            bestMatch = filteredVoices[0];
        }

        if (bestMatch) {
            selectedIndexToSet = bestMatch.index;
            ttsSelectedVoice = bestMatch.voice;
        }
    }

    filteredVoices.forEach(item => {
        const voice = item.voice;
        const index = item.index;

        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;

        if (index === selectedIndexToSet) {
            option.selected = true;
        }

        voiceSelect.appendChild(option);
    });

    // Ensure ttsSelectedVoice is set even if we didn't find a "best" match (fallback to first in list if logic failed)
    if (!ttsSelectedVoice && filteredVoices.length > 0) {
        ttsSelectedVoice = filteredVoices[0].voice;
        voiceSelect.value = filteredVoices[0].index;
    }
}

// Function to initialize TTS voices with robust handling
function initializeVoices(retries = 10, delay = 100) {
    if (!('speechSynthesis' in window)) {
        // alert('A böngésző nem támogatja a szövegfelolvasást.');
        return;
    }

    // Initial attempt to populate voices
    populateVoiceOptions();

    // If voices are not loaded, set up event listener
    if (ttsVoices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
            populateVoiceOptions();
        };
    }

    // Retry mechanism
    const voiceLoadingInterval = setInterval(() => {
        if (ttsVoices.length > 0) {
            clearInterval(voiceLoadingInterval);
            return;
        }

        populateVoiceOptions();
        retries--;

        if (retries <= 0) {
            clearInterval(voiceLoadingInterval);
            console.warn('Failed to load TTS voices.');
        }
    }, delay);
}

// ... speakText function remains same ...

// Event listener for TTS voice selection
document.addEventListener('DOMContentLoaded', () => {
    const voiceSelect = document.getElementById('ttsSelect');
    if (!voiceSelect) return;

    voiceSelect.addEventListener('change', function () {
        const selectedIndex = parseInt(this.value, 10);
        if (ttsVoices[selectedIndex]) {
            ttsSelectedVoice = ttsVoices[selectedIndex];
        }
    });

    // Listen for language changes
    document.addEventListener('languageChanged', function (e) {
        populateVoiceOptions(e.detail.language);
    });

    // Initialize voices
    initializeVoices();
});

// Function to speak a text
// Function to speak a text with priority handling
// priority: 'high' (Navigation) or 'low' (POI)
// forceQueue: if true, will NOT cancel current speech even if priority is high (appends to browser queue)
function speakText(text, priority = 'normal', forceQueue = false) {
    if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported.');
        // alert('A böngésző nem támogatja a szövegfelolvasást.'); // Don't spam alerts
        return;
    }

    if (!ttsSelectedVoice) {
        console.warn('No TTS voice selected.');
        return;
    }

    // High priority (Navigation): Interrupt everything UNLESS forceQueue is true
    if (priority === 'high' && !forceQueue) {
        window.speechSynthesis.cancel();
    }
    // Medium priority: Queue if something is speaking, otherwise speak immediately
    else if (priority === 'medium') {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            console.log('Medium priority TTS queued (busy):', text);
            forceQueue = true; // Queue it instead of skipping
        }
    }
    // Low priority (POI): If something is already speaking or queued, SKIP this to prevent backlog
    else if (priority === 'low') {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            console.log('Skipping low priority TTS (busy):', text);
            return;
        }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = ttsSelectedVoice;
    utterance.lang = ttsSelectedVoice.lang;

    // Error handling
    utterance.onerror = function (event) {
        if (event.error === 'interrupted' || event.error === 'canceled') {
            // Expected behavior when cancelling speech, ignore
            return;
        }

        if (event.error === 'not-allowed') {
            console.warn('TTS blocked (autoplay policy). Waiting for user interaction...');
            // Retry on first interaction
            var retryHandler = function () {
                speakText(text, priority, forceQueue);
                document.removeEventListener('click', retryHandler);
                document.removeEventListener('touchstart', retryHandler);
                document.removeEventListener('keydown', retryHandler);
            };

            document.addEventListener('click', retryHandler);
            document.addEventListener('touchstart', retryHandler);
            document.addEventListener('keydown', retryHandler);
            return;
        }

        console.error('TTS Error:', event);
    };

    window.speechSynthesis.speak(utterance);
}
