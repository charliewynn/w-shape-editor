import json, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly

BASE = '/home/hatch/workspace/w-shape-editor'
v1 = json.load(open(f'{BASE}/polygon-user-v1.json'))['points']
if v1[0] == v1[-1]: v1 = v1[:-1]  # drop closing duplicate
assert len(v1) == 30, len(v1)
right0 = [p[:] for p in v1[:16]]
assert right0[0] == [2.5,1] and right0[15] == [2.5,2.5], right0[0]

def mirror(p): return [round(5-p[0],6), p[1]]
def build(right):
    return [p[:] for p in right] + [mirror(p) for p in reversed(right[1:-1])]
assert build(right0) == v1, "builder must reproduce v1"

def seg_int(a,b,c,d):
    def o(p,q,r): return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
    def on(p,q,r): return min(p[0],r[0])-1e-9<=q[0]<=max(p[0],r[0])+1e-9 and min(p[1],r[1])-1e-9<=q[1]<=max(p[1],r[1])+1e-9
    o1,o2,o3,o4 = o(a,b,c),o(a,b,d),o(c,d,a),o(c,d,b)
    if o1*o2<0 and o3*o4<0: return True
    return (o1==0 and on(a,c,b)) or (o2==0 and on(a,d,b)) or (o3==0 and on(c,a,d)) or (o4==0 and on(c,b,d))

def validate(name, poly):
    n = len(poly)
    sym_bad = [(i,p) for i,p in enumerate(poly)
               if not any(abs(q[0]-(5-p[0]))<1e-6 and abs(q[1]-p[1])<1e-6 for q in poly)]
    xs = []
    for i in range(n):
        a,b = poly[i], poly[(i+1)%n]
        for j in range(i+1,n):
            if len({i,(i+1)%n,j,(j+1)%n}) < 4: continue
            c,d = poly[j], poly[(j+1)%n]
            if seg_int(a,b,c,d): xs.append((i,j))
    area = sum(poly[i][0]*poly[(i+1)%n][1]-poly[(i+1)%n][0]*poly[i][1] for i in range(n))/2
    ok = not sym_bad and not xs and area > 0
    print(f"{name}: n={n} symmetric={not sym_bad} simple={not xs} area={area:.1f} -> {'OK' if ok else 'FAIL'}")
    return ok

CANDS = [
    ("A", "yours v1 (baseline)", {}),
    ("B", "feet to the floor", {1:[3,0],2:[3.5,0],3:[4,0],4:[4.5,0.75],5:[5,1.25]}),
    ("C", "higher middle peak", {15:[2.5,3],14:[3,2.25],13:[3.5,1.75]}),
    ("D", "deeper bottom V", {0:[2.5,0.5],1:[2.75,0.5]}),
    ("E", "slimmer inner stems", {10:[4.25,5],11:[4.25,4],12:[4.25,2],13:[3.6,1.5]}),
    ("F", "bolder outer chamfers", {3:[4,0.75],4:[4.5,1.25],5:[5,1.75]}),
    ("G", "floor feet + high peak", {1:[3,0],2:[3.5,0],3:[4,0],4:[4.5,0.75],5:[5,1.25],15:[2.5,3],14:[3,2.25],13:[3.5,1.75]}),
]

def draw(poly, title, path, size=5):
    fig, ax = plt.subplots(figsize=(size,size), dpi=110)
    ax.set_xlim(-0.3,5.3); ax.set_ylim(-0.3,5.3); ax.set_aspect('equal')
    for v in [i*0.5 for i in range(11)]:
        ax.axvline(v, color='#d8d2c4' if v*2==int(v*2) else '#ece7da', lw=1)
        ax.axhline(v, color='#d8d2c4' if v*2==int(v*2) else '#ece7da', lw=1)
    ax.axvline(2.5, color='#d88', ls=(0,(5,4)), lw=1.5)
    ax.add_patch(MplPoly(poly, closed=True, facecolor='#C68E5F', edgecolor='#8B5E3C', lw=2, alpha=0.9, zorder=3))
    xs=[p[0] for p in poly]; ys=[p[1] for p in poly]
    ax.scatter(xs, ys, c='#d33', s=28, zorder=4, edgecolors='white', linewidths=0.8)
    ax.set_title(title, fontsize=13); ax.set_xticks([]); ax.set_yticks([])
    for s_ in ('top','right','left','bottom'): ax.spines[s_].set_visible(False)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)

all_ok = True
for key, name, ov in CANDS:
    right = [p[:] for p in right0]
    for i, p in ov.items(): right[i] = p
    poly = build(right)
    ok = validate(f"{key} {name}", poly)
    all_ok &= ok
    json.dump({"name": f"W candidate {key}: {name}", "points": poly},
              open(f'{BASE}/candidates/w-{key}.json','w'), indent=1)
    draw(poly, f"{key} · {name}", f'{BASE}/candidates/w-{key}.png')

# contact sheet
fig, axes = plt.subplots(2, 4, figsize=(16,8.4), dpi=110)
for ax, (key,name,_) in zip(axes.flat, CANDS):
    poly = json.load(open(f'{BASE}/candidates/w-{key}.json'))['points']
    ax.set_xlim(-0.3,5.3); ax.set_ylim(-0.3,5.3); ax.set_aspect('equal')
    for v in [i*0.5 for i in range(11)]:
        ax.axvline(v, color='#e5e0d2', lw=0.8); ax.axhline(v, color='#e5e0d2', lw=0.8)
    ax.axvline(2.5, color='#d88', ls=(0,(5,4)), lw=1.2)
    ax.add_patch(MplPoly(poly, closed=True, facecolor='#C68E5F', edgecolor='#8B5E3C', lw=1.6, alpha=0.9))
    ax.set_title(f"{key} · {name}", fontsize=11); ax.set_xticks([]); ax.set_yticks([])
    for s_ in ('top','right','left','bottom'): ax.spines[s_].set_visible(False)
axes.flat[-1].axis('off')
fig.suptitle('W candidates — critique away', fontsize=15)
fig.tight_layout(); fig.savefig(f'{BASE}/candidates/contact-sheet.png')
print("contact sheet saved; all_ok =", all_ok)
