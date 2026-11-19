// Leitura em voz alta com a Web Speech API (um enunciado por versículo).

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let gen = 0;
let playing = false;
let paused = false;

export const supported = () => !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

export function voices() {
  if (!supported()) return [];
  return synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pt'));
}

export function onVoicesChanged(fn) {
  if (supported()) synth.addEventListener('voiceschanged', fn);
}

export const state = () => ({ playing, paused });

export function play(texts, start, { rate = 1, voiceURI = '', onVerse, onEnd } = {}) {
  if (!supported()) return;
  stop();
  const my = ++gen;
  playing = true;
  paused = false;
  const voice = voices().find((v) => v.voiceURI === voiceURI) || voices().find((v) => v.lang === 'pt-BR') || null;
  const speak = (i) => {
    if (my !== gen) return;
    if (i >= texts.length) {
      playing = false;
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(texts[i]);
    u.lang = voice?.lang || 'pt-BR';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => speak(i + 1);
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') speak(i + 1);
    };
    onVerse?.(i);
    synth.speak(u);
  };
  speak(start);
}

export function pause() {
  if (!playing) return;
  synth.pause();
  paused = true;
}

export function resume() {
  if (!playing) return;
  synth.resume();
  paused = false;
}

export function stop() {
  gen++;
  playing = false;
  paused = false;
  if (supported()) synth.cancel();
}
