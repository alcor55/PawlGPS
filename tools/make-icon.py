"""Rebuild the original satellite icon and Espruino 1-bit image string."""
from PIL import Image, ImageDraw
import base64
from pathlib import Path
root = Path(__file__).resolve().parent.parent
im = Image.new('1', (48, 48), 0)
d = ImageDraw.Draw(im)
d.polygon([(16,13),(31,28),(25,34),(10,19)], fill=1)
d.polygon([(5,3),(17,8),(11,20),(0,15)], fill=1)
d.polygon([(33,26),(47,32),(41,45),(28,39)], fill=1)
d.line([(13,10),(8,17)], fill=0,width=1)
d.line([(37,29),(32,37)], fill=0,width=1)
d.line([(26,19),(35,10)],fill=1,width=3)
d.arc((25,0,46,21),0,90,fill=1,width=2)
d.arc((29,4,42,17),0,90,fill=1,width=2)
d.ellipse((32,8,36,12),fill=1)
rgba = Image.new('RGBA',im.size,(0,0,0,0))
rgba.paste((0,110,210,255),(0,0,48,48),im.convert('L'))
rgba.save(root/'app-icon.png')
# 48x48, 1bpp, transparent colour index 0. Foreground follows launcher colour.
raw=bytes([48,48,0x81,0])+im.tobytes()
(root/'icon.js').write_text('atob("'+base64.b64encode(raw).decode()+'")\n')
