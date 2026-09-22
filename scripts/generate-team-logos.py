#!/usr/bin/env python3
"""Generate 12 consistent WURI table-tennis team crests."""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "team-logos"
OUT.mkdir(parents=True, exist_ok=True)

TEAMS = [
    dict(code="A01", slug="happy-da", name="快樂Da桌球", primary="#FFC928", secondary="#092A4C", accent="#FFFFFF", motif="happy"),
    dict(code="A02", slug="dream-wings", name="夢幻羽翼", primary="#6C4AE2", secondary="#19C3D1", accent="#FFFFFF", motif="wings"),
    dict(code="A03", slug="good-ball", name="好球隊", primary="#1261A0", secondary="#F5B82E", accent="#FFFFFF", motif="star"),
    dict(code="A04", slug="sanmei", name="小三美日", primary="#E94F64", secondary="#1D8A8A", accent="#FFF7E8", motif="sunrise"),
    dict(code="A05", slug="uncles", name="叔叔沒練球", primary="#A92A2A", secondary="#242424", accent="#F5D7A5", motif="moustache"),
    dict(code="A06", slug="sunshine-boys", name="陽光男孩", primary="#F47B20", secondary="#118AB2", accent="#FFF4C7", motif="sun"),
    dict(code="B01", slug="our-team", name="我們這一隊", primary="#11875D", secondary="#123B55", accent="#FFFFFF", motif="unity"),
    dict(code="B02", slug="liu-jia-chang", name="劉家昌", primary="#1B2B4B", secondary="#CFA63C", accent="#FFFFFF", motif="monogram"),
    dict(code="B03", slug="wuri-youth", name="烏日少年", primary="#E43D30", secondary="#151515", accent="#FFFFFF", motif="youth"),
    dict(code="B04", slug="all-rivers", name="海納百川", primary="#075985", secondary="#22C1C3", accent="#E9FCFF", motif="wave"),
    dict(code="B05", slug="south-gate-dragon", name="南門金龍", primary="#B62025", secondary="#DFAE2B", accent="#FFF3C4", motif="dragon"),
    dict(code="B06", slug="fuji", name="富士山", primary="#273C75", secondary="#E86B8B", accent="#FFFFFF", motif="fuji"),
]

