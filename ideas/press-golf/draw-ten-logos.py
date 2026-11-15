# Rough sketches for a possible rename to "Press Golf" (not in use). Run with python3; writes a PNG beside where it is run.
from PIL import Image, ImageDraw, ImageFont
B='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; SB='/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'; R='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
S=400; G=(13,33,26); O=(255,138,31); C=(246,241,227); D=(26,13,2); GR=(0,103,71); RED=(222,72,60); W=(255,255,255); N=(21,50,67)
F=lambda p,s: ImageFont.truetype(p,s)
def T(d,xy,t,f,fill): d.text(xy,t,font=f,fill=fill,anchor='mm')
def new(bg): im=Image.new('RGB',(S,S),bg); return im,ImageDraw.Draw(im)
def ball(d,cx,cy,r,fill=W,dot=(208,208,202)):
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=fill)
    for j in range(-3,4):
        for i in range(-3,4):
            x=cx+i*r*.28+(j%2)*r*.14; y=cy+j*r*.25
            if (x-cx)**2+(y-cy)**2<(r*.82)**2: d.ellipse([x-r*.06,y-r*.06,x+r*.06,y+r*.06],fill=dot)
def flag(d,x,y,h,col,pole,w=6):
    d.line([x,y,x,y-h],fill=pole,width=w); d.polygon([(x,y-h),(x+h*.55,y-h*.8),(x,y-h*.6)],fill=col)
def arrow(d,cx,top,w,h,fill):
    d.polygon([(cx,top),(cx+w/2,top+h*.45),(cx+w/5,top+h*.45),(cx+w/5,top+h),(cx-w/5,top+h),(cx-w/5,top+h*.45),(cx-w/2,top+h*.45)],fill=fill)
def L1():
    im,d=new(G); d.ellipse([70,62,330,282],fill=(140,60,10)); d.ellipse([70,40,330,260],fill=O)
    T(d,(200,150),'PRESS',F(B,66),D); T(d,(200,335),'GOLF',F(B,60),C); return im,'Press button'
def L2():
    im,d=new(O); T(d,(200,150),'PRESS',F(B,98),D); T(d,(170,262),'GOLF',F(B,98),C); arrow(d,330,205,84,110,D); return im,'Wordmark + arrow'
def L3():
    im,d=new(C); d.ellipse([28,28,372,372],fill=G); d.ellipse([52,52,348,348],outline=O,width=6)
    ball(d,200,158,52); d.polygon([(180,212),(220,212),(206,262),(194,262)],fill=O)
    T(d,(200,96),'PRESS',F(B,40),O); T(d,(200,300),'GOLF',F(B,44),C); return im,'Club badge'
def L4():
    im,d=new(G); ball(d,128,150,84); T(d,(128,150),'×2',F(B,84),GR); flag(d,262,236,170,O,C,8)
    T(d,(200,310),'PRESS GOLF',F(B,50),C); return im,'Double up'
def L5():  # big P with a flag as the stem
    im,d=new(G); T(d,(190,170),'P',F(SB,300),O); flag(d,300,150,90,C,C,7)
    T(d,(200,340),'PRESS GOLF',F(B,42),C); return im,'Big P'
def L6():  # red press button like the one in Our Match
    im,d=new(C); d.rounded_rectangle([40,108,360,232],62,fill=(150,40,32)); d.rounded_rectangle([40,92,360,216],62,fill=RED)
    T(d,(200,154),'PRESS',F(B,74),W); T(d,(200,300),'GOLF',F(B,82),G); return im,'Red button'
def L7():  # ball going in the hole
    im,d=new(GR); d.ellipse([90,205,310,275],fill=(4,50,36)); ball(d,200,190,62); d.rectangle([90,240,310,290],fill=GR); d.ellipse([90,205,310,275],outline=(4,50,36),width=0)
    d.chord([90,205,310,275],0,180,fill=(4,50,36)); flag(d,300,240,170,O,C,7)
    T(d,(200,75),'PRESS',F(B,62),C); T(d,(200,335),'GOLF',F(B,62),O); return im,'In the hole'
def L8():  # stamp
    im,d=new(C); d.rounded_rectangle([34,110,366,290],18,outline=RED,width=12); d.rounded_rectangle([52,128,348,272],10,outline=RED,width=4)
    T(d,(200,172),'PRESS',F(B,78),RED); T(d,(200,238),'GOLF',F(B,44),RED)
    im=im.rotate(8,resample=Image.BICUBIC,fillcolor=C); return im,'Stamp'
def L9():  # crossed clubs crest
    im,d=new(N); 
    for sx in (-1,1):
        d.line([200+sx*95,95,200-sx*70,270],fill=C,width=10); d.rounded_rectangle([200-sx*70-(34 if sx>0 else 0),262,200-sx*70+(34 if sx<0 else 0),288],8,fill=C)
    ball(d,200,150,34); T(d,(200,322),'PRESS GOLF',F(SB,46),O); T(d,(200,364),'EST. 2026',F(B,20),C); return im,'Crossed clubs'
def L10():  # scoreboard: 1 DOWN → PRESS
    im,d=new(D); d.rounded_rectangle([40,50,360,170],16,fill=G,outline=C,width=4); T(d,(200,110),'1 DOWN',F(B,62),C)
    arrow(d,200,182,70,60,O); im2=im.rotate(180); 
    im,d=new(D); d.rounded_rectangle([40,44,360,150],16,fill=G,outline=C,width=4); T(d,(200,97),'1 DOWN',F(B,58),C)
    d.polygon([(200,206),(240,168),(216,168),(216,160),(184,160),(184,168),(160,168)],fill=O)
    d.rounded_rectangle([40,216,360,322],53,fill=O); T(d,(200,269),'PRESS',F(B,66),D); T(d,(200,358),'GOLF',F(B,40),C); return im,'1 down? Press'
items=[f() for f in (L1,L2,L3,L4,L5,L6,L7,L8,L9,L10)]
out=Image.new('RGB',(5*460+40,2*540+10),(40,40,48)); d=ImageDraw.Draw(out)
for i,(im,sub) in enumerate(items):
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],90,fill=255); x=50+(i%5)*460; y=30+(i//5)*540
    out.paste(im,(x,y),m); T(d,(x+S/2,y+445),f'{i+1}. {sub}',F(R,30),(210,210,220))
out.resize((out.width//2,out.height//2),Image.LANCZOS).save('press10.png')
