"use strict";
import './STYLES/main.css'

// ===================================
// DOM ELEMENTS AND VARIABLES
// ===================================

// Player control elements
const fileInput = document.getElementById("file-input");
const audioPlayer = document.getElementById("audio-player");
const playPauseBtn = document.getElementById("play-pause");
const nextBtn = document.getElementById("next");
const prevBtn = document.getElementById("prev");
const songTitle = document.getElementById("song-title");
const progressBar = document.getElementById("progress-bar");
const toggleRepeat = document.getElementById("toggle-repeat");
const repeatIcon = document.getElementById("repeat-icon");
const toggleShuffle = document.getElementById("toggle-shuffle");
const shuffleIcon = document.getElementById("shuffle-icon");
const currentTimeDisplay = document.getElementById("current-time");
const totalDurationDisplay = document.getElementById("total-duration");

// Visual elements
const albumArt = document.getElementById("album-art");
const blurBackground = document.getElementById("blur-background");
const playerContainer = document.querySelector(".player-container");
const songArtist = document.getElementById("song-artist");

// Song list elements
const songListContainer = document.querySelector(".song-list-container");
const songListBody = document.querySelector("#song-list-body");

// Lyrics elements
const lyricsOverlay = document.getElementById("lyrics-overlay");
const lyricsContainer = document.getElementById("lyrics-container");
const lyricsTextElement = document.getElementById("lyrics-text");
const lyricsIcon = document.getElementById("lyrics-icon");
const lyricsBtn = document.getElementById("turn-lyrics");

// Third-party libraries
const colorThief = new ColorThief();

// Configuration constants
const supportedFormats = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp3",
  "audio/flac",
  "audio/aac",
];

// ===================================
// GLOBAL STATE VARIABLES
// ===================================

let songList = [];
let currentSongIndex = 0;
let isSeeking = false;
let seekTimeout = null;
let isDragging = false;
let wasPlaying = false;
let previousUrl = null;
let repeatMode = 0; // 0: off, 1: repeat all, 2: repeat one
let shuffleMode = false;
let playedSongIndexes = [];
let currentLRC = [];
let currentLyricIndex = -1;
let lyricsTimeUpdateHandler = null;
let activeObjectUrls = new Set();


// INITIALIZATION


// Initialize Lucide icons
lucide.createIcons();

// Loading animation
playerContainer.classList.add("loading");
setTimeout(() => playerContainer.classList.remove("loading"), 500);

// Load saved index from localStorage
const savedIndex = localStorage.getItem("lastIndex");
if (savedIndex !== null) currentSongIndex = parseInt(savedIndex);

// Default placeholder for album art
albumArt.src = "https://placehold.co/200x200?text=No+Cover";

// Error handler for album art
albumArt.onerror = function () {
  console.warn("Error loading album art");
  this.src = "https://placehold.co/200x200?text=No+Cover";
  this.style.backgroundColor = "#333";
};

// Set initial opacity for shuffle button
toggleShuffle.style.opacity = 0.5;

// ===================================
// FILE HANDLING AND SONG LOADING
// ===================================

function cleanupObjectUrls() {
  activeObjectUrls.forEach(url => {
    if (url !== audioPlayer.src) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn("Error revoking URL:", e);
      }
    }
  });
  activeObjectUrls = new Set([audioPlayer.src]);
}

