# Rough sketches for a possible rename to "Press Golf" (not in use). Run with python3; writes a PNG beside where it is run.
from PIL import Image, ImageDraw, ImageFont
B='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; R='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
S=400; G=(13,33,26); O=(255,138,31); C=(246,241,227); D=(26,13,2); GR=(0,103,71); W=(255,255,255)
F=lambda p,s: ImageFont.truetype(p,s)
def T(d,xy,t,f,fill): d.text(xy,t,font=f,fill=fill,anchor='mm')
def logo(word=None, band=None, txt=None, bg=G, golf=C):
    im=Image.new('RGB',(S,S),bg); d=ImageDraw.Draw(im)
    if not word:
        d.ellipse([70,62,330,282],fill=(140,60,10)); d.ellipse([70,40,330,260],fill=O)
        T(d,(200,150),'PRESS',F(B,66),D); T(d,(200,335),'GOLF',F(B,60),golf); return im
    bh=96
    d.ellipse([92,44,308,222],fill=(140,60,10)); d.ellipse([92,26,308,204],fill=O)
    T(d,(200,115),'PRESS',F(B,54),D); T(d,(200,262),'GOLF',F(B,48),golf)
    d.rectangle([0,S-bh,S,S],fill=band); size=58; f=F(B,size)
    while d.textlength(word,font=f)>S*.88: size-=2; f=F(B,size)
    T(d,(200,S-bh/2-2),word,f,txt); return im
items=[(logo(),'Press Golf','no banner'),(logo('TOURNAMENT',GR,W),'Press Golf','TOURNAMENT'),(logo('SCORE',GR,W),'Press Golf','SCORE'),(logo('LIVE',O,D,bg=C,golf=G),'Press Live','LIVE (light)'),(logo('LIVE',C,D),'Press Live','LIVE (dark)')]
out=Image.new('RGB',(5*460+40,560),(40,40,48)); d=ImageDraw.Draw(out)
for i,(im,name,sub) in enumerate(items):
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],90,fill=255); x=50+i*460
    out.paste(im,(x,30),m); T(d,(x+S/2,468),name,F(B,36),W); T(d,(x+S/2,516),sub,F(R,28),(170,170,180))
out.resize((out.width//2,out.height//2),Image.LANCZOS).save('pressband.png')
