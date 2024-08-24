const audioPlayer = document.getElementById('audioPlayer');
const audioPlayer2 = document.getElementById('audioPlayer2');
const intervalInput = document.getElementById('intervalInput');
const timerDisplay = document.getElementById('timer');
const youtubeLinkInput = document.getElementById('youtubeLink');
const youtubeOverlay = document.getElementById('youtubeOverlay');
const customAudiosList = document.getElementById('customAudiosList');
const textToSpeechAudio = document.getElementById('audio-output');
let interval = parseInt(localStorage.getItem('interval')) || 120000;
let timeoutId;
let countdownInterval;
let remainingTime = parseInt(localStorage.getItem('remainingTime')) || interval;
let youtubePlayer;
let overlayTimeoutId;
let isAudio2Playing = false;
let customAudios = [];
let db;
let isTextToSpeechPlaying = false;
let youtubeAPIReady = false;
let youtubeAPIRetryCount = 0;
const MAX_RETRY_COUNT = 5;





let recentVideos = [];
const MAX_RECENT_VIDEOS = 20;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
        loadRecentVideos();
    }
}


function initYouTubeAPI() {
    gapi.client.init({
        'apiKey': window.ENV.GOOGLE_API_KEY,
        'discoveryDocs': ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest'],
    }).then(function() {
        console.log('YouTube API initialized');
        youtubeAPIReady = true;
        initYouTubePlayer();
        loadRecentVideos();
    }, function(error) {
        console.error('Error initializing YouTube API', error);
        retryYouTubeAPIInit();
    });
}

function retryYouTubeAPIInit() {
    if (youtubeAPIRetryCount < MAX_RETRY_COUNT) {
        youtubeAPIRetryCount++;
        console.log(`Retrying YouTube API initialization (attempt ${youtubeAPIRetryCount})`);
        setTimeout(initYouTubeAPI, 2000);
    } else {
        console.error('Failed to initialize YouTube API after multiple attempts');
    }
}

function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function onYouTubeIframeAPIReady() {
    youtubeAPIReady = true;
    initYouTubePlayer();
}

function loadRecentVideos() {
    if (!db || !db.objectStoreNames.contains('recentVideos')) {
        console.error("Banco de dados ou objeto de armazenamento 'recentVideos' não encontrado");
        return;
    }

    const videoList = document.getElementById('videoList');
    videoList.innerHTML = '';

    const transaction = db.transaction(['recentVideos'], 'readonly');
    const objectStore = transaction.objectStore('recentVideos');
    const request = objectStore.getAll();

    request.onsuccess = function(event) {
        let recentVideos = event.target.result;
        console.log("Vídeos recentes carregados:", recentVideos);

        if (recentVideos.length === 0) {
            console.log("Nenhum vídeo recente encontrado");
            return;
        }

        recentVideos.sort((a, b) => b.timestamp - a.timestamp);

        recentVideos.slice(0, MAX_RECENT_VIDEOS).forEach(video => {
            const videoItem = document.createElement('div');
            videoItem.className = 'video-item';
            videoItem.innerHTML = `
                <img src="https://img.youtube.com/vi/${video.videoId}/default.jpg" class="video-thumbnail" alt="Thumbnail">
                <div class="video-title">${video.title}</div>
            `;
            videoItem.onclick = function() {
                loadVideoById(video.videoId);
                addToRecentVideos(video.videoId);
                toggleSidebar();
            };
            videoList.appendChild(videoItem);
        });

        console.log("Lista de vídeos recentes atualizada");
    };

    request.onerror = function(event) {
        console.error("Erro ao carregar vídeos recentes:", event.target.error);
    };
}

function addToRecentVideos(videoId) {
    if (!db) {
        console.error("Banco de dados não inicializado");
        return;
    }

    gapi.client.youtube.videos.list({
        part: 'snippet',
        id: videoId
    }).then(function(response) {
        const videoData = response.result.items[0];
        if (videoData) {
            const video = {
                videoId: videoId,
                title: videoData.snippet.title,
                timestamp: Date.now()
            };

            const transaction = db.transaction(['recentVideos'], 'readwrite');
            const objectStore = transaction.objectStore('recentVideos');
            const request = objectStore.put(video);

            request.onsuccess = function(event) {
                console.log("Vídeo adicionado/atualizado nos recentes:", videoId);
                loadRecentVideos();
            };

            request.onerror = function(event) {
                console.error("Erro ao adicionar/atualizar vídeo recente:", event.target.error);
            };
        }
    }, function(err) {
        console.error("Erro ao obter detalhes do vídeo", err);
    });
}