// Process metadata for all songs in the list
function processMetadataForAllSongs() {
  songList.forEach((song) => {
    // Read metadata
    window.jsmediatags.read(song.file, {
      onSuccess: function(tag) {
        song.title = tag.tags.title || song.name;
        song.artist = tag.tags.artist || "-";
        song.album = tag.tags.album || "-";
        updateSongList();
        shortenAlbumText();
      },
      onError: function () {
        song.artist = "-";
        song.album = "-";
        updateSongList();
        shortenAlbumText();
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

// Handle file input for multiple songs
fileInput.addEventListener("change", function () {
  const files = Array.from(this.files).filter((file) =>
    supportedFormats.includes(file.type) || file.name.endsWith('.lrc')
  );

  if (files.length === 0) {
    alert("No compatible audio files found");
    if (songList.length === 0) {
      songListContainer.classList.add("hidden-list");
    }
    return;
  }

  songListContainer.classList.remove("hidden-list");

  const audioFiles = files.filter(file => supportedFormats.includes(file.type));
  const lrcFiles = files.filter(file => file.name.endsWith('.lrc'));

  cleanupObjectUrls();

  const newSongs = audioFiles.map((file) => {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const lrcFile = lrcFiles.find(lrc => lrc.name.replace(/\.[^/.]+$/, "") === baseName);
    return {
      file: file,
      name: baseName,
      lrcFile: lrcFile || null,
      title: null,
      artist: null,
      album: null,
      duration: null,
      durationFormatted: null,
      ObjectUrl: null,
    };
  });

  const wasEmpty = songList.length === 0;

  songList = songList.concat(newSongs);

  processMetadataForAllSongs();
  updateSongList();

  if (wasEmpty && songList.length > 0) {
    currentSongIndex = 0;
    loadSong();
  }
});

// Main function to load and play a song
function loadSong() {
  if (songList.length === 0) return;
  
  resetPlayerUI();
  cleanupPreviousSong();
  loadNewSong();

  const song = songList[currentSongIndex];
  songTitle.textContent = song.title || song.name;
  songArtist.textContent = song.artist || "-";
  
  handleMetadataAndArt();
}

function resetPlayerUI() {
  progressBar.value = 0;
  currentTimeDisplay.textContent = "00:00";
  totalDurationDisplay.textContent = "00:00";
}

function cleanupPreviousSong() {
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
    previousUrl = null;
  }
}

function loadNewSong() {
  if (currentSongIndex < 0 || currentSongIndex >= songList.length) {
    console.error("Invalid song index:", currentSongIndex);
    return;
  }

  const song = songList[currentSongIndex];
  
  if (!song || !song.file) {
    console.error("Invalid song at the index:", currentSongIndex);
    return;
  }

  localStorage.setItem("lastIndex", currentSongIndex);
  updateSongList();

  try {
    const newUrl = URL.createObjectURL(song.file);
    audioPlayer.src = newUrl;
    activeObjectUrls.add(newUrl);
    previousUrl = newUrl;

    songTitle.textContent = song.name || "Unknown Song";
    audioPlayer.load();

    audioPlayer.play().catch(error => {
      console.error("Error playing audio:", error);
    });
    
    updateIcons(true);
  } catch (error) {
    console.error("Error loading song:", error);
  }
}

function updateAudioQuality(song, audioInfo = null) {
  const formatDisplay = document.getElementById("file-format");
  if (!formatDisplay || !song?.file) return;

  const format = song.file.type.split("/")[1].toUpperCase();
  let qualityText = format;

  if (audioInfo?.bitrate) {
    if (['FLAC', 'WAV', 'ALAC'].includes(format)) {
      qualityText += ` • Lossless`;
    } else {
      const kbps = Math.round(audioInfo.bitrate / 1000);
      qualityText += ` • ${kbps}kbps`;
    }

    formatDisplay.classList.toggle('high-quality', 
      (audioInfo.bitrate >= 320000) || 
      ['FLAC', 'WAV', 'ALAC'].includes(format)
    );
  } 
  else if (song.duration) {
    const kbps = Math.round((song.file.size / (song.duration * 0.0075)));
    
    if (kbps > 1000) {
      qualityText += ` • Lossless`;
    } else {
      qualityText += ` • ~${kbps}kbps`;
    }
  }

  formatDisplay.textContent = qualityText;
}

function resetAlbumArt() {
  albumArt.style.opacity = 0;
  albumArt.src = "https://placehold.co/200x200?text=Loading...";
  blurBackground.style.backgroundImage = "none";
}

function handleMetadataAndArt() {
  const song = songList[currentSongIndex];
  
  if (lyricsTimeUpdateHandler) {
    audioPlayer.removeEventListener("timeupdate", lyricsTimeUpdateHandler);
    lyricsTimeUpdateHandler = null;
  }

  if (song.lrcFile) {
    const reader = new FileReader();
    reader.onload = function(e) {
      showLyrics(e.target.result);
    };
    reader.readAsText(song.lrcFile);
  } else {
    handleID3Tags(song);
  }
}

function handleID3Tags(song) {
  window.jsmediatags.read(song.file, {
    onSuccess: function(tag) {
      console.log("Tags:", tag.tags);

      // Update song title and artist
      if (tag.tags.title) {
        songTitle.textContent = tag.tags.title;
        song.title = tag.tags.title;
      }
      if (tag.tags.artist) {
        songArtist.textContent = tag.tags.artist;
        song.artist = tag.tags.artist;
      } else {
        songArtist.textContent = "";
      }

      // Process lyrics
      if (tag.tags.lyrics && tag.tags.lyrics.text) {
        showLyrics(tag.tags.lyrics.text);
      } else if (!song.lrcFile) {
        showLyrics("No lyrics found");
      }

      // Process album art
      if (tag.tags.picture) {
        processAlbumArt(tag.tags.picture, song);
      } else {
        console.log("No picture data found in metadata");
        handleImageError();
      }

      const audioInfo = {
        bitrate: tag.tags.bitrate,
        sampleRate: tag.tags.sampleRate,
        bitsPerSample: tag.tags.bitsPerSample
      };

      updateAudioQuality(song, audioInfo); 
    },
    onError: function(error) {
      console.error("Error reading metadata:", error);
      handleImageError();
    }
  });
}

function processAlbumArt(picture, song) {
  const base64String = arrayBufferToBase64(picture.data);
  const imageUri = `data:${picture.format};base64,${base64String}`;

  const tempImage = new Image();
  tempImage.crossOrigin = "anonymous";

  tempImage.onload = function() {
    albumArt.onload = function() {
      albumArt.style.opacity = 1;
    };
    albumArt.onerror = handleImageError;
    albumArt.src = imageUri;
    blurBackground.style.backgroundImage = `url(${imageUri})`;

    setTimeout(() => {
      if (tempImage.complete && tempImage.naturalWidth !== 0) {
        const dominantColor = colorThief.getColor(tempImage);
        applyThemeColor(dominantColor);
      } else {
        applyDefaultTheme();
      }
    }, 100);
  };

  tempImage.onerror = handleImageError;
  tempImage.src = imageUri;
}

// ===================================
// IMAGE AND THEME HANDLING
// ===================================

// Handle image loading errors
function handleImageError() {
  albumArt.src = "https://placehold.co/200x200?text=No+Cover";
  albumArt.style.opacity = 1;
  blurBackground.style.backgroundImage = "none";
  applyDefaultTheme();

  if (previousUrl) {
    setTimeout(() => {
      URL.revokeObjectURL(previousUrl);
    }, 1000);
  }
}

// Apply default theme color
function applyDefaultTheme() {
  document.documentElement.style.setProperty(
    "--theme-color",
    "74, 144, 226");
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  try {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    const chunkSize = 0x8000; // 32KB chunk
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }

    return window.btoa(binary);
  } catch (error) {
    console.error("Error converting ArrayBuffer to Base64:", error);
    throw error;
  }
}

// Apply theme color from RGB array
function applyThemeColor(rgbArray) {
  if (!rgbArray || !Array.isArray(rgbArray) || rgbArray.length < 3) {
    console.error("Invalid RGB array:", rgbArray);
    rgbArray = [74, 144, 226]; // Default color
  }

  const [r, g, b] = rgbArray;
  const themeColor = `${r}, ${g}, ${b}`;
  document.documentElement.style.setProperty("--theme-color", themeColor);
}

// ===================================
// PLAYER CONTROLS
// ===================================

// Update play/pause icons
function updateIcons(isPlaying) {
  const icon = document.querySelector(".play-icon");
  if (!icon) return;

  icon.setAttribute("data-lucide", isPlaying ? "pause" : "play");
  lucide.createIcons();
}

// Play/Pause button functionality
playPauseBtn.addEventListener("click", function () {
  if (audioPlayer.paused) {
    audioPlayer.play();
    updateIcons(true);
  } else {
    audioPlayer.pause();
    updateIcons(false);
  }
});

// ===================================
// PROGRESS BAR AND TIME DISPLAY
// ===================================

// Simple progress bar implementation
progressBar.addEventListener("input", function() {
  if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;

  isSeeking = true;
  const percentage = this.value / 100;
  const newTime = percentage * audioPlayer.duration;
  
  currentTimeDisplay.textContent = formatTime(newTime);
  clearTimeout(seekTimeout);
  
  seekTimeout = setTimeout(() => {
    audioPlayer.currentTime = newTime;
  }, 100);
});

progressBar.addEventListener("mousedown", () => {
  isSeeking = true;
  wasPlaying = !audioPlayer.paused;
  if (wasPlaying) {
    audioPlayer.pause();
  }
});

progressBar.addEventListener("mouseup", () => {
  if (!isSeeking) return;
  isSeeking = false;

  clearTimeout(seekTimeout);
  const newTime = (progressBar.value / 100) * audioPlayer.duration;
  audioPlayer.currentTime = newTime;

  if (wasPlaying) {
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => console.error("Playback resume error:", e));
    }
  }
});

// Handle direct clicks on the progress bar
progressBar.addEventListener("click", function(e) {
  if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
    
  const rect = this.getBoundingClientRect();
  const percentage = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const seekTime = percentage * audioPlayer.duration;

  audioPlayer.currentTime = seekTime;
  this.value = percentage * 100;
  currentTimeDisplay.textContent = formatTime(seekTime);
    
  if (wasPlaying) {
    audioPlayer.play().catch(e => console.error("Error resuming playback:", e));
  }
});

// Update progress bar during playback
audioPlayer.addEventListener("timeupdate", function () {
  if (isSeeking || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;

  const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  if (Math.abs(progressBar.value - progress) > 0.5) {
    progressBar.value = progress;
  }
  currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
});

// Set up duration when metadata loads
audioPlayer.addEventListener("loadedmetadata", function() {
  if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return; 

  totalDurationDisplay.textContent = formatTime(audioPlayer.duration);
});

// Update icons on play/pause events
audioPlayer.addEventListener("play", () => {
  updateIcons(true);
  wasPlaying = true;
});

audioPlayer.addEventListener("pause", () => {
  updateIcons(false);
});

// ===================================
// NAVIGATION CONTROLS
// ===================================

// Next song button
nextBtn.addEventListener("click", () => {
  if (songList.length === 0) return;

  if (shuffleMode) {
    playRandomSong();
  } else {
    currentSongIndex = (currentSongIndex + 1) % songList.length;
    loadSong();
  }
});

// Previous song button
prevBtn.addEventListener("click", () => {
  if (songList.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
  loadSong();
});

// ===================================
// REPEAT AND SHUFFLE FUNCTIONALITY
// ===================================

// Toggle repeat mode
toggleRepeat.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  updateToggleRepeat();
});

// Toggle shuffle mode
toggleShuffle.addEventListener("click", () => {
  shuffleMode = !shuffleMode;
  updateToggleShuffle();
  playedSongIndexes = [];
});

// Update repeat button appearance
function updateToggleRepeat() {
  const repeatClasses = ["bi bi-repeat", "bi bi-repeat", "bi bi-repeat-1"];
  repeatIcon.className = repeatClasses[repeatMode];
  toggleRepeat.style.opacity = repeatMode === 0 ? 0.5 : 1;
}

// Update shuffle button appearance
function updateToggleShuffle() {
  if (shuffleMode) {
    toggleShuffle.style.opacity = 1;
  } else {
    toggleShuffle.style.opacity = 0.5;
  }
}

// ===================================
// TRACK END HANDLING
// ===================================

// Handle when a song ends
audioPlayer.addEventListener("ended", handleTrackEnd);

function handleTrackEnd() {
  if (repeatMode === 2) {
    repeatCurrentSong();
  } else if (shuffleMode) {
    playRandomSong();
  } else if (hasNextSong()) {
    playNextSong();
  } else if (repeatMode === 1) {
    playFirstSong();
  } else {
    stopPlayback();
  }
}

// Repeat current song
function repeatCurrentSong() {
  audioPlayer.currentTime = 0;
  audioPlayer.play();
}

// Play next song in sequence
function playNextSong() {
  currentSongIndex++;
  loadSong();
}

// Play random song with shuffle logic
function playRandomSong() {
  if (songList.length === 0) return;

  let nextIndex;

  if (songList.length <= 1) {
    nextIndex = 0;
  } else {
    do {
      nextIndex = Math.floor(Math.random() * songList.length);
    } while (
      nextIndex === currentSongIndex ||
      playedSongIndexes.includes(nextIndex)
    );

    playedSongIndexes.push(currentSongIndex);

    if (
      playedSongIndexes.length > Math.floor(songList.length / 2) &&
      songList.length > 2
    ) {
      playedSongIndexes.shift();
    } else if (playedSongIndexes.length > songList.length - 1) {
      playedSongIndexes = [];
    }
  }

  currentSongIndex = nextIndex;
  loadSong();
}

// Check if there's a next song
function hasNextSong() {
  return currentSongIndex < songList.length - 1;
}

// Play first song
function playFirstSong() {
  currentSongIndex = 0;
  loadSong();
}

// Stop playback
function stopPlayback() {
  audioPlayer.pause();
  updateIcons(false);
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

// Format time in MM:SS format
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
}

// ===================================
// SONG LIST MANAGEMENT
// ===================================

// Update the song list display
function updateSongList() {
  songListBody.innerHTML = ""; // Clear existing rows

  songList.forEach((song, index) => {
    const tr = document.createElement("tr");

    tr.addEventListener("click", () => {
      currentSongIndex = index;
      loadSong();
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
    titleSpan.classList.add("list-song-title");
    titleSpan.textContent = song.title || song.name || song.file.name;
    tdTitleArtist.appendChild(titleSpan);

    if (song.artist && song.artist !== "-") {
      const artistSpan = document.createElement("span");
      artistSpan.classList.add("list-song-artist");
      artistSpan.textContent = song.artist;
      tdTitleArtist.appendChild(document.createElement("br"));
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

    songListBody.appendChild(tr);
  });

  addTooltips();
}

// Add tooltips for overflow text
function addTooltips() {
  const cells = document.querySelectorAll("#song-list td");
  cells.forEach((cell) => {
    if (cell.scrollWidth > cell.clientWidth) {
      cell.title = cell.textContent;
    }
  });
}

function shortenAlbumText() {
  const albumCells = document.querySelectorAll("#song-list td:nth-child(3)");

  albumCells.forEach(cell => {
    const originalText = cell.getAttribute("data-fulltext") || cell.textContent;
    const words = cell.textContent.trim().split(/\s+/);

    if (words.length > 4) {
      cell.textContent = words.slice(0, 4).join(" ") + "...";
      cell.setAttribute('title', originalText);
      cell.setAttribute('data-fulltext', originalText);
    }
  });
}

// ===================================
// RESPONSIVE DESIGN HANDLING
// ===================================

// Detect if device is mobile
function isMobileDevice() {
  return (
    window.innerWidth <= 900 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )
  );
}

// Apply responsive behavior
function applyResponsiveBehavior() {
  const isMobile = isMobileDevice();
  const songListContainer = document.querySelector(".song-list-container");

  if (isMobile) {
    songListContainer.style.overflowX = "auto";
  } else {
    songListContainer.style.overflowX = "hidden";
  }
}

// Execute responsive behavior on load and resize
window.addEventListener('load', applyResponsiveBehavior);
window.addEventListener('resize', applyResponsiveBehavior);

// ===================================
// LYRICS FUNCTIONALITY
// ===================================

// Toggle lyrics overlay visibility
function toggleLyrics() {
  const isVisible = lyricsOverlay.classList.contains("visible");

  if (isVisible) {
    lyricsOverlay.classList.remove("visible");
    lyricsOverlay.style.opacity = "0";
    lyricsOverlay.style.pointerEvents = "none";
    lyricsOverlay.style.transform = "translateX(-50%) scale(0.95)";
    lyricsIcon.setAttribute("data-lucide", "mic-vocal");
  } else {
    lyricsOverlay.classList.add("visible");
    lyricsOverlay.style.opacity = "1";
    lyricsOverlay.style.pointerEvents = "auto";
    lyricsOverlay.style.transform = "translateX(-50%) scale(1)";
    lyricsIcon.setAttribute("data-lucide", "mic");
  }

  lucide.createIcons();
}

// Add event listener for lyrics button
lyricsBtn.addEventListener("click", toggleLyrics);

// Parse LRC format lyrics
function parseLRC(lrcText) {
  return lrcText.split("\n").reduce((acc, line) => {
    const { timestamps, text } = extractTimestampsAndText(line);
    return [...acc, ...createLyricEntries(timestamps, text)];
  }, []).sort((a, b) => a.time - b.time);
}

function extractTimestampsAndText(line) {
  const timestampRegex = /\[(\d{2}):(\d{2}(?:\.\d{2})?)\]/g;
  const timestamps = [];
  let match;
  let lastIndex = 0;

  while ((match = timestampRegex.exec(line)) !== null) {
    const minutes = parseInt(match[1]);
    const seconds = parseFloat(match[2]);
    timestamps.push(minutes * 60 + seconds);
    lastIndex = timestampRegex.lastIndex;
  }

  return {
    timestamps,
    text: line.substring(lastIndex).trim()
  };
}

function createLyricEntries(timestamps, text) {
  if (timestamps.length > 0) {
    return timestamps.map(time => ({ time, text }));
  } 
  return text ? [{ time: -1, text }] : [];
}

// Display lyrics in the overlay
function showLyrics(lyricsContent) {
  lyricsContainer.innerHTML = "";

  const isLRCFormat =
    lyricsContent.includes("[00:") || lyricsContent.includes("[01:");

  if (isLRCFormat) {
    currentLRC = parseLRC(lyricsContent);
    if (currentLRC.length > 0) {
      currentLRC.forEach((line, index) => {
        const p = document.createElement("p");
        p.textContent = line.text || "";
        p.setAttribute("data-time", line.time);
        p.classList.add("lyrics-line");
        lyricsContainer.appendChild(p);
      });
      syncLyrics();
    } else {
      lyricsContainer.textContent = lyricsContent || "No lyrics available";
      currentLRC = [];
    }
  } else {
    lyricsContainer.textContent = lyricsContent || "No lyrics available";
    currentLRC = [];
  }
}

// Synchronize lyrics with audio playback
function syncLyrics() {
  // Remove previous event listener if exists
  if (lyricsTimeUpdateHandler) {
    audioPlayer.removeEventListener("timeupdate", lyricsTimeUpdateHandler);
  }

  function updateActiveLyricLine(newIndex) {
    const lyricsLines = lyricsContainer.querySelectorAll(".lyrics-line");

    if (currentLyricIndex !== -1 && lyricsLines[currentLyricIndex]) {
      lyricsLines[currentLyricIndex].classList.remove("active-line");
    }

    if (lyricsLines[newIndex]) {
      lyricsLines[newIndex].classList.add("active-line");
      currentLyricIndex = newIndex;
      scrollToLyricLine(lyricsLines[newIndex]);
    }
  }

  function scrollToLyricLine(lineElement) {
    if (!lineElement) return;

    const containerHeight = lyricsContainer.clientHeight;
    const lineHeight = lineElement.clientHeight;
    const lineOffset = lineElement.offsetTop;
    const scrollPos = lineOffset - containerHeight / 2 + lineHeight / 2;

    lyricsContainer.scrollTo({
      top: scrollPos,
      behavior: "smooth",
    });
  }

  lyricsTimeUpdateHandler = function() {
    const lyricsLines = lyricsContainer.querySelectorAll(".lyrics-line");
    if (lyricsLines.length === 0 || currentLRC.length === 0) return;

    const currentTime = audioPlayer.currentTime;
    let nextLyricIndex = -1;

    for (let i = 0; i < currentLRC.length; i++) {
      if (currentTime >= currentLRC[i].time) {
        if (i + 1 < currentLRC.length && currentTime < currentLRC[i + 1].time) {
          nextLyricIndex = i;
          break;
        } else if (i === currentLRC.length - 1) {
          nextLyricIndex = i;
          break;
        }
      }
    }

    if (nextLyricIndex !== -1 && nextLyricIndex !== currentLyricIndex) {
      updateActiveLyricLine(nextLyricIndex);
    }
  };

  audioPlayer.addEventListener("timeupdate", lyricsTimeUpdateHandler);
}
