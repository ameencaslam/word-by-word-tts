import base64
import re
from typing import Any, Dict, List, Optional

import edge_tts
from fastapi import FastAPI
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
    vs = await edge_tts.list_voices()
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
    return out


@app.post("/tts", response_model=TtsResponse)
async def tts(req: TtsRequest) -> TtsResponse:
    text = re.sub(r"\s+", " ", req.text).strip()
    communicate = edge_tts.Communicate(text=text, voice=req.voice, rate=_rate_to_edge(req.rate))

    audio = bytearray()
    boundaries: List[WordBoundaryItem] = []

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

    audio_b64 = base64.b64encode(bytes(audio)).decode("ascii")
    return TtsResponse(audioBase64=audio_b64, boundaries=boundaries)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
