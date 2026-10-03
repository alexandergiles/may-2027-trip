# Downsize to max 1400px wide (q82) and write images.js from the manifest.
import json, os
from PIL import Image, ImageOps
MF='tools/manifest.json'
m=json.load(open(MF))
total=0
for x in m:
    im=ImageOps.exif_transpose(Image.open(x['file'])).convert("RGB")
    if im.width>1400: im=im.resize((1400, round(im.height*1400/im.width)), Image.LANCZOS)
    im.save(x['file'], quality=82, optimize=True, progressive=True)
    total+=os.path.getsize(x['file'])
order={'lisbon-porto':0,'london-highlands-rail':1,'swiss-lucerne-bo':2,'bavaria-munich-garmisch':3,'berlin-dresden-prague':4}
m.sort(key=lambda x:(order.get(x['sketch'],9)))
out=["/* images.js — photos for shortlist.html. Downloaded from Wikimedia Commons by keyword",
     "   and reviewed by eye. One entry per photo; `sketch` is the sub-option id from data.js.",
     "   A caption ending in \"— day N\" attaches the photo to day N of that sketch's plan.",
     "   To add a photo: drop a JPEG in img/ and add an entry here. Credits are kept for the record. */",
     "window.TRIP_IMAGES = ["]
for x in m:
    e={k:x[k] for k in ('sketch','slug','file','caption','title','artist','license','page')}
    out.append("  "+json.dumps(e, ensure_ascii=False)+",")
out.append("];")
open('images.js','w').write("\n".join(out)+"\n")
print("images.js:", len(m), "entries; img/ total MB:", round(total/1e6,1))
