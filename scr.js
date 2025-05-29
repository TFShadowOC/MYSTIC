// Elements n variables
const fileInput = document.getElementById("file-input");
const audioPlayer = document.getElementById("audio-player");
const playpauseBtn = document.getElementById("play-pause");
const nextBtn = document.getElementById("next");
const prevBtn = document.getElementById("prev");
const songTitle = document.getElementById("song-title");
const progressBar = document.getElementById("progress-bar");
const toggleRepeat = document.getElementById("toggle-repeat");
const repeatIcon = document.getElementById("repeat-icon");
const repeatNumber = document.getElementById("repeat-number");
const toggleShuffle = document.getElementById("toggle-shuffle"); // Renombrado de shuffleBtn
const shuffleIcon = document.getElementById("shuffle-icon");
const currentTimeDisplay = document.getElementById("current-time");
const totalDurationDisplay = document.getElementById("total-duration");
const albumArt = document.getElementById("album-art");
const blurBackground = document.getElementById("blur-background");
const colorThief = new ColorThief();
const playerContainer = document.querySelector(".player-container");
const songArtist = document.getElementById("song-artist");
const volumeSlider = document.createElement('input');
const supportedFormats = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/flac", "audio/aac"];
const songListBody = document.querySelector("#song-list-body");
const lyricsOverlay = document.getElementById("lyrics-overlay");
const lyricsIcon = document.getElementById("lyrics-icon");
const lyricsBtn = document.getElementById("turn-lyrics");
const closeLyricsBtn = document.getElementById("close-lyrics");

lucide.createIcons(); 

playerContainer.classList.add("loading");
setTimeout(() => playerContainer.classList.remove("loading"), 500);

let songList = [];
let currentSongIndex = 0;
let previousUrl = null;
let repeatMode = 0; // 0: off, 1: repeat all, 2: repeat one
let shuffleMode = false; // Renombrado de 'shuffle' a 'shuffleMode'
let playedSongIndexes = []; // Para evitar repetición inmediata en shuffle
let secondaryDominantColor = null;

localStorage.setItem("lastIndex", currentSongIndex);

const savedIndex = localStorage.getItem("lastIndex");
if (savedIndex !== null) currentSongIndex = parseInt(savedIndex);

// Default placeholder for album art
albumArt.src = "https://placehold.co/200x200?text=No+Cover";

albumArt.onerror = function () {
  console.warn("Error loading album art");
  this.src = "https://placehold.co/200x200?text=No+Cover";
  this.style.backgroundColor = "#333";
};

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Load multiple songs
fileInput.addEventListener("change", function () {
  const files = Array.from(this.files).filter(file => supportedFormats.includes(file.type));
  if (files.length === 0) {
    alert("No compatible audio files found");
    return;
  }

  songList = files.map(file => ({
    file: file,
    name: file.name.replace(/\.[^/._]+$/, ""),
    title: null,
    artist: null,
    album: null,
    duration: null,
    durationFormatted: null
  }));

  currentSongIndex = 0;
  loadSong(currentSongIndex);
  processMetadataForAllSongs();
});

