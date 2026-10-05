# Nepal 2015 briefing — audio research (Stage 9.2)

What the briefing's voice and music are, why, and what was rejected. Licences are
recorded per asset in [`AUDIO_LICENSES.md`](AUDIO_LICENSES.md); this file explains the
choice.

## 1. The requirement

- A calm, clear, non-theatrical English narrator. It must not imitate any real person
  (actor, politician, official, celebrity or known narrator), and it must not use
  copyrighted dialogue.
- Free to use, and legitimately redistributable inside an open repository and a public
  deployment. "Free to download" is not "free to redistribute"; an unclear licence means
  the asset is not bundled.
- The briefing must never fail because a voice is unavailable:
  **high-quality local voice → system speech synthesis → captions only.**
- Delivery controls (pauses, rate, emphasis, energy) only where the engine really applies
  them. A control with no effect is not offered.
- Music: licensed (preferably CC0) or original, never film music or random video-site
  tracks. It ducks under narration.

## 2. Voice candidates

Each candidate was checked for code licence, model-weight licence, commercial use,
redistribution, hardware, size, speed, quality, prosody control, deployment fit and
offline use. Licence statements are as published on each project's page; sizes for
engines not installed here are approximate (≈). The deciding facts for the chosen engine
were re-read from its model card and measured on this machine for this document.

