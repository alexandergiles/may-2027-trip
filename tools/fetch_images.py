import json, re, time, urllib.request, urllib.parse, os, sys
from PIL import Image, ImageDraw, ImageFont

UA = "may2027-trip-planner/1.0 (personal family project; python-urllib)"
API = "https://commons.wikimedia.org/w/api.php"

# (sketch id, slug, search query, caption)
WANT = [
 ("lisbon-porto","lis-tram28","Tram 28 Alfama Lisbon","Tram 28 rattling through Alfama — day 2"),
 ("lisbon-porto","lis-castelo","Castelo de São Jorge Lisbon peacock","Castelo de São Jorge ramparts (and peacocks) — day 2"),
 ("lisbon-porto","lis-oceanario","Oceanário de Lisboa main tank","Oceanário de Lisboa, the air-con escape — day 2"),
 ("lisbon-porto","lis-pena","Pena Palace Sintra","Pena Palace, Sintra — day 3"),
 ("lisbon-porto","lis-regaleira","Quinta da Regaleira initiation well","Quinta da Regaleira initiation well — day 3"),
 ("lisbon-porto","lis-cascais","Praia da Rainha Cascais","Cascais beach day by suburban train — day 4"),
 ("lisbon-porto","lis-alfa","Alfa Pendular Comboios de Portugal","Alfa Pendular, the 3-hour Lisbon–Porto leg — day 5"),
 ("lisbon-porto","por-ribeira","Porto Ribeira Dom Luís I Bridge","Porto's Ribeira and the Dom Luís I bridge — day 5"),
 ("lisbon-porto","por-lello","Livraria Lello staircase Porto","Livraria Lello — day 6"),
 ("lisbon-porto","por-douro","Pinhão Douro valley vineyards river","Douro Valley by train to Pinhão — day 7"),

 ("london-highlands-rail","lon-nhm","Natural History Museum London Hintze Hall","Natural History Museum, Hintze Hall — day 2"),
 ("london-highlands-rail","lon-tower","Tower of London","Tower of London, Crown Jewels and ravens — day 2"),
 ("london-highlands-rail","lon-lner","LNER Azuma train","LNER Azuma, King's Cross to Edinburgh in 4h20 — day 4"),
 ("london-highlands-rail","edi-castle","Edinburgh Castle Princes Street Gardens","Edinburgh Castle — day 5"),
 ("london-highlands-rail","edi-arthurs","Arthur's Seat Edinburgh","Arthur's Seat — day 5"),
 ("london-highlands-rail","edi-bassrock","Bass Rock gannets North Berwick","Bass Rock gannets from North Berwick — day 6"),
 ("london-highlands-rail","hi-whl","West Highland Line Rannoch Moor train","West Highland Line across Rannoch Moor — day 7"),
 ("london-highlands-rail","hi-glenfinnan","Glenfinnan Viaduct Jacobite steam","The Jacobite over Glenfinnan Viaduct — day 8"),
 ("london-highlands-rail","hi-morar","Silver Sands of Morar beach","Silver Sands of Morar — day 8"),
 ("london-highlands-rail","hi-glencoe","Glencoe Three Sisters","Glencoe — day 9"),

 ("swiss-lucerne-bo","luz-kapell","Kapellbrücke Lucerne","Chapel Bridge, Lucerne — day 1"),
 ("swiss-lucerne-bo","luz-pilatus","Pilatusbahn cogwheel railway","Pilatus cogwheel, the steepest in the world — day 2"),
 ("swiss-lucerne-bo","luz-steamer","Lake Lucerne paddle steamer Vierwaldstättersee","Paddle steamer on Lake Lucerne — day 2"),
 ("swiss-lucerne-bo","luz-verkehrshaus","Verkehrshaus der Schweiz Luzern","Swiss Museum of Transport — day 3"),
 ("swiss-lucerne-bo","bo-bruenig","Zentralbahn Brünig Brienzersee train","Luzern–Interlaken Express over the Brünig Pass — day 4"),
 ("swiss-lucerne-bo","bo-lauterbrunnen","Staubbachfall Lauterbrunnen","Lauterbrunnen valley — day 4"),
 ("swiss-lucerne-bo","bo-truemmelbach","Trümmelbachfälle waterfall inside","Trümmelbach Falls inside the mountain — day 4"),
 ("swiss-lucerne-bo","bo-jungfraujoch","Jungfraujoch Sphinx observatory snow","Jungfraujoch, Top of Europe — day 5"),
 ("swiss-lucerne-bo","bo-gimmelwald","Mürren","Mürren, start of the walk down to Gimmelwald — day 6"),
 ("swiss-lucerne-bo","bo-schilthorn","Schilthorn Piz Gloria","Schilthorn / Piz Gloria — day 6"),
 ("swiss-lucerne-bo","bo-bern","Bern Kramgasse Zytglogge","Bern old town — day 7"),

 ("bavaria-munich-garmisch","muc-marienplatz","Marienplatz Munich Neues Rathaus","Marienplatz and the Glockenspiel — day 1"),
 ("bavaria-munich-garmisch","muc-biergarten","Chinesischer Turm Biergarten Englischer Garten","Chinese Tower beer garden, English Garden — day 2"),
 ("bavaria-munich-garmisch","muc-deutsches","Deutsches Museum Munich","Deutsches Museum — day 2"),
 ("bavaria-munich-garmisch","muc-hellabrunn","Hellabrunn Zoo elephant house","Hellabrunn Zoo — day 3"),
 ("bavaria-munich-garmisch","gap-partnach","Partnachklamm gorge","Partnach Gorge — day 4"),
 ("bavaria-munich-garmisch","gap-zugspitzbahn","Zugspitzbahn Zahnradbahn","Zugspitze cogwheel train — day 5"),
 ("bavaria-munich-garmisch","gap-eibsee","Eibsee Zugspitze lake","Eibsee below the Zugspitze — day 5"),
 ("bavaria-munich-garmisch","gap-neuschwanstein","Neuschwanstein Castle Marienbrücke","Neuschwanstein — day 6"),
 ("bavaria-munich-garmisch","gap-mittenwald","Mittenwald Obermarkt","Mittenwald painted houses — day 7"),
 ("bavaria-munich-garmisch","gap-innsbruck","Innsbruck Nordkettenbahn Seegrube","Innsbruck and the Nordkette — day 7 option"),

 ("berlin-dresden-prague","ber-reichstag","Reichstag dome Berlin interior","Reichstag dome — day 1"),
 ("berlin-dresden-prague","ber-zoo","Zoologischer Garten Berlin Elefantentor","Berlin Zoo, Elephant Gate — day 2"),
 ("berlin-dresden-prague","ber-spree","Spree boat Museum Island Berlin Cathedral","Spree boat past Museum Island — day 2"),
 ("berlin-dresden-prague","ber-wall","Berlin Wall Memorial Bernauer Straße","Berlin Wall Memorial, Bernauer Straße — day 3"),
 ("berlin-dresden-prague","drs-frauenkirche","Frauenkirche Dresden Neumarkt","Frauenkirche, Dresden — day 4"),
 ("berlin-dresden-prague","drs-zwinger","Dresden Zwinger Kronentor","Zwinger courtyard — day 4"),
 ("berlin-dresden-prague","drs-bastei","Bastei bridge Saxon Switzerland","Bastei bridge, Saxon Switzerland — day 5"),
 ("berlin-dresden-prague","drs-steamer","Dampfschiff Dresden Elbe","Elbe paddle steamer — day 5"),
 ("berlin-dresden-prague","prg-charles","Charles Bridge Prague morning","Charles Bridge, Prague — day 7"),
 ("berlin-dresden-prague","prg-petrin","Petřín funicular Prague","Petřín funicular — day 7"),
 ("seville-granada","sev-ave","Renfe AVE high speed train","AVE, Madrid to Seville in 2h30 — day 1"),
 ("seville-granada","sev-plazaespana","Plaza de España Seville boats canal","Plaza de España rowboats — day 1"),
 ("seville-granada","sev-alcazar","Real Alcázar Seville gardens","Real Alcázar gardens — day 2"),
 ("seville-granada","sev-giralda","Giralda Seville cathedral","The Giralda, ramps all the way up — day 2"),
 ("seville-granada","sev-setas","Metropol Parasol Seville","Setas de Sevilla walkway at sunset — day 3"),
 ("seville-granada","sev-cordoba","Mezquita Córdoba arches interior","Mezquita, Córdoba — day 4"),
 ("seville-granada","sev-patios","Córdoba patios flowers festival","Córdoba patios in May — day 4"),
 ("seville-granada","gra-albaicin","Mirador de San Nicolás Alhambra view","Alhambra from the Albaicín — day 5"),
 ("seville-granada","gra-alhambra","Alhambra Patio de los Leones","Alhambra, Court of the Lions — day 6"),
 ("seville-granada","gra-sierra","Sierra Nevada Pradollano snow","Sierra Nevada, snow in May — day 7"),

 ("barcelona-girona","bcn-barceloneta","Platja de la Barceloneta skyline","Barceloneta — day 1"),
 ("barcelona-girona","bcn-ciutadella","Parc de la Ciutadella cascada","Parc de la Ciutadella — day 1"),
 ("barcelona-girona","bcn-sagrada","Sagrada Família Barcelona","Sagrada Família — day 2"),
 ("barcelona-girona","bcn-guell","Park Güell Barcelona","Park Güell — day 2"),
 ("barcelona-girona","bcn-montjuic","Montjuïc cable car Barcelona","Montjuïc cable car — day 3"),
 ("barcelona-girona","bcn-montserrat","Santa Maria de Montserrat Abbey","Montserrat and the rack railway — day 4"),
 ("barcelona-girona","gir-onyar","Girona Onyar river houses cathedral","Girona's river houses — day 5"),
 ("barcelona-girona","gir-calella","Calella de Palafrugell beach","Calella de Palafrugell, Costa Brava — day 6"),
 ("barcelona-girona","gir-dali","Dalí Theatre Museum Figueres","Dalí museum, Figueres — day 6 option"),
 ("barcelona-girona","gir-besalu","Besalú medieval bridge","Besalú — day 7"),

 ("london-edinburgh","le-serpentine","Hyde Park Serpentine boats London","Serpentine pedalos, Hyde Park — day 1"),
 ("london-edinburgh","le-nhm","=lon-nhm","Natural History Museum, Hintze Hall — day 2"),
 ("london-edinburgh","le-tower","=lon-tower","Tower of London — day 2"),
 ("london-edinburgh","le-wb","Warner Bros Studio Tour London Hogwarts Great Hall","Warner Bros Studio Tour — day 3"),
 ("london-edinburgh","le-greenwich","Cutty Sark Greenwich ship","Cutty Sark, Greenwich — day 4"),
 ("london-edinburgh","le-lner","=lon-lner","LNER Azuma, King's Cross to Edinburgh — day 5"),
 ("london-edinburgh","le-victoria","Victoria Street Edinburgh","Victoria Street, Edinburgh — day 5"),
 ("london-edinburgh","le-castle","=edi-castle","Edinburgh Castle — day 6"),
 ("london-edinburgh","le-arthurs","=edi-arthurs","Arthur's Seat — day 6"),
 ("london-edinburgh","le-bassrock","=edi-bassrock","Bass Rock from North Berwick — day 7"),
 ("london-edinburgh","le-portobello","Portobello Beach Edinburgh","Portobello Beach — day 7"),

 ("lisbon-algarve","la-belem","Torre de Belém Lisbon","Belém Tower — day 1"),
 ("lisbon-algarve","la-tram","=lis-tram28","Tram 28 through Alfama — day 2"),
 ("lisbon-algarve","la-pena","=lis-pena","Pena Palace, Sintra — day 3"),
 ("lisbon-algarve","la-alfa","=lis-alfa","The train south from Lisbon Oriente — day 4"),
 ("lisbon-algarve","la-piedade","Ponta da Piedade Lagos","Ponta da Piedade, Lagos — day 5"),
 ("lisbon-algarve","la-donaana","Praia Dona Ana Lagos","Praia Dona Ana — day 5"),
 ("lisbon-algarve","la-tavira","Ilha de Tavira beach","Ilha de Tavira — day 5 (Tavira version)"),
 ("lisbon-algarve","la-benagil","Benagil cave Algarve","Benagil cave — day 6"),
 ("lisbon-algarve","la-carvoeiro","Carvoeiro beach Algarve","Carvoeiro — day 6"),
 ("lisbon-algarve","la-sagres","Cabo de São Vicente lighthouse cliffs","Cabo de São Vicente — day 7"),
 ("lisbon-algarve","la-riaformosa","Ria Formosa flamingos","Ria Formosa lagoon — 10-night extra"),

 ("austria-salzburg","sal-mirabell","Mirabell Gardens Salzburg Hohensalzburg","Mirabell gardens and the fortress — day 1"),
 ("austria-salzburg","sal-getreidegasse","Getreidegasse Salzburg","Getreidegasse — day 1"),
 ("austria-salzburg","sal-fortress","Hohensalzburg Fortress funicular","Hohensalzburg by funicular — day 2"),
 ("austria-salzburg","sal-hellbrunn","Hellbrunn Wasserspiele trick fountains","Hellbrunn trick fountains — day 2"),
 ("austria-salzburg","sal-koenigssee","Königssee St. Bartholomä boat","Königssee electric boats — day 3"),
 ("austria-salzburg","skg-stwolfgang","St. Wolfgang Wolfgangsee","St. Wolfgang on the Wolfgangsee — day 4"),
 ("austria-salzburg","skg-schafberg","Schafbergbahn steam locomotive","Schafberg steam cog railway — day 5"),
 ("austria-salzburg","skg-hallstatt","Hallstatt village lake","Hallstatt early morning — day 6"),
 ("austria-salzburg","skg-skywalk","Hallstatt Skywalk viewing platform","Hallstatt from the lake — day 6"),
 ("austria-salzburg","skg-gosausee","Vorderer Gosausee Dachstein","Gosausee — day 6"),
 ("austria-salzburg","skg-badischl","Kaiservilla Bad Ischl","Kaiservilla, Bad Ischl — day 7"),
]


