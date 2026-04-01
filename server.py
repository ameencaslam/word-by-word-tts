import base64
import re
import time
from typing import Any, Dict, List, Optional

import edge_tts
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(title="TTS-TOOL edge-tts server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VoicesResponseItem(BaseModel):
    shortName: str
    name: str
    gender: Optional[str] = None
    locale: Optional[str] = None


class TtsRequest(BaseModel):
    text: str = Field(min_length=1)
    voice: str = Field(min_length=1)  # e.g. "en-US-AriaNeural"
    rate: float = 1.0  # UI slider 0.5..2.0


class WordBoundaryItem(BaseModel):
    text: str
    startMs: float
    endMs: float


class TtsResponse(BaseModel):
    audioBase64: str  # mp3
    boundaries: List[WordBoundaryItem]

_voices_cache: list[VoicesResponseItem] = []
_voices_cache_ts: float = 0.0
_VOICES_CACHE_TTL_S = 60 * 60  # 1 hour


def _rate_to_edge(rate: float) -> str:
    # edge-tts expects strings like "+0%" or "-20%"
    if rate != rate:  # NaN
        rate = 1.0
    rate = max(0.5, min(2.0, float(rate)))
    pct = int(round((rate - 1.0) * 100))
    pct = max(-100, min(100, pct))
    return f"{pct:+d}%"


@app.get("/voices", response_model=list[VoicesResponseItem])
async def voices() -> List[VoicesResponseItem]:
    global _voices_cache, _voices_cache_ts

    now = time.time()
    if _voices_cache and (now - _voices_cache_ts) < _VOICES_CACHE_TTL_S:
        return _voices_cache

    try:
        vs = await edge_tts.list_voices()
    except Exception as e:
        # If Microsoft endpoint is down (503 etc.), keep server healthy and
        # return cached voices if we have them.
        if _voices_cache:
            return _voices_cache
        raise HTTPException(status_code=503, detail=f"edge-tts voices unavailable: {e!s}")

    out: List[VoicesResponseItem] = []
    for v in vs:
        locale = v.get("Locale")
        if not (isinstance(locale, str) and locale.lower().startswith("en-")):
            continue
        out.append(
            VoicesResponseItem(
                shortName=v.get("ShortName") or "",
                name=v.get("FriendlyName") or v.get("Name") or v.get("ShortName") or "",
                gender=v.get("Gender"),
                locale=locale,
            )
        )

    out.sort(key=lambda x: ((x.locale or "").lower(), (x.name or x.shortName).lower()))
    _voices_cache = out
    _voices_cache_ts = now
    return out


@app.post("/tts", response_model=TtsResponse)
async def tts(req: TtsRequest) -> TtsResponse:
    text = re.sub(r"\s+", " ", req.text).strip()
    try:
        communicate = edge_tts.Communicate(text=text, voice=req.voice, rate=_rate_to_edge(req.rate))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"edge-tts unavailable: {e!s}")

    audio = bytearray()
    boundaries: List[WordBoundaryItem] = []

    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset/duration are in 100-nanosecond units
                offset_100ns = float(chunk.get("offset", 0))
                dur_100ns = float(chunk.get("duration", 0))
                start_ms = offset_100ns / 10_000.0
                end_ms = (offset_100ns + dur_100ns) / 10_000.0
                boundaries.append(
                    WordBoundaryItem(
                        text=str(chunk.get("text", "")),
                        startMs=start_ms,
                        endMs=end_ms,
                    )
                )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"edge-tts stream failed: {e!s}")

    audio_b64 = base64.b64encode(bytes(audio)).decode("ascii")
    return TtsResponse(audioBase64=audio_b64, boundaries=boundaries)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
