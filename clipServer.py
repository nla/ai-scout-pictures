from PIL import Image
from transformers import AutoProcessor, AutoTokenizer, CLIPModel

import bottle

from json import dumps
# from bottle import send_file

import argparse
import torch

parser = argparse.ArgumentParser(description="Start a clip embedding server.")
parser.add_argument(
        "--port",
        type=int,
        help="Server port",
        required=True,
    )

args = parser.parse_args()


model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
# not enough memory, so had to stop vllm.  But then some other problem with image manip in clip.
# so bugger it, run on CPU..
# device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
# model.to(device)

tokenizer = AutoTokenizer.from_pretrained("openai/clip-vit-large-patch14")
imageProcessor = AutoProcessor.from_pretrained("openai/clip-vit-large-patch14")

print("model loaded!")

@bottle.error(405)
def method_not_allowed(res):
    """Adds headers to allow cross-origin requests to all OPTION requests.
    Essentially this allows requests from external domains to be processed."""
    if bottle.request.method == 'OPTIONS':
        new_res = bottle.HTTPResponse()
        new_res.set_header('Access-Control-Allow-Origin', '*')
        new_res.set_header('Access-Control-Allow-Headers', 'content-type')
        return new_res
    res.headers['Allow'] += ', OPTIONS'
    return bottle.request.app.default_error_handler(res)


@bottle.hook('after_request')
def enable_cors():
    """Sets the CORS header to `*` in all responses. This signals the clients
    that the response can be read by any domain."""
    bottle.response.set_header('Access-Control-Allow-Origin', '*')
    bottle.response.set_header('Access-Control-Allow-Headers', 'content-type')


@bottle.get('/getImageEmbedding')
def imageEmbedding():
    imagePath = bottle.request.query.imagePath
    print("Got imagePath ", imagePath) ;
    image = Image.open(imagePath)
    inputs = imageProcessor(images=image, return_tensors="pt")

    image_features = model.get_image_features(**inputs)
    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)

    print("got image features shape",  image_features.shape)

    b = []
    for y in image_features[0]:
        b.append(y.item())        

    return {dumps(b)}

@bottle.get('/getTextEmbedding')
def textEmbedding():
    text = bottle.request.query.text
    inputs = tokenizer(text, padding=True, return_tensors="pt")
    text_features = model.get_text_features(**inputs)
    text_features = text_features / text_features.norm(p=2, dim=-1, keepdim=True)

    b = []
    for y in text_features[0]:
        b.append(y.item())        

    return {dumps(b)}


bottle.run(port=args.port, server="cheroot")