function initIndexedDB() {
    const dbName = 'CustomAudiosDB';
    const dbVersion = 3;
    const request = indexedDB.open(dbName, dbVersion);

    request.onerror = function (event) {
        console.error("Erro ao abrir o banco de dados:", event.target.error);
    };

    request.onsuccess = function (event) {
        db = event.target.result;
        console.log("Banco de dados aberto com sucesso");
        loadCustomAudios();
        loadSavedTexts();
        loadRecentVideos();
    };

    request.onupgradeneeded = function (event) {
        db = event.target.result;
        console.log("Atualizando banco de dados para versão", dbVersion);

        if (!db.objectStoreNames.contains('customAudios')) {
            db.createObjectStore('customAudios', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('savedTexts')) {
            db.createObjectStore('savedTexts', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('recentVideos')) {
            const recentVideosStore = db.createObjectStore('recentVideos', { keyPath: 'videoId' });
            recentVideosStore.createIndex('timestamp', 'timestamp', { unique: false });
            console.log("Objeto de armazenamento 'recentVideos' criado");
        }
    };
}

function saveCustomAudio() {
    const title = document.getElementById('customAudioTitle').value;
    const fileInput = document.getElementById('customAudioFile');
    const file = fileInput.files[0];

    if (!title || !file) {
        alert('Por favor, preencha o título e selecione um arquivo de áudio.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const audioData = e.target.result;
        const transaction = db.transaction(['customAudios'], 'readwrite');
        const objectStore = transaction.objectStore('customAudios');
        const request = objectStore.add({ title: title, audioData: audioData });

        request.onsuccess = function (event) {
            alert('Áudio personalizado salvo com sucesso!');
            document.getElementById('customAudioTitle').value = '';
            fileInput.value = '';
            loadCustomAudios();
        };

        request.onerror = function (event) {
            console.error("Erro ao salvar o áudio personalizado:", event.target.error);
        };
    };
    reader.readAsDataURL(file);
}

function loadCustomAudios() {
    const transaction = db.transaction(['customAudios'], 'readonly');
    const objectStore = transaction.objectStore('customAudios');
    const request = objectStore.getAll();

    request.onsuccess = function (event) {
        customAudios = event.target.result;
        displayCustomAudios();
    };

    request.onerror = function (event) {
        console.error("Erro ao carregar áudios personalizados:", event.target.error);
    };
}

function displayCustomAudios() {
    customAudiosList.innerHTML = '';
    customAudios.forEach((audio, index) => {
        const audioBox = document.createElement('div');
        audioBox.className = 'custom-audio-box';
        audioBox.innerHTML = `
            <div class="custom-audio-title">${audio.title}</div>
            <audio controls>
                <source src="${audio.audioData}" type="audio/mpeg">
                Seu navegador não suporta o elemento de áudio.
            </audio>
            <div class="custom-audio-controls">
                <button class="delete-audio" onclick="deleteCustomAudio(${audio.id})">Excluir</button>
            </div>
        `;
        const audioElement = audioBox.querySelector('audio');
        audioElement.addEventListener('play', () => {
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(5);
            }
        });
        audioElement.addEventListener('pause', () => {
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(100);
            }
        });
        audioElement.addEventListener('ended', () => {
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(100);
            }
        });
        customAudiosList.appendChild(audioBox);
    });
}

function deleteCustomAudio(id) {
    const transaction = db.transaction(['customAudios'], 'readwrite');
    const objectStore = transaction.objectStore('customAudios');
    const request = objectStore.delete(id);

    request.onsuccess = function (event) {
        alert('Áudio personalizado excluído com sucesso!');
        loadCustomAudios();
    };

    request.onerror = function (event) {
        console.error("Erro ao excluir o áudio personalizado:", event.target.error);
    };
}

function initYouTubePlayer() {
    const savedVideoId = localStorage.getItem('youtubeVideoId');
    if (savedVideoId) {
        createOrLoadYouTubePlayer(savedVideoId);
        youtubeLinkInput.value = `https://www.youtube.com/watch?v=${savedVideoId}`;
    }
}

