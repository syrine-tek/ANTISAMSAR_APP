import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import os
import json
import requests
from io import BytesIO

# Set HF cache to D drive
if not os.environ.get("HF_HOME"):
    os.environ["HF_HOME"] = "D:/.cache/huggingface"

MODEL_ID = "laion/CLIP-vit-base-patch32-laion2B-s34B-b79K"

class CLIPService:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading CLIP model on {self.device}...")
        self.model = CLIPModel.from_pretrained(MODEL_ID).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(MODEL_ID)
        self.tags_prompts = [
            "a modern villa", "luxurious house", "swimming pool", "a beautiful garden",
            "sea view", "modern apartment", "professional office", "terrace",
            "parking space", "low quality image", "high quality image"
        ]
        self.tag_labels = [
            "moderne", "luxueux", "piscine", "jardin", 
            "vue mer", "appartement moderne", "bureau", "terrasse", 
            "parking", "basse_qualité", "haute_qualité"
        ]

    def _load_image(self, image_path):
        if image_path.startswith(('http://', 'https://')):
            response = requests.get(image_path)
            image = Image.open(BytesIO(response.content)).convert("RGB")
        else:
            image = Image.open(image_path).convert("RGB")
        return image

    @torch.inference_mode()
    def get_image_embedding(self, image_path):
        image = self._load_image(image_path)
        inputs = self.processor(images=image, return_tensors="pt").to(self.device)
        image_features = self.model.get_image_features(**inputs)
        # Normalize
        image_features /= image_features.norm(dim=-1, keepdim=True)
        return image_features.cpu().numpy().tolist()[0]

    @torch.inference_mode()
    def get_image_tags(self, image_path, threshold=0.25):
        try:
            image = self._load_image(image_path)
        except Exception as e:
            print(f"Error loading image {image_path}: {e}")
            return []
            
        inputs = self.processor(
            text=self.tags_prompts, 
            images=image, 
            return_tensors="pt", 
            padding=True
        ).to(self.device)
        
        outputs = self.model(**inputs)
        logits_per_image = outputs.logits_per_image # this is the image-text similarity score
        probs = logits_per_image.softmax(dim=1).cpu().numpy()[0]
        
        results = []
        for i, prob in enumerate(probs):
            if prob > threshold:
                results.append({
                    "tag": self.tag_labels[i],
                    "score": float(prob)
                })
        
        # Sort by score
        results = sorted(results, key=lambda x: x["score"], reverse=True)
        return results

if __name__ == "__main__":
    # Example usage script
    service = CLIPService()
    # test_image = "path/to/image.jpg"
    # if os.path.exists(test_image):
    #     emb = service.get_image_embedding(test_image)
    #     tags = service.get_image_tags(test_image)
    #     print(json.dumps({"embedding": emb[:5], "tags": tags}, indent=2))
