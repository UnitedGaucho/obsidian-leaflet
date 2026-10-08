// Exercise the production tile layer in a real browser, using local file URLs.
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const esbuild = require('esbuild');
const {parseArgs} = require('node:util');
const {chromium} = require('playwright');

(async () => {
    const {values} = parseArgs({options: {
        manifest: {type:'string'}, output: {type:'string'},
        browser: {type:'string'}, channel: {type:'string'}, help: {type:'boolean'}
    }});
    if (values.help) {
        console.log('Usage: node check-tiles.cjs --manifest PATH [--output DIR] [--browser EXECUTABLE | --channel msedge]');
        return;
    }
    if (!values.manifest) throw Error('Supply --manifest with the path to a generated .leaflet.json file.');
    if (values.browser && values.channel) throw Error('Choose --browser or --channel, not both.');
    const manifestPath = path.resolve(values.manifest);
    const manifestName = path.basename(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const root = pathToFileURL(path.dirname(manifestPath)+path.sep).href;
    const output = values.output ? path.resolve(values.output) : path.join(__dirname,'test-output/browser');
    fs.mkdirSync(output, {recursive: true});
    await esbuild.build({absWorkingDir:__dirname, entryPoints: ['src/map/local-tiles.ts'], bundle: true, format: 'iife',
        globalName: 'LocalTiles', outfile: path.join(output, 'tiles.js')});
    // Build the actual loader with only Obsidian's host API substituted.
    await esbuild.build({absWorkingDir:__dirname, entryPoints: ['src/worker/loader.ts'], bundle: true, format: 'iife',
        globalName: 'LocalLoader', outfile: path.join(output, 'loader.js'),
        plugins: [{name:'host-stubs',setup(build){
            build.onResolve({filter:/^(obsidian|\.\.\/utils|src\/l10n\/locale)$/}, args => ({path:args.path, namespace:'host'}));
            build.onLoad({filter:/.*/,namespace:'host'},args => ({contents:args.path==='obsidian'
                ? 'export class Events { trigger() {} } export class Notice { constructor(message) { console.log(message); } }'
                : args.path==='../utils'
                ? 'export const parseLink = s => s.replace(/^!?(\\[\\[)/, "").replace(/\\]\\]$/, "");'
                : 'export default s => s;'}));
        }}]});
    const leaf = pathToFileURL(require.resolve('leaflet/dist/leaflet.js')).href;
    const css = pathToFileURL(require.resolve('leaflet/dist/leaflet.css')).href;
    const pluginCss = pathToFileURL(path.join(__dirname,'styles.css')).href;
    fs.writeFileSync(path.join(output,'check.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}">
        <link rel="stylesheet" href="${pluginCss}">
        <style>body{margin:0;background:#222}#map{width:1200px;height:900px}</style><div class="block-language-leaflet-local"><div id="map"></div></div>
        <script src="${leaf}"></script><script src="tiles.js"></script><script src="loader.js"></script>`);
    const browserPath = values.browser || process.env.LEAFLET_BROWSER_PATH;
    if (browserPath && values.channel) throw Error('Choose a browser executable or channel, not both.');
    const browser = await chromium.launch({headless:true,
        ...(browserPath ? {executablePath:path.resolve(browserPath)} :
            values.channel ? {channel:values.channel} : process.platform === 'win32' ? {channel:'msedge'} : {}),
        args:['--allow-file-access-from-files']});
    try {
        const page = await browser.newPage({viewport:{width:1200,height:900}});
        const errors=[];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('request', r => {if(/^https?:/.test(r.url())) errors.push('Unexpected network request: '+r.url());});
        await page.goto(pathToFileURL(path.join(output,'check.html')).href);
        const results = await page.evaluate(async ({manifest,root,manifestName}) => {
            const m=LocalTiles.validateTileManifest(manifest);
            for(const bad of [{...m,width:0},{...m,maxLevel:999},{...m,tilePattern:'../escape/{z}/{x}/{y}.png'}]) {
                let rejected=false;try{LocalTiles.validateTileManifest(bad)}catch{rejected=true}if(!rejected)throw Error('Invalid manifest accepted');
            }
            const loader=new LocalLoader.default({metadataCache:{getFirstLinkpathDest:()=>({path:manifestName})},
                vault:{adapter:{read:async()=>JSON.stringify(m),getResourcePath:p=>new URL(p,root).href}}});
            loader.getImageDimensions=()=>{throw Error('Attempted whole-image decode for tiled map')};
            const data=await loader.loadImageAsync('test',[`[[${manifestName}]]`]);
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
        },{manifest,root,manifestName});
        // Exercise built toolbar CSS in Obsidian's new code-block wrapper.
        // These are the control/action classes emitted by the drawing controls.
        const toolbar = await page.evaluate(() => {
            const wrapper=document.querySelector('.block-language-leaflet-local');
            const corner=document.querySelector('.leaflet-top.leaflet-right');
            const control=document.createElement('div');
            control.className='leaflet-bar leaflet-control leaflet-control-expandable leaflet-control-draw';
            control.innerHTML='<a class="leaflet-control-expandable-icon">Draw</a><section class="leaflet-control-expandable-list">'+
                ['polygon','rectangle','polyline','paint','drag','trash','done'].map(name=>
                    `<div class="leaflet-bar leaflet-control leaflet-control-has-actions leaflet-control-draw-${name}"><a>${name}</a><div class="control-actions"><div class="leaflet-control"><a>Done</a></div></div></div>`).join('')+'</section>';
            corner.appendChild(control);
            const list=control.querySelector('section');
            const actions=[...control.querySelectorAll('.control-actions')];
            const visible=el=>getComputedStyle(el).display!=='none';
            for(const scope of ['block-language-leaflet-local','block-language-leaflet']) {
                wrapper.className=scope;
                control.classList.remove('expanded');
                if(visible(list))throw Error('Collapsed drawing tools visible in '+scope);
                control.classList.add('expanded');
                if(!visible(list)||actions.some(visible))throw Error('Inactive drawing actions visible in '+scope);
                if(visible(control.querySelector('.leaflet-control-expandable-icon')))throw Error('Expanded toolbar icon still visible');
                const xs=[...list.children].map(el=>el.getBoundingClientRect().left);
                if(Math.max(...xs)-Math.min(...xs)>1)throw Error('Drawing tool columns are misaligned');
                actions[0].classList.add('expanded');
                if(!visible(actions[0])||actions.slice(1).some(visible))throw Error('Active action visibility wrong');
                actions[0].classList.remove('expanded');
            }
            wrapper.className='block-language-leaflet-local';
            control.classList.remove('expanded');
            const box=control.getBoundingClientRect();
            control.remove();
            if(box.height>50)throw Error('Collapsed toolbar overflows embedded map');
            return {collapsedToolsHidden:true,inactiveActionsHidden:true,aligned:true,bothScopes:true};
        });
        results.toolbar=toolbar;
        await page.screenshot({path:path.join(output,'map-preview.png')});
        if(errors.length)throw Error(errors.join('\n'));
        fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));
        console.log('PASS',results);
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
