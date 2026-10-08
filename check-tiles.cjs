// Exercise the production tile layer in a real browser, using local file URLs.
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const esbuild = require('esbuild');
const {chromium} = require('C:/Users/mratr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
    const output = path.resolve('../leaflet-check');
    fs.mkdirSync(output, {recursive: true});
    await esbuild.build({entryPoints: ['src/map/local-tiles.ts'], bundle: true, format: 'iife',
        globalName: 'LocalTiles', outfile: path.join(output, 'tiles.js')});
    // Build the actual loader with only Obsidian's host API substituted.
    await esbuild.build({entryPoints: ['src/worker/loader.ts'], bundle: true, format: 'iife',
        globalName: 'LocalLoader', outfile: path.join(output, 'loader.js'),
        plugins: [{name:'host-stubs',setup(build){
            build.onResolve({filter:/^(obsidian|\.\.\/utils|src\/l10n\/locale)$/}, args => ({path:args.path, namespace:'host'}));
            build.onLoad({filter:/.*/,namespace:'host'},args => ({contents:args.path==='obsidian'
                ? 'export class Events { trigger() {} } export class Notice { constructor(message) { console.log(message); } }'
                : args.path==='../utils'
                ? 'export const parseLink = s => s.replace(/^!?(\\[\\[)/, "").replace(/\\]\\]$/, "");'
                : 'export default s => s;'}));
        }}]});
    const leaf = pathToFileURL(path.resolve('node_modules/leaflet/dist/leaflet.js')).href;
    const css = pathToFileURL(path.resolve('node_modules/leaflet/dist/leaflet.css')).href;
    fs.writeFileSync(path.join(output,'check.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}">
        <style>body{margin:0;background:#222}#map{width:1200px;height:900px}</style><div id="map"></div>
        <script src="${leaf}"></script><script src="tiles.js"></script><script src="loader.js"></script>`);
    const browser = await chromium.launch({headless:true,
        executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        args:['--allow-file-access-from-files']});
    try {
        const page = await browser.newPage({viewport:{width:1200,height:900}});
        const errors=[];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('request', r => {if(/^https?:/.test(r.url())) errors.push('Unexpected network request: '+r.url());});
        await page.goto(pathToFileURL(path.join(output,'check.html')).href);
        const vault = path.resolve('../../map/radiosol-map');
        const manifest = JSON.parse(fs.readFileSync(path.join(vault,'Maps/radiosol.leaflet.json'),'utf8'));
        const root = pathToFileURL(path.join(vault,'Maps')+path.sep).href;
        const results = await page.evaluate(async ({manifest,root}) => {
            const m=LocalTiles.validateTileManifest(manifest);
            for(const bad of [{...m,width:0},{...m,maxLevel:999},{...m,tilePattern:'../escape/{z}/{x}/{y}.png'}]) {
                let rejected=false;try{LocalTiles.validateTileManifest(bad)}catch{rejected=true}if(!rejected)throw Error('Invalid manifest accepted');
            }
            const loader=new LocalLoader.default({metadataCache:{getFirstLinkpathDest:()=>({path:'Maps/radiosol.leaflet.json'})},
                vault:{adapter:{read:async()=>JSON.stringify(m),getResourcePath:p=>root+p.replace(/^Maps\//,'')}}});
            loader.getImageDimensions=()=>{throw Error('Attempted whole-image decode for tiled map')};
            const data=await loader.loadImageAsync('test',['[[Maps/radiosol.leaflet.json]]']);
            if(data.w!==m.width || data.h!==m.height || !data.tiles)throw Error('Loader metadata mismatch');
            const map=L.map('map',{crs:L.CRS.Simple,minZoom:1,maxZoom:10,zoomAnimation:false,fadeAnimation:false});
            const bounds=L.latLngBounds(map.unproject([0,m.height],9),map.unproject([m.width,0],9));
            let failures=0;
            const layer=LocalTiles.createLocalTileLayer(L,data.tiles,bounds,9,{minZoom:1,maxZoom:10},()=>failures++);
            const requests=[];layer.on('tileloadstart',e=>requests.push({...e.coords}));
            async function settled(){
                for(let i=0;i<200;i++){
                    await new Promise(r=>setTimeout(r,25));
                    if(!layer.isLoading())return;
                }throw Error('Tile loading timed out');
            }
            map.setView(bounds.getCenter(),3);layer.addTo(map);await settled();
            const pin=L.circleMarker(bounds.getCenter(),{radius:7,color:'#f55'}).addTo(map);
            for(const z of [1,3,6,9,10]){
                map.setView(bounds.getCenter(),z);await settled();
                const center=map.latLngToContainerPoint(pin.getLatLng());
                if(Math.abs(center.x-600)>1 || Math.abs(center.y-450)>1)throw Error('Marker drift');
            }
            // Bottom-right boundary forces both non-square padded edge tiles.
            map.setView(map.unproject([m.width-100,m.height-100],9),9);await settled();
            map.setView(map.unproject([100,100],9),9);await settled();
            if(!requests.some(p=>p.z===9 && p.x===Math.ceil(m.width/m.tileSize)-1))throw Error('Right edge not requested');
            if(!requests.some(p=>p.z===9 && p.y===Math.ceil(m.height/m.tileSize)-1))throw Error('Bottom edge not requested');
            const invalid=requests.filter(p=>{const level=p.z-9+m.maxLevel; const factor=2**(m.maxLevel-level);
                return level<0||level>m.maxLevel||p.x<0||p.y<0||p.x>=Math.ceil(m.width/factor/m.tileSize)||p.y>=Math.ceil(m.height/factor/m.tileSize)});
            if(invalid.length || failures)throw Error('Invalid or failed tile requests '+JSON.stringify({invalid,failures}));
            map.setView(bounds.getCenter(),3);await settled();
            return {requests:requests.length,failures,nativeDimensions:[m.width,m.height],wholeImageDecode:false};
        },{manifest,root});
        await page.screenshot({path:path.join(output,'map-preview.png')});
        if(errors.length)throw Error(errors.join('\n'));
        fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));
        console.log('PASS',results);
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
