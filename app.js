const drumRows = ["kick", "snare", "hihat", "clap"];
const stepCount = 16;
const notes = ["C", "D", "E", "F", "G", "A", "B"];
const projectStorageKey = "beatlab-project-v1";

const tempoEl = document.getElementById("tempo");
const tempoValueEl = document.getElementById("tempo-value");
const playBtn = document.getElementById("play-btn");
const stopBtn = document.getElementById("stop-btn");
const clearBtn = document.getElementById("clear-btn");
const saveProjectBtn = document.getElementById("save-project-btn");
const loadProjectBtn = document.getElementById("load-project-btn");
const newProjectBtn = document.getElementById("new-project-btn");
const sequencerEl = document.getElementById("sequencer");
const keyboardEl = document.getElementById("keyboard");
const padsEl = document.getElementById("performance-pads");
const instrumentEl = document.getElementById("instrument");
const octaveEl = document.getElementById("octave");
const recordBtn = document.getElementById("record-btn");
const stopRecordBtn = document.getElementById("stop-record-btn");
const downloadRecordingBtn = document.getElementById("download-recording-btn");
const recordingPreviewEl = document.getElementById("recording-preview");
const statusMessageEl = document.getElementById("status-message");

const sequence = Object.fromEntries(drumRows.map((row) => [row, Array(stepCount).fill(false)]));
const pads = [
  { label: "Sub Drop", key: "1", action: "drop" },
  { label: "Laser", key: "2", action: "laser" },
  { label: "Reverse", key: "3", action: "riser" },
  { label: "Stab", key: "4", action: "stab" },
  { label: "Perc FX", key: "5", action: "perc" },
  { label: "Noise Hit", key: "6", action: "noise" },
  { label: "Glitch", key: "7", action: "glitch" },
  { label: "Impact", key: "8", action: "impact" },
];

let audioCtx;
let isPlaying = false;
let currentStep = 0;
let nextStepTime = 0;
let schedulerId;
let recorder;
let recordChunks = [];
let recordedBlob;

function setStatus(message) {
  statusMessageEl.textContent = message;
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteToMidi(note, octave) {
  const offsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (octave + 1) * 12 + offsets[note];
}

function makeNoiseBuffer(duration = 0.2) {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function triggerEnvelope(node, gain, time, duration = 0.2, peak = 0.8) {
  gain.gain.cancelScheduledValues(time);
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  node.connect(gain).connect(audioCtx.destination);
  node.start(time);
  node.stop(time + duration + 0.02);
}

function playKick(time) {
  const osc = new OscillatorNode(audioCtx, { type: "sine", frequency: 150 });
  const gain = new GainNode(audioCtx);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.15);
  triggerEnvelope(osc, gain, time, 0.16);
}

function playSnare(time) {
  const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.15) });
  const filter = new BiquadFilterNode(audioCtx, { type: "highpass", frequency: 1200 });
  const gain = new GainNode(audioCtx);
  noise.connect(filter);
  triggerEnvelope(filter, gain, time, 0.12);
}

function playHihat(time) {
  const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.06) });
  const filter = new BiquadFilterNode(audioCtx, { type: "highpass", frequency: 5000 });
  const gain = new GainNode(audioCtx);
  noise.connect(filter);
  triggerEnvelope(filter, gain, time, 0.045, 0.4);
}

function playClap(time) {
  const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.18) });
  const filter = new BiquadFilterNode(audioCtx, { type: "bandpass", frequency: 1700, Q: 0.7 });
  const gain = new GainNode(audioCtx);
  noise.connect(filter);
  triggerEnvelope(filter, gain, time, 0.14, 0.6);
}

function playDrum(row, time) {
  if (row === "kick") playKick(time);
  if (row === "snare") playSnare(time);
  if (row === "hihat") playHihat(time);
  if (row === "clap") playClap(time);
}

function schedule() {
  while (nextStepTime < audioCtx.currentTime + 0.1) {
    drumRows.forEach((row) => {
      if (sequence[row][currentStep]) {
        playDrum(row, nextStepTime);
      }
    });

    highlightCurrentStep(currentStep);

    const secondsPerStep = (60 / Number(tempoEl.value)) / 4;
    nextStepTime += secondsPerStep;
    currentStep = (currentStep + 1) % stepCount;
  }
}

function start() {
  ensureAudio();
  if (isPlaying) return;

  isPlaying = true;
  currentStep = 0;
  nextStepTime = audioCtx.currentTime + 0.05;
  schedulerId = setInterval(schedule, 25);
  setStatus(`Tocando em ${tempoEl.value} BPM`);
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;
  clearInterval(schedulerId);
  clearStepHighlight();
  setStatus("Parado.");
}

