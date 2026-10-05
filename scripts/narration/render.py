#!/usr/bin/env python3
"""
Render the briefing's narration clips with Kokoro-82M (Apache-2.0).

Build-time only: run by scripts/build-narration.mjs, never by the app or the
test suite. The browser plays the MP3s this writes; no model, phonemizer or
GPL code ships to it (see docs/NEPAL_2015_AUDIO_RESEARCH.md).

  python render.py JOBS.json OUT_DIR

Environment:
  KOKORO_DIR   directory with model.onnx, tokenizer.json and <voice>.bin
               (onnx-community/Kokoro-82M-v1.0-ONNX on Hugging Face)

Each job: {key, voice, british, input, speed, pauseBefore, pauseAfter, gainDb}.
`input` is misaki-marked text: [Word](/phonemes/) and [phrase](+1).
Writes OUT_DIR/<key>.mp3 unless it exists, and prints one JSON line per job:
{"key": ..., "ms": ..., "fallbackWords": [...]}.
"""
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import soundfile as sf
from misaki import en, espeak

try:  # espeak-ng is only the out-of-dictionary fallback; its data path must be set.
    import espeakng_loader
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
except Exception:  # pragma: no cover - fallback simply unavailable
    pass

RATE = 24000
TARGET_RMS_DB = -20.0  # speech loudness before the job's gain
PEAK_DB = -1.0
EDGE_MS = 70  # silence kept at each end after trimming


def g2p_for(british):
    try:
        fallback = espeak.EspeakFallback(british=british)
    except Exception:
        fallback = None
    return en.G2P(trf=False, british=british, fallback=fallback)


def trim(wav, threshold=0.01):
    voiced = np.flatnonzero(np.abs(wav) > threshold)
    if voiced.size == 0:
        return wav
    edge = int(RATE * EDGE_MS / 1000)
    return wav[max(0, voiced[0] - edge) : min(len(wav), voiced[-1] + edge)]


def normalise(wav, gain_db):
    voiced = wav[np.abs(wav) > 0.02]
    rms = np.sqrt(np.mean(voiced**2)) if voiced.size else 1e-6
    gain = 10 ** ((TARGET_RMS_DB + gain_db) / 20) / max(rms, 1e-6)
    out = wav * gain
    peak = np.max(np.abs(out)) or 1.0
    limit = 10 ** (PEAK_DB / 20)
    if peak > limit:
        out = out * (limit / peak)
    return out.astype(np.float32)


def main():
    jobs_path, out_dir = sys.argv[1], sys.argv[2]
    model_dir = os.environ["KOKORO_DIR"]
    jobs = json.load(open(jobs_path))
    vocab = json.load(open(os.path.join(model_dir, "tokenizer.json")))["model"]["vocab"]
    session = ort.InferenceSession(
        os.path.join(model_dir, "model.onnx"), providers=["CPUExecutionProvider"]
    )
    g2ps = {}
    voices = {}
    os.makedirs(out_dir, exist_ok=True)
    for job in jobs:
        path = os.path.join(out_dir, f"{job['key']}.mp3")
        if os.path.exists(path):
            info = sf.info(path)
            print(json.dumps({"key": job["key"], "ms": round(info.frames / info.samplerate * 1000), "cached": True}), flush=True)
            continue
        british = bool(job.get("british"))
        g2p = g2ps.setdefault(british, g2p_for(british))
        phonemes, tokens = g2p(job["input"])
        fallback_words = [t.text for t in (tokens or []) if getattr(t, "_", None) and getattr(t._, "rating", None) == 1]
        ids = [vocab[c] for c in phonemes if c in vocab]
        if len(ids) > 510:
            raise SystemExit(f"{job['key']}: {len(ids)} phonemes, over the model's 510")
        if job["voice"] not in voices:
            voices[job["voice"]] = np.fromfile(
                os.path.join(model_dir, f"{job['voice']}.bin"), dtype=np.float32
            ).reshape(-1, 1, 256)
        style = voices[job["voice"]][min(len(ids), len(voices[job["voice"]]) - 1)]
        wav = session.run(
            None,
            {
                "input_ids": np.array([[0, *ids, 0]], dtype=np.int64),
                "style": style,
                "speed": np.array([job.get("speed", 1.0)], dtype=np.float32),
            },
        )[0].reshape(-1)
        wav = normalise(trim(wav), job.get("gainDb", 0.0))
        before = np.zeros(int(RATE * job.get("pauseBefore", 0) / 1000), dtype=np.float32)
        after = np.zeros(int(RATE * job.get("pauseAfter", 0) / 1000), dtype=np.float32)
        out = np.concatenate([before, wav, after])
        sf.write(path, out, RATE, format="MP3", subtype="MPEG_LAYER_III", compression_level=0.62)
        print(
            json.dumps(
                {
                    "key": job["key"],
                    "ms": round(len(out) / RATE * 1000),
                    "phonemes": phonemes,
                    "fallbackWords": fallback_words,
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