MOTIFS = {
"happy": '''<g stroke="#092A4C" stroke-width="14" stroke-linecap="round"><circle cx="256" cy="227" r="92" fill="#FFC928"/><circle cx="224" cy="207" r="8" fill="#092A4C" stroke="none"/><circle cx="288" cy="207" r="8" fill="#092A4C" stroke="none"/><path d="M215 247 Q256 285 297 247" fill="none"/><path d="M322 128 L354 92"/><circle cx="374" cy="72" r="22" fill="#fff" stroke="#092A4C"/></g>''',
"wings": '''<g fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="213" r="55" fill="#fff" stroke="#19C3D1"/><path d="M199 205 Q139 142 92 186 Q139 200 172 239 Q126 229 109 260 Q164 276 216 250"/><path d="M313 205 Q373 142 420 186 Q373 200 340 239 Q386 229 403 260 Q348 276 296 250"/><path d="M244 190 Q256 205 268 190" stroke="#6C4AE2"/></g>''',
"star": '''<g stroke="#F5B82E" stroke-width="13" stroke-linejoin="round"><path d="M256 116 L283 181 L354 187 L300 233 L316 303 L256 266 L196 303 L212 233 L158 187 L229 181 Z" fill="#F5B82E"/><circle cx="256" cy="218" r="43" fill="#fff" stroke="#1261A0"/><path d="M330 126 Q380 96 399 130" fill="none" stroke="#fff" stroke-linecap="round"/></g>''',
"sunrise": '''<g stroke="#FFF7E8" stroke-width="12" stroke-linecap="round"><path d="M147 275 Q256 142 365 275" fill="#E94F64"/><path d="M117 283 H395"/><path d="M145 315 Q204 278 256 315 Q308 352 367 315" fill="none"/><circle cx="256" cy="225" r="44" fill="#FFF7E8" stroke="#1D8A8A"/><g stroke="#FFF7E8"><path d="M256 137 V108"/><path d="M190 160 L171 137"/><path d="M322 160 L341 137"/></g></g>''',
"moustache": '''<g stroke="#242424" stroke-width="13" stroke-linejoin="round"><circle cx="256" cy="205" r="74" fill="#F5D7A5"/><path d="M250 230 Q215 197 173 232 Q210 274 256 242 Q302 274 339 232 Q297 197 262 230" fill="#242424"/><path d="M220 191 Q234 180 244 192 M268 192 Q279 180 293 191" fill="none" stroke-linecap="round"/><path d="M322 115 L361 76"/><circle cx="378" cy="59" r="20" fill="#fff"/></g>''',
"sun": '''<g stroke="#FFF4C7" stroke-width="13" stroke-linecap="round"><circle cx="256" cy="215" r="70" fill="#F47B20"/><g><path d="M256 111 V78"/><path d="M256 352 V319"/><path d="M152 215 H119"/><path d="M393 215 H360"/><path d="M183 142 L160 119"/><path d="M329 142 L352 119"/><path d="M183 288 L160 311"/><path d="M329 288 L352 311"/></g><path d="M223 220 Q256 252 289 220" fill="none"/><circle cx="230" cy="196" r="7" fill="#FFF4C7" stroke="none"/><circle cx="282" cy="196" r="7" fill="#FFF4C7" stroke="none"/></g>''',
"unity": '''<g fill="none" stroke="#fff" stroke-width="15"><circle cx="256" cy="206" r="50" fill="#fff" stroke="#123B55"/><circle cx="170" cy="238" r="38"/><circle cx="342" cy="238" r="38"/><path d="M194 297 Q256 256 318 297" stroke-linecap="round"/><path d="M133 304 Q170 279 205 300 M307 300 Q342 279 379 304" stroke-linecap="round"/><circle cx="256" cy="206" r="13" fill="#11875D" stroke="none"/></g>''',
"monogram": '''<g><circle cx="256" cy="211" r="99" fill="#1B2B4B" stroke="#CFA63C" stroke-width="14"/><text x="256" y="235" text-anchor="middle" fill="#fff" font-family="Arial Black,Arial" font-size="66" font-weight="900">LJC</text><path d="M174 282 Q256 326 338 282" fill="none" stroke="#CFA63C" stroke-width="14"/><circle cx="365" cy="119" r="25" fill="#fff" stroke="#CFA63C" stroke-width="10"/></g>''',
"youth": '''<g stroke="#fff" stroke-width="13" stroke-linejoin="round"><path d="M142 277 L256 121 L370 277 Z" fill="#151515"/><circle cx="256" cy="178" r="42" fill="#E43D30"/><path d="M180 292 Q256 253 332 292" fill="none" stroke-linecap="round"/><path d="M348 145 Q383 114 405 145" fill="none" stroke-linecap="round"/><circle cx="417" cy="132" r="17" fill="#fff" stroke="#151515"/></g>''',
"wave": '''<g fill="none" stroke="#E9FCFF" stroke-width="15" stroke-linecap="round"><path d="M103 247 Q168 176 228 241 Q286 304 350 230 Q385 190 418 222 Q365 343 252 314 Q158 337 103 247 Z" fill="#22C1C3"/><path d="M126 274 Q183 235 233 278 Q285 320 344 267"/><circle cx="305" cy="171" r="45" fill="#fff" stroke="#075985"/><path d="M287 151 Q305 170 323 151" stroke="#22C1C3"/></g>''',
"dragon": '''<g fill="none" stroke="#FFF3C4" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"><path d="M129 293 H383 M154 293 V184 H358 V293 M137 184 H375 L342 143 H170 Z"/><path d="M205 263 Q188 207 241 195 Q292 183 306 143 Q361 180 329 233 Q307 272 257 254 Q222 242 226 219"/><circle cx="296" cy="177" r="7" fill="#FFF3C4" stroke="none"/><path d="M318 154 L344 128 M284 154 L270 123"/></g>''',
"fuji": '''<g stroke="#fff" stroke-width="13" stroke-linejoin="round"><path d="M111 300 L256 116 L401 300 Z" fill="#273C75"/><path d="M197 192 L228 203 L256 168 L286 204 L315 191 L256 116 Z" fill="#fff"/><path d="M119 314 Q176 280 231 311 Q290 343 393 300" fill="none" stroke="#E86B8B" stroke-linecap="round"/><circle cx="365" cy="142" r="25" fill="#fff" stroke="#E86B8B"/></g>'''
}

def svg(team):
    fs = 28 if len(team['name']) >= 6 else 33
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
<title id="title">{escape(team['name'])}隊徽</title><desc id="desc">烏日桌協聯賽 {escape(team['code'])} 隊徽</desc>
<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".28"/></filter><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{team['primary']}"/><stop offset="1" stop-color="{team['secondary']}"/></linearGradient></defs>
<circle cx="256" cy="256" r="231" fill="url(#bg)" stroke="{team['secondary']}" stroke-width="18" filter="url(#shadow)"/>
<circle cx="256" cy="256" r="201" fill="none" stroke="{team['accent']}" stroke-width="6" opacity=".9"/>
<text x="256" y="78" text-anchor="middle" fill="{team['accent']}" font-family="Arial,sans-serif" font-size="21" font-weight="800" letter-spacing="5">WURI TT · {team['code']}</text>
{MOTIFS[team['motif']]}
<path d="M72 349 Q256 314 440 349 L418 424 Q256 455 94 424 Z" fill="{team['secondary']}" stroke="{team['accent']}" stroke-width="6"/>
<text x="256" y="395" text-anchor="middle" dominant-baseline="middle" fill="{team['accent']}" font-family="Noto Sans TC,PingFang TC,Microsoft JhengHei,sans-serif" font-size="{fs}" font-weight="900" letter-spacing="1">{escape(team['name'])}</text>
<circle cx="256" cy="463" r="9" fill="{team['accent']}"/><path d="M222 463 H180 M290 463 H332" stroke="{team['accent']}" stroke-width="5" stroke-linecap="round"/>
</svg>'''

manifest=[]
for team in TEAMS:
    filename=f"{team['code']}-{team['slug']}.svg"
    (OUT/filename).write_text(svg(team),encoding="utf-8")
    manifest.append({k:team[k] for k in ('code','slug','name','primary','secondary')}|{'svg':filename})
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'count':len(manifest),'files':[x['svg'] for x in manifest]},ensure_ascii=False,indent=2))