def fetch(url, timeout=30):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=timeout).read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                wait = 15 * (attempt + 1); print("  429, waiting", wait); time.sleep(wait); continue
            raise

def api(params):
    params.update(format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    return json.loads(fetch(url))

def strip(h): return re.sub(r"<[^>]+>", "", h or "").strip()

def pick(query):
    d = api(dict(action="query", generator="search", gsrsearch=query, gsrnamespace=6, gsrlimit=10,
                 prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=1600))
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    cands = []
    for p in pages:
        ii = p["imageinfo"][0]
        if ii["mime"] != "image/jpeg" or ii["width"] < 1200: continue
        if re.search(r"painting|Infotafel|postcard|Brück|Canaletto|Bierstadt|Lamborghini|Anser|Gemälde|Ansichtskarte|map|Karte|sign|drone|Speicher|1248|topo|relief|3D|stereo|SW45|anaglyph|Munsch|1878|rigging|Subjecció|rail detail|ceiling|cupola|Spain 22", p["title"], re.I): continue
        cands.append((p, ii))
    if not cands: return None
    land = [c for c in cands if c[1]["width"] >= c[1]["height"] * 1.1]
    return (land or cands)[0]

MF="tools/manifest.json"
old = {m["slug"]: m for m in json.load(open(MF))} if os.path.exists(MF) else {}
manifest, sheet_imgs = [], []
for sketch, slug, query, caption in WANT:
    out = f"img/{slug}.jpg"
    if slug in old and os.path.exists(out):
        manifest.append(old[slug]); continue
    if query.startswith("="):
        src = old.get(query[1:]) or next((x for x in manifest if x["slug"] == query[1:]), None)
        if not src: print("ALIAS MISSING", slug, query); continue
        e = dict(src); e.update(sketch=sketch, slug=slug, caption=caption, query=query)
        manifest.append(e); print("alias", slug, "->", src["file"]); continue
    try:
        r = pick(query)
        if not r: print("NO RESULT", slug, query); continue
        p, ii = r
        em = ii.get("extmetadata", {})
        meta = dict(sketch=sketch, slug=slug, file=out, caption=caption, query=query,
                    title=p["title"], page=ii["descriptionurl"],
                    artist=strip(em.get("Artist", {}).get("value", ""))[:80],
                    license=strip(em.get("LicenseShortName", {}).get("value", "")),
                    w=ii["width"], h=ii["height"])
        if not os.path.exists(out):
            open(out, "wb").write(fetch(ii["thumburl"], 90))
        time.sleep(2.5)
        json.dump(manifest, open(MF,"w"), indent=1, ensure_ascii=False)
        manifest.append(meta)
        print(f"ok {slug:20s} {p['title'][:60]}  {ii['width']}x{ii['height']}  {meta['license']}")
    except Exception as e:
        print("ERR", slug, e)

json.dump(manifest, open(MF,"w"), indent=1, ensure_ascii=False)

# contact sheets: 5 columns, thumbs 300x200, label with slug
def sheet(items, path):
    cols, tw, th, lh = 5, 300, 200, 26
    rows = (len(items)+cols-1)//cols
    im = Image.new("RGB", (cols*tw, rows*(th+lh)), "white")
    dr = ImageDraw.Draw(im)
    for i, m in enumerate(items):
        try:
            t = Image.open(m["file"]).convert("RGB"); t.thumbnail((tw, th))
            x, y = (i%cols)*tw, (i//cols)*(th+lh)
            im.paste(t, (x + (tw-t.width)//2, y + (th-t.height)//2))
            dr.text((x+4, y+th+4), f"{i+1}. {m['slug']}", fill="black")
        except Exception as e: print("thumb err", m["slug"], e)
    im.save(path, quality=80)
half = (len(manifest)+1)//2
if False: sheet(manifest[:half], "tools/sheet1.jpg")
if False: sheet(manifest[half:], "tools/sheet2.jpg")
print("images:", len(manifest), "total MB:", round(sum(os.path.getsize(m["file"]) for m in manifest)/1e6,1))