| Candidate | Code / weights licence | Commercial · redistribution | Size · hardware | Speed (CPU) | Quality | Prosody control | Fit | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Kokoro-82M v1.0** (hexgrad), ONNX export by onnx-community | Apache-2.0 / Apache-2.0 | Yes · yes | 82 M parameters; fp32 ONNX 326 MB; one voice tensor 510 KB; CPU is enough | Measured here: 46.3 s of speech in 86.7 s wall on 4 vCPU, model load included (≈ 1.9× real time) | Natural, even, unforced; the model card grades af_heart **A**, bf_emma **B−**, am_michael **C+** | Speed (per call); pauses and gain applied when rendering; lexical stress and pronunciation through misaki links `[word](/phonemes/)`, `[word](+1)` | Rendered **at build time** to short MP3 clips; nothing heavy reaches the browser | **Chosen** |
| kokoro-js (same model in the browser, transformers.js) | Apache-2.0, but its phonemizer bundles eSpeak NG compiled to WASM (GPL-3.0) | Shipping it means distributing GPL code in the bundle | 92 MB (q8) to 326 MB (fp32) per visitor | WASM inference below real time on ordinary laptops | Same voice | Same | Heavy first load, licence entanglement | Rejected |
| Piper (rhasspy → OHF-Voice/piper1-gpl) | Original code MIT, current code GPL-3.0; **each voice has its own licence** (many CC BY / CC BY-SA, some research-only datasets) | Depends on the voice; must be checked one by one | 20–75 MB per voice, CPU | Faster than real time | Clear but flatter, more "assistant" | Length scale, noise; no emphasis | Good offline engine; runtime phonemizer is eSpeak NG (GPL) | Not chosen: quality below Kokoro and per-voice licence risk |
| Coqui XTTS-v2 | Code MPL-2.0; weights **Coqui Public Model Licence (non-commercial)** | No | ~1.8 GB, GPU recommended | Slow on CPU | Very good | Voice cloning by reference audio | Cloning is exactly what is not wanted | Rejected (licence, cloning) |
| F5-TTS | Code MIT; pre-trained weights **CC BY-NC 4.0** (Emilia data) | No | ~1.3 GB, GPU | Slow on CPU | Very good | Reference-audio cloning | — | Rejected (non-commercial, cloning) |
| StyleTTS 2 (LibriTTS model) | Code MIT; pre-trained model terms require telling listeners the speech is synthetic unless the voice owner consents | Conditional | ~0.7 GB, GPU recommended | Slow on CPU | Good | Style vectors | Kokoro is a smaller, Apache-licensed descendant of this architecture | Not chosen |
| Parler-TTS mini v1 | Apache-2.0 / Apache-2.0 | Yes · yes | ~880 M parameters, ~3.5 GB | Well below real time on CPU | Good, variable | Natural-language description of the voice | Heavy for 214+ sentences per voice | Not chosen |
| MeloTTS (English) | MIT / MIT | Yes · yes | ~200 MB, CPU | Around real time | Good, slightly synthetic | Speed | Viable second choice | Not chosen (quality below Kokoro's best voices) |
| Bark (Suno) | MIT / MIT | Yes · yes | ~5 GB, GPU | Very slow on CPU | Expressive but non-deterministic: can add noises, music or wrong words | Prompt-level only | Non-determinism is unacceptable for a briefing | Rejected |
| Mimic 3 (Mycroft) | AGPL-3.0, archived | Copyleft | small | Fast | Robotic | SSML subset | Unmaintained | Rejected |
| eSpeak NG | GPL-3.0 | Yes (as a program) | < 10 MB | Instant | Robotic | SSML-like | Too mechanical for a briefing voice | Rejected as a voice (used only as a build-time pronunciation fallback, never shipped) |
| Web Speech API (`speechSynthesis`) | The browser's / OS's voices | Nothing redistributed | None to download | Instant | From poor to excellent, depending on the machine | Rate, pitch, volume; SSML ignored by browsers | Zero-key, offline on most systems | **Kept as the fallback** |
| Cloud TTS (Azure, Google, Amazon Polly, ElevenLabs) | Commercial terms | Paid at scale; output reuse and caching terms vary | — | Fast | Excellent | SSML | Needs keys (must never be committed) and an account | Rejected |

## 3. The chosen system

**Kokoro-82M v1.0 rendered at build time.** `scripts/build-narration.mjs` fills every
beat's narration from the analysis artefacts (the same fact book the briefing uses),
splits it into sentences with their delivery, and renders each sentence once per voice
with `scripts/narration/render.py`:

- **G2P**: misaki 0.9.4 (Apache-2.0), American or British phoneme set per voice. Place
  names and acronyms the G2P got wrong are given explicit pronunciations
  (`src/nepal/briefing/pronunciation.js`): "Sindhupalchok" had come out
  "sind-hyu-pal-chok", "UNOSAT" letter by letter, "06:11" as "zero six eleven". Nepali
  names use their common English pronunciation; a native speaker says them differently,
  which is a stated limitation. eSpeak NG is misaki's fallback for words it does not know;
  it runs only on the build machine, and the renders checked here used it for no word.
- **Model**: onnx-community Kokoro-82M-v1.0-ONNX, fp32, run with onnxruntime (MIT).
- **Clips**: trimmed of edge silence (70 ms kept), speech normalised to about −20 dBFS
  RMS with a −1 dBFS peak limit, delivery pauses added as silence, encoded to MP3 at
  24 kHz mono (libsndfile 1.2.2, about 57 kbit/s). One sentence = one clip, named by a hash
  of the renderer version, the exact words, the pronunciation and the delivery
  (`clipKey`), so a revised sentence can never play a stale clip.
- **Manifest**: `public/audio/narration/manifest.json` lists every clip with its exact
  length. The browser, the director's timing, the script generator and the runtime check
  all read it: **a beat lasts as long as its voice**, not an estimate.

Voices offered (all stock voices shipped with the model; none is a clone of a real
person):

| Id | Label in the picker | Accent | Model-card grade |
| --- | --- | --- | --- |
| `af_heart` | Neural narrator · calm, female (default) | US | A |
| `bf_emma` | Neural narrator · measured, female | UK | B− |
| `am_michael` | Neural narrator · steady, male | US | C+ |

## 4. Fallback chain (and what the presenter is told)

| Tier | When | Status label |
| --- | --- | --- |
| Neural clips | Default, whenever the manifest loads | `VOICE · HIGH-QUALITY LOCAL MODEL` |
| System voice, per sentence | A clip fails to load or play (the rest of the line stays neural); the status counts the fallbacks | same label, detail "N sentences fell back to the system voice" |
| System voice | The presenter picks one, or the manifest is missing | `VOICE · SYSTEM FALLBACK` (amber) |
| Captions only | No voice at all | `CAPTIONS ONLY · NO VOICE AVAILABLE` |
| Muted / off | Presenter's choice | `VOICE MUTED · CAPTIONS` / `VOICE OFF · CAPTIONS` |

The label is computed from the tier actually in use (`narrator.status`), shown under the
voice picker on the BEGIN card and in ⚙, on the VOICE button's tooltip, and — whenever it
is not the neural voice — as an amber badge in the control bar. A fallback is never
hidden. The 9.1 Web Speech narrator is kept intact as the system tier.

## 5. Delivery metadata — only what takes effect

A beat may carry `prosody` per sentence (`src/nepal/briefing/speech.js`); the lint
rejects any other field.

| Field | Neural voice | System voice |
| --- | --- | --- |
| `pauseBefore`, `pauseAfter` (0–1500 ms) | Silence rendered into the clip | Timed gap on the briefing clock |
| `rate` (0.8–1.15) | Model speed | Utterance rate |
| `energy` (−2…+2, steps of 1.5 dB) | Gain rendered into the clip | Utterance volume |
| `emphasis` (phrases) | misaki stress links | **Not applied** — browsers ignore SSML, so the phrase is said plainly |

There is no `tone` field: neither engine can change one on request. Delivery is used
sparingly; the voice is meant to be calm, not theatrical. Example: scene 08 pauses after
"The days pass." so the on-screen clock can run to 12 May before the date is said.

## 6. Music research

| Option | Licence | Verdict |
| --- | --- | --- |
| Film or TV soundtracks, music ripped from video sites | Copyrighted | Excluded by the brief |
| YouTube Audio Library | Licence tied to use on YouTube | Not bundled |
| Pixabay Music | Pixabay Content Licence: free use, but no redistribution as a standalone file | Not bundled (an open repository redistributes the file) |
| Free Music Archive | Mixed CC licences, many NC/ND | Not bundled without a per-track check |
| Kevin MacLeod / incompetech | CC BY 4.0 | Usable with attribution; widely recognised stock sound |
| Freesound / OpenGameArt CC0 ambiences | CC0 | Usable; a fixed loop cannot follow the story's states |
| **Original score generated in the browser** | Written for this project | **Chosen** |

**The score** (`src/ui/nepal/briefing/score.js`) is a low pad — triangle and a little
sawtooth per note through a slowly breathing low-pass filter — with one state per act
(`src/nepal/briefing/music.js`): INCIDENT (open fifth), MAIN SHOCK (D minor with a slow
heartbeat pulse), EXPOSURE, DAMAGE (B♭ major seventh), COVERAGE GAP (suspended, with a
faint high shimmer), NETWORK, RESCUE ACCESS and EXECUTIVE SUMMARY. States crossfade over
3.5 s and change only when the act changes; NEXT and BACK inside an act leave the music
alone. Six moments — and only six — carry a musical cue: the main shock, the M7.3, the
first damage reveal, the coverage-gap reveal, the rescue disconnect and the executive
close. It imitates no composer or soundtrack, and there is no file to license.

## 7. Mixing

One AudioContext (`src/ui/nepal/briefing/audio.js`), three buses into a master
compressor-limiter (threshold −3 dB, ratio 20):

- **VOICE** 0.95 — dominant. Neural clips play through it (one `<audio>` element with
  pitch-preserving playback rate, routed once into the graph).
- **MUSIC** 0.32 — about 14 dB under the voice before ducking. When a sentence starts the
  duck gain glides to 0.32 (≈ −10 dB) in a quarter of a second; after the last sentence it
  waits 0.7 s and rises over 2 s. Ramps only; no cuts. Measured in Chromium: 0.32 during
  speech, 0.57 → 0.90 → 0.98 → 1.0 over the following seconds.
- **SFX** 0.5 — short accents (lock, reveal, trace, tick, pulse, a softened knock).

PAUSE fades the master to silence in 0.2 s and suspends the context; PLAY resumes it and
fades back. NEXT and BACK cancel the current narration at once (the duck releases); the
music keeps playing unless the act changes.

## 8. Loading

Nothing is fetched until the briefing starts or a preview is pressed. The manifest is
about 20 KB per voice. Clips are fetched one beat ahead (`prefetch`) and kept as blob URLs
in a 48-clip cache; a voice the presenter never chooses is never downloaded. The default
voice's whole script is about 4 MB, the 6 MIN run about a third of that.

## 9. Limitations

- Kokoro's training set (per its model card) includes public-domain and permissively
  licensed audio and synthetic audio from closed commercial TTS systems; the weights are
  Apache-2.0. The voices are the model's stock voices, not clones.
- Nepali place names are approximations in English phonemes.
- A system-voice fallback sounds like the presenter's machine, and its timing is an
  estimate; captions remain the reference.
- Emphasis exists only in the neural voice.
- No ASR intelligibility test was run; pronunciation was checked from the G2P's phoneme
  output, sentence by sentence, for the names and acronyms the briefing uses.