function setSequenceUI() {
  document.querySelectorAll(".step").forEach((stepEl) => {
    const row = stepEl.dataset.row;
    const step = Number(stepEl.dataset.step);
    stepEl.dataset.active = String(sequence[row][step]);
  });
}

function clearSequence() {
  drumRows.forEach((row) => sequence[row].fill(false));
  setSequenceUI();
  setStatus("Sequência limpa.");
}

function clearStepHighlight() {
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("current"));
}

function highlightCurrentStep(stepIndex) {
  clearStepHighlight();
  document.querySelectorAll(`.step[data-step='${stepIndex}']`).forEach((step) => {
    step.classList.add("current");
  });
}

function createSequencer() {
  drumRows.forEach((row) => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "row-label";
    rowLabel.textContent = row;
    sequencerEl.appendChild(rowLabel);

    for (let step = 0; step < stepCount; step += 1) {
      const btn = document.createElement("button");
      btn.className = "step";
      btn.dataset.row = row;
      btn.dataset.step = String(step);
      btn.dataset.active = "false";
      btn.setAttribute("aria-label", `${row} passo ${step + 1}`);
      btn.addEventListener("click", () => {
        const active = btn.dataset.active === "true";
        btn.dataset.active = String(!active);
        sequence[row][step] = !active;
      });
      sequencerEl.appendChild(btn);
    }
  });
}

function playNote(noteName) {
  ensureAudio();
  const midi = noteToMidi(noteName, Number(octaveEl.value));
  const freq = midiToFrequency(midi);
  const osc = new OscillatorNode(audioCtx, {
    type: instrumentEl.value,
    frequency: freq,
  });
  const gain = new GainNode(audioCtx);
  triggerEnvelope(osc, gain, audioCtx.currentTime, 0.4, 0.45);
}

function createKeyboard() {
  notes.forEach((note) => {
    const key = document.createElement("button");
    key.className = "key";
    key.textContent = note;
    key.addEventListener("click", () => playNote(note));
    keyboardEl.appendChild(key);
  });
}

function flashPad(padButton) {
  padButton.classList.add("active");
  setTimeout(() => padButton.classList.remove("active"), 130);
}

function playPad(action) {
  ensureAudio();
  const now = audioCtx.currentTime;

  if (action === "drop") {
    const osc = new OscillatorNode(audioCtx, { type: "sawtooth", frequency: 160 });
    const gain = new GainNode(audioCtx);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.42);
    triggerEnvelope(osc, gain, now, 0.45, 0.65);
  }

  if (action === "laser") {
    const osc = new OscillatorNode(audioCtx, { type: "square", frequency: 1100 });
    const gain = new GainNode(audioCtx);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.2);
    triggerEnvelope(osc, gain, now, 0.22, 0.42);
  }

  if (action === "riser") {
    const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.6) });
    const filter = new BiquadFilterNode(audioCtx, { type: "highpass", frequency: 400 });
    const gain = new GainNode(audioCtx);
    filter.frequency.linearRampToValueAtTime(4200, now + 0.58);
    triggerEnvelope(filter, gain, now, 0.58, 0.4);
    noise.connect(filter);
  }

  if (action === "stab") {
    [0, 4, 7].forEach((interval) => {
      const osc = new OscillatorNode(audioCtx, {
        type: "sawtooth",
        frequency: midiToFrequency(57 + interval),
      });
      const gain = new GainNode(audioCtx);
      triggerEnvelope(osc, gain, now, 0.23, 0.25);
    });
  }

  if (action === "perc") {
    playClap(now);
    playHihat(now + 0.03);
    playHihat(now + 0.08);
  }

  if (action === "noise") {
    const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.16) });
    const filter = new BiquadFilterNode(audioCtx, { type: "bandpass", frequency: 900, Q: 0.8 });
    const gain = new GainNode(audioCtx);
    noise.connect(filter);
    triggerEnvelope(filter, gain, now, 0.16, 0.48);
  }

  if (action === "glitch") {
    for (let i = 0; i < 4; i += 1) {
      const osc = new OscillatorNode(audioCtx, {
        type: "triangle",
        frequency: 420 + i * 120,
      });
      const gain = new GainNode(audioCtx);
      triggerEnvelope(osc, gain, now + i * 0.03, 0.05, 0.25);
    }
  }

  if (action === "impact") {
    const osc = new OscillatorNode(audioCtx, { type: "sine", frequency: 240 });
    const gain = new GainNode(audioCtx);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.34);
    triggerEnvelope(osc, gain, now, 0.36, 0.64);

    const noise = new AudioBufferSourceNode(audioCtx, { buffer: makeNoiseBuffer(0.3) });
    const filter = new BiquadFilterNode(audioCtx, { type: "lowpass", frequency: 1200 });
    const nGain = new GainNode(audioCtx);
    noise.connect(filter);
    triggerEnvelope(filter, nGain, now, 0.28, 0.32);
  }
}