function saveState() {
    localStorage.setItem('interval', interval);
    localStorage.setItem('remainingTime', remainingTime);
    localStorage.setItem('intervalInputValue', intervalInput.value);
    if (youtubePlayer && youtubePlayer.getVideoData) {
        const videoData = youtubePlayer.getVideoData();
        if (videoData && videoData.video_id) {
            localStorage.setItem('youtubeVideoId', videoData.video_id);
        }
    }
}

function updateInterval() {
    const minutes = parseInt(intervalInput.value);
    if (minutes > 0) {
        interval = minutes * 60000;
        remainingTime = interval;
        saveState();
        resetTimeout();
    }
}

function playAudio() {
    if (isTextToSpeechPlaying) {
        remainingTime = 60000; // 1 minuto de atraso
        updateTimerDisplay(remainingTime);
        timeoutId = setTimeout(() => {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(20);
            }
        }, 60000);
    } else if (isAudio2Playing) {
        remainingTime = 60000; // 1 minuto de atraso
        updateTimerDisplay(remainingTime);
        timeoutId = setTimeout(() => {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(20);
            }
        }, 60000);
    } else {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
            youtubePlayer.setVolume(20);
        }
    }
}

function resetTimeout() {
    clearTimeout(timeoutId);
    clearInterval(countdownInterval);
    timeoutId = setTimeout(playAudio, remainingTime);
    startCountdown();
}

function startCountdown() {
    updateTimerDisplay(remainingTime);
    countdownInterval = setInterval(() => {
        remainingTime -= 1000;
        if (remainingTime < 0) {
            clearInterval(countdownInterval);
            remainingTime = interval;
            resetTimeout();
        } else {
            updateTimerDisplay(remainingTime);
        }
        saveState();
    }, 1000);
}

function updateTimerDisplay(time) {
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function loadYouTubeVideo() {
    const youtubeUrl = youtubeLinkInput.value;
    const videoId = extractVideoId(youtubeUrl);
    if (videoId) {
        createOrLoadYouTubePlayer(videoId);
        localStorage.setItem('youtubeVideoId', videoId);
        addToRecentVideos(videoId);
    } else {
        showError('URL do YouTube inválida');
    }
}


function createOrLoadYouTubePlayer(videoId) {
    if (youtubePlayer) {
        youtubePlayer.loadVideoById(videoId);
    } else {
        createYouTubePlayer(videoId);
    }
}

function loadVideoById(videoId) {
    if (youtubePlayer) {
        youtubePlayer.loadVideoById(videoId);
    } else {
        createYouTubePlayer(videoId);
    }
    localStorage.setItem('youtubeVideoId', videoId);
    addToRecentVideos(videoId);
}

function createYouTubePlayer(videoId) {
    if (youtubePlayer) {
        youtubePlayer.destroy();
    }
    youtubePlayer = new YT.Player('youtubePlayer', {
        height: '315',
        width: '100%',
        videoId: videoId,
        events: {
            'onReady': onYouTubePlayerReady,
            'onError': onYouTubePlayerError,
            'onStateChange': onYouTubePlayerStateChange
        }
    });
}

function onYouTubePlayerReady(event) {
    event.target.playVideo();
    hideError();
    startOverlayTimer();
}

function onYouTubePlayerError(event) {
    showError('Erro ao carregar o vídeo do YouTube. Código de erro: ' + event.data);
}

function onYouTubePlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING && audioPlayer.paused && !isAudio2Playing && !isTextToSpeechPlaying) {
        youtubePlayer.setVolume(100);
    }
}

function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
}

function hideError() {
    document.getElementById('errorMessage').textContent = '';
}

function clearLinkField() {
    youtubeLinkInput.value = '';
}

function startOverlayTimer() {
    clearTimeout(overlayTimeoutId);
    youtubeOverlay.style.display = 'none';
    overlayTimeoutId = setTimeout(() => {
        youtubeOverlay.style.display = 'flex';
    }, 3000);
}

audioPlayer.addEventListener('play', () => {
    resetTimeout();
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(20);
    }
});

audioPlayer.addEventListener('pause', () => {
    saveState();
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});

audioPlayer.addEventListener('ended', () => {
    remainingTime = interval;
    resetTimeout();
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});

audioPlayer2.addEventListener('play', () => {
    isAudio2Playing = true;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(20);
    }
});

audioPlayer2.addEventListener('pause', () => {
    isAudio2Playing = false;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});

