from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import torch
import logging
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from transformers import AutoTokenizer, AutoModelForCausalLM

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("antisamsar-rag-server")

MODEL_ID = "microsoft/Phi-3-mini-4k-instruct"

model = None
tokenizer = None
mode = "none"
device_str = "cuda" if torch.cuda.is_available() else "cpu"
executor = ThreadPoolExecutor(max_workers=1)

AIRLLM_AVAILABLE = False
AirLLMAutoModel = None
AIRLLM_IMPORT_ERROR = None

try:
    from airllm import AutoModel as AirLLMAutoModel
    AIRLLM_AVAILABLE = True
except Exception as e:
    AIRLLM_IMPORT_ERROR = str(e)
    AIRLLM_AVAILABLE = False


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    max_tokens: int = Field(default=300, ge=1, le=1000)
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, tokenizer, mode, device_str

    logger.info("AntiSamsar RAG LLM Server starting")
    logger.info(f"MODEL_ID={MODEL_ID}")
    logger.info(f"DEVICE={device_str}")

    try:
        logger.info(f"Loading tokenizer: {MODEL_ID}")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)

        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token

    except Exception as e:
        logger.exception("Tokenizer loading failed")
        tokenizer = None
        mode = "none"
        yield
        return

    if AIRLLM_AVAILABLE:
        try:
            logger.info("Trying REAL AirLLM engine")
            model = AirLLMAutoModel.from_pretrained(MODEL_ID)
            mode = "real-airllm"
            logger.info("REAL AirLLM model loaded successfully")
        except Exception as e:
            logger.warning(f"AirLLM failed to load: {e}")
            logger.warning("Falling back to HuggingFace Transformers")
            model = None
    else:
        logger.warning(f"AirLLM not available. Import error: {AIRLLM_IMPORT_ERROR}")
        logger.warning("Using HuggingFace Transformers fallback")

    if model is None:
        try:
            logger.info(f"Loading Transformers fallback on {device_str}")

            dtype = torch.float16 if device_str == "cuda" else torch.float32

            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                torch_dtype=dtype,
                low_cpu_mem_usage=True,
                trust_remote_code=True,
            )

            model.to(device_str)
            model.eval()
            mode = "transformers-fallback"

            logger.info("Transformers fallback model loaded successfully")

        except Exception as e:
            logger.exception(f"Transformers fallback failed: {e}")
            model = None
            mode = "none"

    yield

    logger.info("Shutting down AntiSamsar RAG LLM Server")
    try:
        executor.shutdown(wait=False, cancel_futures=True)
    except Exception:
        pass


app = FastAPI(
    title="AntiSamsar RAG Server",
    description="FastAPI LLM server with AirLLM first and Transformers fallback.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok" if model is not None and tokenizer is not None else "error",
        "mode": mode,
        "engine": "airllm" if mode == "real-airllm" else "transformers",
        "model": MODEL_ID,
        "device": device_str,
        "airllmAvailable": AIRLLM_AVAILABLE,
        "airllmImportError": AIRLLM_IMPORT_ERROR,
        "modelLoaded": model is not None,
        "tokenizerLoaded": tokenizer is not None,
    }


def build_chat_prompt(prompt: str) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "Tu es un conseiller immobilier expert en Tunisie. "
                "Réponds uniquement en français. "
                "Utilise uniquement les données fournies. "
                "N'invente jamais un prix, une ville, une surface ou un équipement."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    except Exception:
        return (
            "Système: Tu es un conseiller immobilier expert en Tunisie. "
            "Réponds uniquement en français et n'invente aucune information.\n\n"
            f"Utilisateur: {prompt}\n\nAssistant:"
        )


def generate_with_transformers(text: str, max_tokens: int, temperature: float) -> str:
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=4096,
    ).to(device_str)

    do_sample = temperature > 0

    generation_kwargs = {
        "max_new_tokens": max_tokens,
        "do_sample": do_sample,
        "pad_token_id": tokenizer.eos_token_id,
        "eos_token_id": tokenizer.eos_token_id,
    }

    if do_sample:
        generation_kwargs["temperature"] = temperature
        generation_kwargs["top_p"] = 0.9

    with torch.no_grad():
        output_ids = model.generate(**inputs, **generation_kwargs)

    generated_part = output_ids[0][inputs["input_ids"].shape[-1]:]
    return tokenizer.decode(generated_part, skip_special_tokens=True).strip()


def generate_with_airllm(text: str, max_tokens: int, temperature: float) -> str:
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=4096,
    )

    input_ids = inputs["input_ids"]

    do_sample = temperature > 0
    airllm_kwargs = {"max_new_tokens": max_tokens}
    if do_sample:
        airllm_kwargs["do_sample"] = True
        airllm_kwargs["temperature"] = temperature

    with torch.no_grad():
        output = model.generate(
            input_ids,
            **airllm_kwargs,
        )

    if hasattr(output, "sequences"):
        output_ids = output.sequences[0]
    elif isinstance(output, torch.Tensor):
        output_ids = output[0]
    elif isinstance(output, list):
        first = output[0]
        if isinstance(first, torch.Tensor):
            output_ids = first
        else:
            return str(first).strip()
    else:
        return str(output).strip()

    generated_part = output_ids[input_ids.shape[-1]:]
    return tokenizer.decode(generated_part, skip_special_tokens=True).strip()


def generate_text_sync(prompt: str, max_tokens: int, temperature: float) -> str:
    if model is None or tokenizer is None:
        raise RuntimeError("Model or tokenizer not loaded")

    formatted_prompt = build_chat_prompt(prompt)

    logger.info(
        f"Starting generation | mode={mode} | promptChars={len(prompt)} | "
        f"max_tokens={max_tokens} | temperature={temperature}"
    )

    if mode == "real-airllm":
        return generate_with_airllm(formatted_prompt, max_tokens, temperature)

    if mode == "transformers-fallback":
        return generate_with_transformers(formatted_prompt, max_tokens, temperature)

    raise RuntimeError("No valid model mode loaded")


@app.post("/generate")
async def generate(req: GenerateRequest):
    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Model is not loaded",
                "mode": mode,
                "airllmImportError": AIRLLM_IMPORT_ERROR,
            },
        )

    start = time.time()
    loop = asyncio.get_running_loop()

    try:
        text = await loop.run_in_executor(
            executor,
            generate_text_sync,
            req.prompt,
            req.max_tokens,
            req.temperature,
        )

        return {
            "text": text,
            "mode": mode,
            "engine": "airllm" if mode == "real-airllm" else "transformers",
            "model": MODEL_ID,
            "device": device_str,
            "processingTimeMs": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.exception("Generation failed")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Generation failed",
                "error": str(e),
                "mode": mode,
            },
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server_fixed:app",
        host="0.0.0.0",
        port=8000,
        timeout_keep_alive=300,
        limit_concurrency=2,
        reload=False,
    )