// Load song
function loadSong(index) {
  if (songList.length === 0) return;

  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  updateSongList();

  const song = songList[index];
  const newUrl = URL.createObjectURL(song.file);
  previousUrl = newUrl;

  audioPlayer.src = newUrl;
  songTitle.textContent = song.name;
  audioPlayer.load();
  audioPlayer.play();
  updateIcons(true);

  // Reset image before loading new one
  albumArt.style.opacity = 0;
  albumArt.src = "https://placehold.co/200x200?text=Loading...";
  
  window.jsmediatags.read(song.file, {
    onSuccess: function (tag) {
      console.log("Tags:", tag.tags);
      console.log("Picture:", tag.tags.picture);
      // Update song title and artist
      if (tag.tags.title) {
        songTitle.textContent = tag.tags.title || song.name;
      }
      if (tag.tags.artist) {
        songArtist.textContent = tag.tags.artist;
      } else {
        songArtist.textContent = "";
      }

      if (tag.tags.lyrics && tag.tags.lyrics.text) {
      showLyrics(tag.tags.lyrics.text);
      } else {
      fetchLyricsFromLibraries(song);
      } 

      // Process album art
      if (tag.tags.picture) {
        const picture = tag.tags.picture;
        const base64String = arrayBufferToBase64(picture.data);
        const imageUri = `data:${picture.format};base64,${base64String}`;
        
        // Create a temporary image to extract the color
        const tempImage = new Image();
        tempImage.crossOrigin = "Anonymous";
        
        tempImage.onload = function() {
          // Asign load image to album art
          albumArt.src = imageUri;
          
          // Aply blur background
          blurBackground.style.backgroundImage = `url(${imageUri})`;
          
          // Extract dominant color after a short delay
          setTimeout(() => {
            try {
              //  Wait for the image to load
              if (tempImage.complete) {
                const dominantColor = colorThief.getColor(tempImage);
                applyThemecolor(dominantColor);
              }
            } catch (err) {
              console.error("Error extracting color:", err);
              // Fallback color
              document.documentElement.style.setProperty("--theme-color", "74, 144, 226");
            }
            // Show the album art after the background is set
            albumArt.style.opacity = 1;
          }, 100);
        };
        
        tempImage.onerror = function() {
          console.error("Error loading temporary image");
          albumArt.src = "https://placehold.co/200x200?text=No+Cover";
          albumArt.style.opacity = 1;
        };
        
        // Set the source of the temporary image
        tempImage.src = imageUri;
        
      } else {
        // There's no picture, set a default image
        albumArt.src = "https://placehold.co/200x200?text=No+Cover";
        albumArt.style.opacity = 1;
        blurBackground.style.backgroundImage = "none";
        document.documentElement.style.setProperty("--theme-color", "74, 144, 226");
      }
    },
    onError: function (error) {
      console.error("Error reading metadata:", error);
      albumArt.src = "https://placehold.co/200x200?text=No+Cover";
      albumArt.style.opacity = 1;
      blurBackground.style.backgroundImage = "none";
      document.documentElement.style.setProperty("--theme-color", "74, 144, 226");
    }
  });
}

// Aply theme color
function applyThemecolor(rgbArray) {
  if (!rgbArray || !Array.isArray(rgbArray) || rgbArray.length < 3) {
    console.error("Invalid RGB array:", rgbArray);
    rgbArray = [74, 144, 226]; // Default color
  }
  
  const [r, g, b] = rgbArray;
  const themeColor = `${r}, ${g}, ${b}`;
  document.documentElement.style.setProperty("--theme-color", themeColor);
}

// Play/Pause
function updateIcons(isPlaying) {
  const icon = document.querySelector(".play-icon");
  if (!icon) return;

  icon.setAttribute("data-lucide", isPlaying ? "pause" : "play");
  lucide.createIcons();
}

playpauseBtn.addEventListener("click", function () {
  if (audioPlayer.paused) {
    audioPlayer.play();
    updateIcons(true);
  } else {
    audioPlayer.pause();
    updateIcons(false);
  }
});

// Bar progress n time
audioPlayer.addEventListener("timeupdate", () => {
  if (!isNaN(audioPlayer.duration)) {
    progressBar.max = audioPlayer.duration;
    progressBar.value = audioPlayer.currentTime;
    currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
    totalDurationDisplay.textContent = formatTime(audioPlayer.duration);
  }
});

progressBar.addEventListener("input", () => {
  audioPlayer.currentTime = progressBar.value;
});

