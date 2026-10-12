"""Regenerate checked-in native icon assets (development dependency: Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
scale = 4
canvas = Image.new("RGBA", (512 * scale, 512 * scale))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((16 * scale, 16 * scale, 496 * scale, 496 * scale), 104 * scale, fill="#121a25")
def path(start, curves):
    points = [start]
    current = start
    for c1, c2, end in curves:
        for index in range(1, 81):
            t = index / 80
            points.append(tuple((1-t)**3 * current[i] + 3*(1-t)**2*t*c1[i] + 3*(1-t)*t*t*c2[i] + t**3*end[i] for i in (0, 1)))
        current = end
    draw.line([(round(x * scale), round(y * scale)) for x, y in points], fill="#69d1b4", width=22 * scale, joint="curve")
    for x, y in (points[0], points[-1]):
        draw.ellipse(((x-11)*scale, (y-11)*scale, (x+11)*scale, (y+11)*scale), fill="#69d1b4")
path((142,248), [((142,172),(192,124),(256,124)),((320,124),(370,172),(370,248)),((370,263),(370,278),(370,293))])
path((182,261), [((182,203),(211,165),(256,165)),((301,165),(330,203),(330,261)),((330,276),(330,290),(330,304)),((330,334),(323,364),(311,389))])
path((222,274), [((222,240),(234,216),(256,216)),((278,216),(290,240),(290,274)),((290,288),(290,301),(290,315)),((290,350),(280,381),(268,401))])
path((142,290), [((142,297),(142,304),(142,311)),((142,339),(136,364),(123,384))])
path((182,304), [((182,349),(173,376),(162,397))])
path((222,316), [((222,357),(214,382),(203,408))])
path((370,338), [((368,353),(365,367),(361,379))])
icon = canvas.resize((512, 512), Image.Resampling.LANCZOS)
icon.save(root / "build" / "icon.png")
icon.save(root / "build" / "icon.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