function createPads() {
  pads.forEach((pad) => {
    const button = document.createElement("button");
    button.className = "pad";
    button.dataset.key = pad.key;
    button.dataset.action = pad.action;
    button.innerHTML = `${pad.label}<small>[${pad.key}]</small>`;
    button.addEventListener("click", () => {
      flashPad(button);
      playPad(pad.action);
      setStatus(`Pad disparado: ${pad.label}`);
    });
    padsEl.appendChild(button);
  });
}

function getProjectData() {
  return {
    tempo: Number(tempoEl.value),
    instrument: instrumentEl.value,
    octave: Number(octaveEl.value),
    sequence,
  };
}

function applyProjectData(project) {
  const safeTempo = Math.min(180, Math.max(60, Number(project.tempo) || 110));
  tempoEl.value = String(safeTempo);
  tempoValueEl.value = String(safeTempo);

  if (["sine", "triangle", "square", "sawtooth"].includes(project.instrument)) {
    instrumentEl.value = project.instrument;
  }

  octaveEl.value = String(Math.min(6, Math.max(2, Number(project.octave) || 4)));

  drumRows.forEach((row) => {
    const source = Array.isArray(project.sequence?.[row]) ? project.sequence[row] : [];
    sequence[row] = Array.from({ length: stepCount }, (_, idx) => Boolean(source[idx]));
  });

  setSequenceUI();
}

function saveProject() {
  localStorage.setItem(projectStorageKey, JSON.stringify(getProjectData()));
  setStatus("Projeto salvo com sucesso neste navegador.");
}

function loadProject() {
  const raw = localStorage.getItem(projectStorageKey);
  if (!raw) {
    setStatus("Nenhum projeto salvo encontrado.");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    applyProjectData(parsed);
    setStatus("Projeto carregado.");
  } catch (error) {
    console.error(error);
    setStatus("Não foi possível carregar o projeto salvo.");
  }
}

function newProject() {
  stop();
  applyProjectData({
    tempo: 110,
    instrument: "sine",
    octave: 4,
    sequence: Object.fromEntries(drumRows.map((row) => [row, Array(stepCount).fill(false)])),
  });
  setStatus("Novo projeto criado.");
}

function downloadRecording() {
  if (!recordedBlob) return;
  const url = URL.createObjectURL(recordedBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `beatlab-gravacao-${Date.now()}.webm`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recordChunks = [];

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordChunks.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      recordedBlob = new Blob(recordChunks, { type: "audio/webm" });
      recordingPreviewEl.src = URL.createObjectURL(recordedBlob);
      downloadRecordingBtn.disabled = false;
      stream.getTracks().forEach((track) => track.stop());
      setStatus("Gravação finalizada e pronta para download.");
    });

    recorder.start();
    recordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    downloadRecordingBtn.disabled = true;
    recordBtn.textContent = "🎙️ Gravando...";
    setStatus("Gravação em andamento...");
  } catch (error) {
    alert("Não foi possível acessar o microfone. Verifique as permissões.");
    console.error(error);
    setStatus("Erro ao iniciar gravação.");
  }
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
  recordBtn.disabled = false;
  stopRecordBtn.disabled = true;
  recordBtn.textContent = "🎙️ Iniciar Gravação";
}

tempoEl.addEventListener("input", () => {
  tempoValueEl.value = tempoEl.value;
});

playBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
clearBtn.addEventListener("click", clearSequence);
saveProjectBtn.addEventListener("click", saveProject);
loadProjectBtn.addEventListener("click", loadProject);
newProjectBtn.addEventListener("click", newProject);
recordBtn.addEventListener("click", startRecording);
stopRecordBtn.addEventListener("click", stopRecording);
downloadRecordingBtn.addEventListener("click", downloadRecording);

window.addEventListener("keydown", (event) => {
  const element = document.activeElement;
  if (element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
    return;
  }

  const normalizedKey = event.key.toLowerCase();
  const noteMap = {
    a: "C",
    s: "D",
    d: "E",
    f: "F",
    g: "G",
    h: "A",
    j: "B",
  };

  if (noteMap[normalizedKey]) {
    playNote(noteMap[normalizedKey]);
  }

  const matchedPad = pads.find((pad) => pad.key === normalizedKey);
  if (matchedPad) {
    const padButton = document.querySelector(`.pad[data-key='${matchedPad.key}']`);
    if (padButton) flashPad(padButton);
    playPad(matchedPad.action);
    setStatus(`Pad disparado: ${matchedPad.label}`);
  }
});

createSequencer();
createKeyboard();
createPads();
loadProject();