audioPlayer.addEventListener("loadedmetadata", () => {
  progressBar.max = audioPlayer.duration;
  totalDurationDisplay.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener("play", () => updateIcons(true));
audioPlayer.addEventListener("pause", () => updateIcons(false));

// Volume Control


// Next n previous song
nextBtn.addEventListener("click", () => {
  if (songList.length === 0) return;
  // Si está en modo shuffle, el botón de siguiente también debería ir a una canción aleatoria
  if (shuffleMode) {
      playRandomSong();
  } else {
      currentSongIndex = (currentSongIndex + 1) % songList.length;
      loadSong(currentSongIndex);
  }
});

prevBtn.addEventListener("click", () => {
  if (songList.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
  loadSong(currentSongIndex);
});

// Toggle repeat n shuffle
toggleRepeat.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  updateToggleRepeat();
});

toggleShuffle.addEventListener("click", () => {
    shuffleMode = !shuffleMode; // Invierte el estado de shuffleMode
    updateToggleShuffle(); 
    // Opcional: Si el modo shuffle se activa o desactiva, limpiar el historial
    playedSongIndexes = []; 
});


function updateToggleRepeat() {
   switch (repeatMode) {
    case 0: // Repeat Off
      repeatIcon.classList.add("bi-repeat"); 
      repeatIcon.classList.remove("bi-repeat-1"); 
      toggleRepeat.style.opacity = 0.5;
      repeatNumber.style.animation = "fadeZoomOut 0.8s forwards";
      setTimeout(() => repeatNumber.style.display = "none", 300);
      break;
    case 1: // Repeat All
      repeatIcon.classList.add("bi-repeat");
      repeatIcon.classList.remove("bi-repeat-1"); 
      toggleRepeat.style.opacity = 1;
      repeatNumber.style.animation = "fadeZoomOut 0.8s forwards";
      setTimeout(() => repeatNumber.style.display = "none", 300);
      break;
    case 2: // Repeat One
      repeatIcon.classList.remove("bi-repeat");
      repeatIcon.classList.add("bi-repeat-1"); 
      toggleRepeat.style.opacity = 1;
      repeatNumber.style.display = "flex";
      repeatNumber.style.animation = "fadeZoomIn 0.8s forwards"; // Asegúrate de tener esta animación en CSS
      break;
  }
}

audioPlayer.addEventListener("ended", handleTrackEnd);

function updateToggleShuffle() {
    if (shuffleMode) {
        toggleShuffle.style.opacity = 1; // Botón resaltado si está activo
        // Si tienes un ícono de Lucide para "shuffle" que cambia con el estado, puedes hacerlo aquí
        shuffleIcon.setAttribute("data-lucide", "shuffle"); // Asegúrate de que este es el ícono deseado para activo
    } else {
        toggleShuffle.style.opacity = 0.5; // Botón atenuado si está inactivo
        shuffleIcon.setAttribute("data-lucide", "shuffle"); // Asegúrate de que este es el ícono deseado para inactivo
    }
    lucide.createIcons(); // Vuelve a renderizar el ícono de Lucide para shuffle
}


function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function handleTrackEnd() {
  if (repeatMode === 2) {
    repeatCurrentSong();
  } else if (shuffleMode) { // Usa shuffleMode
    playRandomSong();
  } else if (hasNextSong()) {
    playNextSong();
  } else if (repeatMode === 1) {
    playFirstSong();
  } else {
    stopPlayback();
  }
}

function repeatCurrentSong() {
  setTimeout(() => {
    audioPlayer.currentTime = 0;
    audioPlayer.play();
  }, 100);
}

function playNextSong() {
  currentSongIndex++;
  loadSong(currentSongIndex);
}

function playRandomSong() {
  if (songList.length === 0) return;

  let nextIndex;
  // Si solo hay una canción, no hay necesidad de shuffle
  if (songList.length <= 1) {
    nextIndex = 0;
  } else {
    // Asegura que la siguiente canción aleatoria no sea la misma que la actual
    // y que intentemos no repetir canciones inmediatamente.
    do {
      nextIndex = Math.floor(Math.random() * songList.length);
    } while (nextIndex === currentSongIndex || playedSongIndexes.includes(nextIndex));

    // Añadir la canción actual al historial
    playedSongIndexes.push(currentSongIndex);

    // Mantener el historial limitado (por ejemplo, a la mitad de la lista o 50% de las canciones)
    // para evitar que se haga demasiado grande y para permitir que las canciones se repitan eventualmente.
    if (playedSongIndexes.length > Math.floor(songList.length / 2) && songList.length > 2) {
        // Eliminar las canciones más antiguas del historial
        playedSongIndexes.shift(); 
    } else if (playedSongIndexes.length > songList.length - 1) { // Si ya hemos reproducido casi todas las canciones
        playedSongIndexes = []; // Reiniciar el historial completamente
    }
  }

  currentSongIndex = nextIndex;
  loadSong(currentSongIndex);
}

function hasNextSong() {
  return currentSongIndex < songList.length - 1;
}

function playFirstSong() {
  currentSongIndex = 0;
  loadSong(currentSongIndex);
}

function stopPlayback() {
  audioPlayer.pause();
  updateIcons(false);
}

// Song List
function updateSongList() {
  songListBody.innerHTML = ""; // Clear existing rows

  songList.forEach((song, index) => {
    const tr = document.createElement("tr");
  
    tr.addEventListener("click", () => {
        currentSongIndex = index;
        loadSong(currentSongIndex);
    });

    if (index === currentSongIndex) {
        tr.classList.add("active");
    } else {
        tr.classList.remove("active");
    }

    // Number
    const tdIndex = document.createElement("td");
    tdIndex.textContent = index + 1;
    tr.appendChild(tdIndex);

    // Title and Artist combined
    const tdTitleArtist = document.createElement("td");
    const titleSpan = document.createElement("span");
    titleSpan.classList.add("list-song-title"); // Add a class for styling
    titleSpan.textContent = song.title || song.name || song.file.name;
    tdTitleArtist.appendChild(titleSpan);

    if (song.artist && song.artist !== "-") { // Only add artist if available
        const artistSpan = document.createElement("span");
        artistSpan.classList.add("list-song-artist"); // Add a class for styling
        artistSpan.textContent = song.artist;
        tdTitleArtist.appendChild(document.createElement("br")); // New line
        tdTitleArtist.appendChild(artistSpan);
    }
    tr.appendChild(tdTitleArtist);

    // Album
    const tdAlbum = document.createElement("td");
    tdAlbum.textContent = song.album || "-";
    tr.appendChild(tdAlbum);

    // Duration
    const tdDuration = document.createElement("td");
    tdDuration.textContent = song.durationFormatted || formatTime(song.duration);
    tr.appendChild(tdDuration);

    // Format
    const tdType = document.createElement("td");
    tdType.textContent = song.file.type.split("/")[1].toUpperCase();
    tr.appendChild(tdType);

    songListBody.appendChild(tr);
  });

  addTooltips();
}

function addTooltips() {
  const cells = document.querySelectorAll('#song-list td');
  cells.forEach(cell => {
    if (cell.scrollWidth > cell.clientWidth) {
      cell.title = cell.textContent;
    }
  });
}

function processMetadataForAllSongs() {
  songList.forEach((song, index) => {
  // Read metadata
  window.jsmediatags.read(song.file, {
    onSuccess: function(tag) {
      song.title = tag.tags.title || song.name;
      song.artist = tag.tags.artist || "-";
      song.album = tag.tags.album || "-";
    // Optional
    if (tag.tags.title) song.title = tag.tags.title;
    updateSongList();
  },
  onError: function(error) {
    song.artist = "-";
    song.album = "-";
    updateSongList();
  }
  });

  // Read duration
  const tempAudio = new Audio();
  tempAudio.src = URL.createObjectURL(song.file);
  tempAudio.addEventListener("loadedmetadata", () => {
    song.duration = tempAudio.duration;
    song.durationFormatted = formatTime(song.duration);
    updateSongList();
    URL.revokeObjectURL(tempAudio.src);
  });
  });
}

// Add tooltip for text 
function addTooltips() {
    const cells = document.querySelectorAll('#song-list td');
    cells.forEach(cell => {
        if (cell.scrollWidth > cell.clientWidth) {
            cell.title = cell.textContent;
        }
    });
}

// Detect device
function isMobileDevice() {
    return window.innerWidth <= 900 || 
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Apply specific setting 
function applyResponsiveBehavior() {
    const isMobile = isMobileDevice();
    const songListContainer = document.querySelector('.song-list-container');
    
    if (isMobile) {
        songListContainer.style.overflowX = 'auto';
    } else {
        songListContainer.style.overflowX = 'hidden';
    }
}

// Execute on load
window.addEventListener('load', applyResponsiveBehavior);
window.addEventListener('resize', applyResponsiveBehavior);

// Lyrics
function toggleLyrics() {
    const isVisible = lyricsOverlay.classList.contains("visible");

    if (isVisible) {
        hideLyrics();
    } else {
        showLyricsOverlay();
    }
}

function showLyricsOverlay() {
    lyricsOverlay.classList.add("visible");
    lyricsOverlay.style.opacity = "1";
    lyricsOverlay.style.pointerEvents = "auto";
    lyricsIcon.setAttribute("data-lucide", "mic");
    lucide.createIcons();
}

function hideLyrics() {
    lyricsOverlay.classList.remove("visible");
    lyricsOverlay.style.opacity = "0";
    lyricsOverlay.style.pointerEvents = "none";
    lyricsIcon.setAttribute("data-lucide", "mic-vocal");
    lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", () => {
    lyricsBtn.addEventListener("click", toggleLyrics);
    closeLyricsBtn.addEventListener("click", hideLyrics);
});

document.addEventListener("DOMContentLoaded", () => {
  lyricsBtn.addEventListener("click", () => {
    const isVisible = lyricsOverlay.style.opacity === "1";

    if (isVisible) {
      lyricsOverlay.style.opacity = "0";
      lyricsOverlay.style.pointerEvents = "none";
      lyricsOverlay.style.transform = "translateX(-50%) scale(0.95)";
      lyricsIcon.setAttribute("data-lucide", "mic-vocal");
    } else {
      lyricsOverlay.style.opacity = "1";
      lyricsOverlay.style.pointerEvents = "auto";
      lyricsOverlay.style.transform = "translateX(-50%) scale(1)";
      lyricsIcon.setAttribute("data-lucide", "mic");
    }

  function parseLRC(lrcText) {
    const lines = lrcText.split("\n");
    const lrc = [];

    for (const line of lines) {
        const match = line.match(/\[(\d{2}):(\d{2}(?:\.\d{2})?)\](.*)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseFloat(match[2]);
            const time = minutes * 60 + seconds;
            const text = match[3].trim();
            lrc.push({ time, text });
        }
    }
    return lrc;
}

function syncLyrics(lrcArray) {
    const lyricsText = document.getElementById("lyrics-text");
    
    audioPlayer.addEventListener("timeupdate", () => {
        const currentTime = audioPlayer.currentTime;
        const line = lrcArray.find((entry, i) =>
            currentTime >= entry.time && (!lrcArray[i + 1] || currentTime < lrcArray[i + 1].time)
        );
        
        if (line && line.text) {
            lyricsText.textContent = line.text;
            lyricsText.classList.add("active-line");
            setTimeout(() => lyricsText.classList.remove("active-line"), 300);
        }
    });
}

    lucide.createIcons(); // Re-render icons
  });
});

// Dynamically create the LRC file input and add it to the DOM
const lrcFileInput = document.createElement("input");
lrcFileInput.type = "file";
lrcFileInput.id = "lrc-file";
lrcFileInput.accept = ".lrc";
lrcFileInput.style.display = "none"; // Hide by default, show as needed
document.body.appendChild(lrcFileInput);

lrcFileInput.addEventListener("change", function () {
  const file = this.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const lrcText = e.target.result;
    const lrcArray = parseLRC(lrcText);
    syncLyrics(lrcArray);
  };
  reader.readAsText(file);
});