audioPlayer2.addEventListener('ended', () => {
    isAudio2Playing = false;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});

document.getElementById('youtubePlayer').addEventListener('mousemove', startOverlayTimer);
document.getElementById('youtubePlayer').addEventListener('mouseleave', startOverlayTimer);

// Carregar o valor salvo do intervalo
const savedIntervalInputValue = localStorage.getItem('intervalInputValue');
if (savedIntervalInputValue) {
    intervalInput.value = savedIntervalInputValue;
    interval = parseInt(savedIntervalInputValue) * 60000;
}

resetTimeout();

setInterval(saveState, 1000);

window.addEventListener('load', () => {
    loadYouTubeAPI();
    initIndexedDB();
    initYouTubePlayer(); // Adicione esta linha
});

async function textToSpeech() {
    const apiKey = 'AIzaSyD1KBlpAV71woravSlYcbimE5Sk7q8b8Bw'
    const text = document.getElementById('text-input').value;
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    const data = {
        input: { text: text },
        voice: { languageCode: 'pt-BR', name: 'pt-BR-Wavenet-D', ssmlGender: 'FEMALE' },
        audioConfig: { audioEncoding: 'MP3' }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        const audioContent = result.audioContent;

        if (audioContent) {
            const audio = document.getElementById('audio-output');
            audio.src = `data:audio/mp3;base64,${audioContent}`;
            audio.play();
            isTextToSpeechPlaying = true;
            if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.setVolume(20);
            }
            audio.addEventListener('ended', () => {
                isTextToSpeechPlaying = false;
                if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                    youtubePlayer.setVolume(100);
                }
            });
        } else {
            alert('Erro ao gerar o áudio.');
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

function saveText() {
    const text = document.getElementById('text-input').value;
    if (text.trim() === '') {
        alert('Por favor, digite um texto antes de salvar.');
        return;
    }

    const transaction = db.transaction(['savedTexts'], 'readwrite');
    const objectStore = transaction.objectStore('savedTexts');
    const request = objectStore.add({ text: text });

    request.onsuccess = function (event) {
        alert('Texto salvo com sucesso!');
        loadSavedTexts();
    };

    request.onerror = function (event) {
        console.error("Erro ao salvar o texto:", event.target.error);
    };
}

function loadSavedTexts() {
    const transaction = db.transaction(['savedTexts'], 'readonly');
    const objectStore = transaction.objectStore('savedTexts');
    const request = objectStore.getAll();

    request.onsuccess = function (event) {
        const savedTexts = event.target.result;
        displaySavedTexts(savedTexts);
    };

    request.onerror = function (event) {
        console.error("Erro ao carregar textos salvos:", event.target.error);
    };
}

function displaySavedTexts(savedTexts) {
    const savedTextsList = document.getElementById('savedTextsList');
    savedTextsList.innerHTML = '';
    savedTexts.forEach((text) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${text.text.substring(0, 50) + (text.text.length > 50 ? '...' : '')}</span>
            <button class="delete-text" onclick="deleteSavedText(${text.id})">
                <img src="imagens/lixo.ico" alt="Lixeira" style="width: 20px; height: 20px;">
            </button>
        `;
        li.querySelector('span').onclick = function () {
            document.getElementById('text-input').value = text.text;
        };
        savedTextsList.appendChild(li);
    });
}

function deleteSavedText(id) {
    const transaction = db.transaction(['savedTexts'], 'readwrite');
    const objectStore = transaction.objectStore('savedTexts');
    const request = objectStore.delete(id);

    request.onsuccess = function (event) {
        alert('Texto excluído com sucesso!');
        loadSavedTexts();
    };

    request.onerror = function (event) {
        console.error("Erro ao excluir o texto:", event.target.error);
    };
}

function toggleSavedTexts() {
    const savedTextsSection = document.getElementById('savedTextsSection');
    if (savedTextsSection.style.display === 'none') {
        savedTextsSection.style.display = 'block';
        loadSavedTexts();
    } else {
        savedTextsSection.style.display = 'none';
    }
}



textToSpeechAudio.addEventListener('play', () => {
    isTextToSpeechPlaying = true;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(20);
    }
});

textToSpeechAudio.addEventListener('pause', () => {
    isTextToSpeechPlaying = false;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});

textToSpeechAudio.addEventListener('ended', () => {
    isTextToSpeechPlaying = false;
    if (youtubePlayer && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.setVolume(100);
    }
});