async function fetchLyricsFromLibraries(song) {
  const title = song.title || song.name;
  const artist = song.artist || "";
  let lyrics = "";

  try {
    // Primera fuente: lyrics.ovh
    const response1 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    const data1 = await response1.json();
    if (data1 && data1.lyrics) {
      lyrics = data1.lyrics;
    }

    // Segunda fuente: api.lyricsify.app (si lyrics.ovh falla)
    if (!lyrics) {
      const response2 = await fetch(`https://api.lyricsify.app/api/lyric/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
      const data2 = await response2.json();
      if (data2?.data?.lyric) {
        lyrics = data2.data.lyric;
      }
    }

    if (lyrics) {
      showLyrics(lyrics);
    } else {
      showLyrics("Letra no encontrada.");
    }
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    showLyrics("No se pudo obtener la letra.");
  }
}

function showLyrics(lyrics) {
    const lyricsText = document.getElementById("lyrics-text");
    const isLRC = lyrics.includes("[00:");
    
    if (isLRC) {
        const lrcArray = parseLRC(lyrics);
        syncLyrics(lrcArray);
        lyricsText.textContent = "♪ Synchronized lyrics ♪";
    } else {
        lyricsText.textContent = lyrics || "No lyrics available";
    }
}

// Llama a las funciones de actualización al cargar la página para establecer el estado inicial de los íconos
document.addEventListener("DOMContentLoaded", () => {
    updateToggleRepeat();
    updateToggleShuffle(); 
});