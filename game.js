import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const ui = {
  world: $('#world'), title: $('#title-screen'), hud: $('#hud'), crosshair: $('#crosshair'),
  loading: $('#loading'), start: $('#start-button'), panel: $('#panel'), panelLabel: $('#panel-label'),
  panelTitle: $('#panel-title'), panelContent: $('#panel-content'), timeline: $('#timeline'),
  timelineObject: $('#timeline-object'), timeDescription: $('#time-description'), prompt: $('#interact-prompt'),
  promptLabel: $('#interact-label'), toast: $('#toast'), dialogue: $('#dialogue'),
  dialogueText: $('#dialogue-text'), dialogueChoices: $('#dialogue-choices'),
  objective: $('#objective-text'), artifactCount: $('#artifact-count')
};
const scene = new THREE.Scene();
scene.background = new THREE.Color('#09181c');
scene.fog = new THREE.FogExp2('#09181c', 0.018);
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ canvas: ui.world, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const clock = new THREE.Clock();
const world = new THREE.Group(); scene.add(world);
const ambient = new THREE.HemisphereLight(0x99d5d1, 0x18202a, 1.15); scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xe4f0dc, 2.2); keyLight.position.set(-5, 12, 8); scene.add(keyLight);
const accentLight = new THREE.PointLight(0x43d9cf, 32, 24, 2); accentLight.position.set(0, 5, -2); scene.add(accentLight);
let regionGroup = new THREE.Group(); world.add(regionGroup);
let graphics = localStorage.getItem('mot-graphics') || 'high';
let language = localStorage.getItem('mot-language') || 'en';
let cameraSensitivity = Number(localStorage.getItem('mot-sensitivity') || 1);
const qualityScale = () => ({ low: .8, medium: 1, high: 1.5, ultra: 2 }[graphics] || 1);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, qualityScale()));
const player = { pos: new THREE.Vector3(0, 0, 11), yaw: 0, pitch: 0, velocityY: 0, grounded: true };
const avatar = new THREE.Group();
const avatarMat = new THREE.MeshStandardMaterial({ color: 0xc4d8c8, roughness: .48, metalness: .18 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .68, 4, 8), avatarMat); body.position.y = .83; avatar.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe5c992, roughness: .6 })); head.position.set(0, 1.48, -.04); avatar.add(head);
const pack = new THREE.Mesh(new THREE.BoxGeometry(.42, .52, .2), new THREE.MeshStandardMaterial({ color: 0x1e6767, metalness: .5, roughness: .35 })); pack.position.set(0, .94, .29); avatar.add(pack);
scene.add(avatar);
let started = false, panelOpen = false, dialogueOpen = false, gameTime = 0;
let interactables = [], particles = [], held = new Set(), joy = { x: 0, z: 0 }, runHeld = false, pointerDown = null;
let artifacts = new Set(), storyFlags = {}, currentRegion = 0, activeTemporal = null, toastTimer = 0;
const regions = [
  { name: 'The First Night', color: '#47d9cc', subtitle: 'THE ENTRANCE' },
  { name: 'The Drowned Garden', color: '#65c9a8', subtitle: 'WING 02' },
  { name: 'The Quiet Machine', color: '#8bb8ed', subtitle: 'WING 03' },
  { name: 'The Unwritten City', color: '#d3a9ed', subtitle: 'WING 04' },
  { name: 'The Last Orchard', color: '#e5c992', subtitle: 'WING 05' },
  { name: 'The Room Beyond', color: '#e88978', subtitle: 'WING 06' }
];
const artifactNames = ['The First Memory', 'A Borrowed Tomorrow', 'The Missing Centrepiece'];
function material(color, roughness = .72, metalness = .12, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); }
function addBox(parent, name, x, y, z, sx, sy, sz, mat, bevel = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); mesh.name = name; mesh.position.set(x, y, z);
  if (bevel) { mesh.geometry = new THREE.BoxGeometry(sx, sy, sz); }
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function worldPosition(it) { const p = new THREE.Vector3(); if (it.object) it.object.getWorldPosition(p); else p.copy(it.pos); return p; }
function notify(message) { ui.toast.textContent = message; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600); }
function save() { localStorage.setItem('mot-region', String(currentRegion)); localStorage.setItem('mot-artifacts', JSON.stringify([...artifacts])); localStorage.setItem('mot-story', JSON.stringify(storyFlags)); }
function updateArtifactCount() { ui.artifactCount.textContent = `${String(artifacts.size).padStart(2, '0')} / 03`; if (artifacts.size >= 3) ui.objective.textContent = language === 'id' ? 'Temukan ECHO di pusat arsip' : 'Find ECHO at the archive heart'; }
function addInteractable(name, object, action, radius = 2.25, extra = {}) { const it = { name, object, action, radius, ...extra }; interactables.push(it); return it; }
function createRoom() {
  regionGroup.clear(); interactables = []; particles = [];
  const cfg = regions[currentRegion], accent = new THREE.Color(cfg.color);
  scene.fog.color.set('#09181c'); accentLight.color.copy(accent); ui.objective.textContent = artifacts.size >= 3 ? 'Find ECHO at the archive heart' : currentRegion === 0 ? 'Find the missing centrepiece' : `Follow the memory trace · ${cfg.name}`;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 34), material('#182629', .86, .22)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.05, 0); floor.receiveShadow = true; regionGroup.add(floor);
  const ceiling = addBox(regionGroup, 'ceiling', 0, 8, 0, 18, .35, 34, material('#101d20', .9));
  const wallMat = material('#213033', .82, .18), trimMat = material(cfg.color, .34, .55, { emissive: cfg.color, emissiveIntensity: .28 });
  addBox(regionGroup, 'back wall', 0, 4, -17, 18, 8, .5, wallMat); addBox(regionGroup, 'front wall', 0, 4, 17, 18, 8, .5, wallMat);
  addBox(regionGroup, 'left wall', -9, 4, 0, .5, 8, 34, wallMat); addBox(regionGroup, 'right wall', 9, 4, 0, .5, 8, 34, wallMat);
  const grid = new THREE.GridHelper(18, 36, cfg.color, 0x395052); grid.position.y = .008; grid.material.transparent = true; grid.material.opacity = .24; regionGroup.add(grid);
  for (const z of [-14, -8, 0, 8, 14]) {
    for (const x of [-7.8, 7.8]) {
      const pillar = addBox(regionGroup, 'ribbed column', x, 3.8, z, .48, 7.6, .48, material('#29383a', .58, .38));
      addBox(regionGroup, 'column light', x, 3.65, z + .255, .075, 6.7, .025, trimMat);
    }
    addBox(regionGroup, 'ceiling rib', 0, 7.55, z, 17.5, .15, .16, material('#344446', .56, .34));
  }
  // Monumental entrance portal and floating archive glyphs establish a strong focal axis.
  const portal = new THREE.Group(); portal.position.set(0, 0, -14.8); regionGroup.add(portal);
  const portalMat = material('#314447', .45, .55), portalGlow = new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 1.4, roughness: .3 });
  addBox(portal, 'portal left', -3.1, 3, 0, .42, 6, .5, portalMat); addBox(portal, 'portal right', 3.1, 3, 0, .42, 6, .5, portalMat); addBox(portal, 'portal crown', 0, 6, 0, 6.6, .42, .5, portalMat);
  addBox(portal, 'portal light', 0, 5.72, .27, 5.9, .06, .04, portalGlow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, .035, 8, 72), portalGlow); ring.position.set(0, 3.15, -.1); portal.add(ring); world.portal = ring;
  // Exhibit plinths, precise pools of light, and readable sculptural props.
  const positions = [[-4.1, 4.5], [0, -.3], [4.1, 4.5]];
  const objectNames = ['Hourglass of Ash', 'The Listening Vessel', 'The Empty Plinth'];
  const hints = [
    'Its shadow remembers the moment before the first light. Find the past.',
    'The vessel only sings in the present tense. Hold it there.',
    'Nothing is missing from this plinth. Look toward what could be. Choose the future.'
  ];
  const required = ['past', 'present', 'future'];
  positions.forEach(([x, z], i) => {
    const plinth = new THREE.Group(); plinth.position.set(x, 0, z); regionGroup.add(plinth);
    addBox(plinth, 'pedestal foot', 0, .18, 0, 1.55, .36, 1.55, material('#344144', .42, .62));
    addBox(plinth, 'pedestal', 0, .9, 0, 1.12, 1.15, 1.12, material('#202d30', .34, .6));
    addBox(plinth, 'pedestal lip', 0, 1.53, 0, 1.36, .12, 1.36, material('#71817b', .28, .76));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.78, .018, 6, 40), portalGlow.clone()); halo.rotation.x = Math.PI / 2; halo.position.y = 1.61; plinth.add(halo);
    let exhibit;
    if (i === 0) {
      exhibit = new THREE.Group(); exhibit.position.y = 2.05; plinth.add(exhibit);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(.43, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xa0e7dc, roughness: .16, metalness: .18, transparent: true, opacity: .8, emissive: 0x173b38, clearcoat: 1 })); exhibit.add(glass);
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(.2, 1), new THREE.MeshStandardMaterial({ color: 0xf0d89d, emissive: 0xa77b35, emissiveIntensity: .7, metalness: .7, roughness: .22 })); exhibit.add(inner);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(.61, .025, 8, 42), material(cfg.color, .25, .65, { emissive: cfg.color, emissiveIntensity: .65 })); hoop.rotation.x = 1.04; exhibit.add(hoop);
    } else if (i === 1) {
      exhibit = new THREE.Group(); exhibit.position.y = 1.68; plinth.add(exhibit);
      const vessel = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.03, 0), new THREE.Vector2(.3, .08), new THREE.Vector2(.38, .35), new THREE.Vector2(.31, .75), new THREE.Vector2(.18, .96), new THREE.Vector2(.25, 1.03)], 32), material('#7ccbc2', .2, .78, { emissive: '#1b5b59', emissiveIntensity: .28 })); vessel.position.y = .06; exhibit.add(vessel);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(.24, .035, 8, 32), material('#ead09a', .24, .78)); lip.position.y = 1.08; exhibit.add(lip);
      const sound = new THREE.Mesh(new THREE.TorusGeometry(.7, .014, 6, 48), portalGlow.clone()); sound.position.y = .25; exhibit.add(sound);
    } else {
      exhibit = new THREE.Group(); exhibit.position.y = 1.7; plinth.add(exhibit);
      const shard = new THREE.Mesh(new THREE.IcosahedronGeometry(.48, 0), new THREE.MeshStandardMaterial({ color: '#c4d6c3', metalness: .72, roughness: .23, emissive: cfg.color, emissiveIntensity: .35, wireframe: true })); shard.position.y = .28; exhibit.add(shard);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(.25, 0), new THREE.MeshStandardMaterial({ color: '#ffe1a0', emissive: '#be782d', emissiveIntensity: .8 })); core.position.y = .28; exhibit.add(core);
    }
    plinth.userData.temporal = true; plinth.userData.id = i; plinth.userData.default = exhibit;
    plinth.userData.states = {
      past: `${hints[i]} In the past, the archive preserves its origin.`,
      present: `${hints[i]} In the present, the object is held in balance.`,
      future: `${hints[i]} In the future, a possibility takes shape.`
    };
    addInteractable(objectNames[i], plinth, () => openTimeline(plinth), 2.75, { index: i });
    const spotlight = new THREE.SpotLight(cfg.color, 36, 8, .52, .8, 1.3); spotlight.position.set(x, 6.6, z); spotlight.target.position.set(x, 1, z); regionGroup.add(spotlight, spotlight.target);
  });
  // Memory motes and floor guide lights.
  for (let i = 0; i < 18; i++) {
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(.035 + Math.random() * .035), new THREE.MeshBasicMaterial({ color: i % 3 ? cfg.color : '#f0d7a1', transparent: true, opacity: .3 }));
    mote.position.set((Math.random() - .5) * 13, 1.1 + Math.random() * 5, (Math.random() - .5) * 27); mote.userData.float = true; regionGroup.add(mote); particles.push(mote);
  }
  for (let z = -12; z <= 12; z += 4) {
    const guide = new THREE.Mesh(new THREE.BoxGeometry(.08, .025, .9), portalGlow.clone()); guide.position.set(0, .025, z); regionGroup.add(guide);
  }
  // ECHO waits at the room's heart and remembers the story state.
  const echo = new THREE.Group(); echo.position.set(0, 2.15, -7.5); regionGroup.add(echo);
  const echoCore = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 1), new THREE.MeshStandardMaterial({ color: '#d5fff3', emissive: cfg.color, emissiveIntensity: 1.2, transparent: true, opacity: .9, wireframe: true })); echo.add(echoCore);
  const echoOrb = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), new THREE.MeshBasicMaterial({ color: '#e9f8dd' })); echo.add(echoOrb);
  const echoRing = new THREE.Mesh(new THREE.TorusGeometry(.75, .018, 6, 48), portalGlow.clone()); echoRing.rotation.x = .8; echo.add(echoRing);
  addInteractable('ECHO · Archive intelligence', echo, () => talkToEcho(), 2.7);
  addBox(regionGroup, 'archive dais', 0, .12, -7.5, 2.8, .24, 2.8, material('#28393a', .35, .58));
  if (currentRegion === 0) {
    interactables.forEach(it => { if (it.index !== undefined) it.locked = false; });
  }
}
function changeRegion(index) {
  currentRegion = THREE.MathUtils.clamp(index, 0, regions.length - 1);
  player.pos.set(0, 0, 11); player.yaw = 0; player.velocityY = 0;
  createRoom(); save();
  const brand = document.querySelector('.hud-brand b'), sub = document.querySelector('.hud-brand small');
  if (brand) brand.textContent = regions[currentRegion].subtitle;
  if (sub) sub.innerHTML = `WING 0${currentRegion + 1} <i>—</i> ${regions[currentRegion].name.toUpperCase()}`;
  if (started) notify(`${regions[currentRegion].name.toUpperCase()} · MEMORY TRACE LOADED`);
}
function applyTemporalState(object, state) {
  const id = object.userData.id, exhibit = object.userData.default;
  exhibit.visible = true; exhibit.scale.setScalar(state === 'past' ? .92 : state === 'future' ? 1.12 : 1);
  exhibit.rotation.y = state === 'past' ? -.32 : state === 'future' ? .48 : 0;
  object.traverse(child => {
    if (child.material?.emissive && child !== exhibit) child.material.emissiveIntensity = state === 'future' ? .82 : state === 'past' ? .18 : .42;
  });
  if (id === 0 && state === 'past') object.userData.default.children[0].rotation.y = gameTime * .15;
  if (id === 1) object.userData.default.children[0].rotation.y = state === 'present' ? Math.sin(gameTime * 2) * .06 : 0;
}
function openTimeline(object) {
  activeTemporal = object; ui.timeline.classList.remove('hidden'); document.querySelector('.hud').classList.add('timeline-open');
  ui.timelineObject.textContent = ['HOURGLASS OF ASH', 'THE LISTENING VESSEL', 'THE EMPTY PLINTH'][object.userData.id] || 'TEMPORAL OBJECT';
  setTime('present');
}
function closeTimeline() { ui.timeline.classList.add('hidden'); document.querySelector('.hud').classList.remove('timeline-open'); activeTemporal = null; }
function setTime(state) {
  if (!activeTemporal) return;
  document.querySelectorAll('.time-rail button').forEach(b => b.classList.toggle('selected', b.dataset.time === state));
  const id = activeTemporal.userData.id; ui.timeDescription.textContent = activeTemporal.userData.states[state];
  applyTemporalState(activeTemporal, state);
  const required = ['past', 'present', 'future'];
  if (state === required[id] && currentRegion === 0 && !artifacts.has(id)) {
    artifacts.add(id); storyFlags[`memory-${id}`] = true; updateArtifactCount(); save();
    notify(`MEMORY RECOVERED · ${artifactNames[id].toUpperCase()}`);
    const glow = new THREE.PointLight(regions[currentRegion].color, 24, 4); glow.position.copy(activeTemporal.position).add(new THREE.Vector3(0, 2.2, 0)); regionGroup.add(glow);
    setTimeout(() => { if (glow.parent) glow.parent.remove(glow); }, 1400);
  } else if (currentRegion === 0 && !artifacts.has(id)) {
    notify(state === 'past' ? 'A MEMORY STIRS, BUT THIS IS NOT ITS MOMENT' : 'THE OBJECT HOLDS ITS BREATH');
  }
}
function talkToEcho() {
  dialogueOpen = true; ui.dialogue.classList.remove('hidden');
  const lines = artifacts.size >= 3
    ? ['You found the three memories. The centrepiece did not disappear, Arka. Someone asked the museum to forget it.', 'The name beneath the statue is Ilyan. He built this place to preserve one future—and then erased himself from it. What do you want to ask?']
    : ['You are early, Arka. The archive is still trying to remember what was taken.', `Three temporal exhibits are out of sequence. Recover their memories, then come back. You have found ${artifacts.size} of three.`];
  ui.dialogueText.textContent = lines.join('\n\n');
  ui.dialogueChoices.innerHTML = `<button data-choice="1">${artifacts.size >= 3 ? 'Who is Ilyan?' : 'How do I read an object?'}</button><button data-choice="2">${artifacts.size >= 3 ? 'What was the centrepiece?' : 'Why can’t you remember?'}</button>`;
  ui.dialogueChoices.querySelectorAll('button').forEach((b, i) => b.onclick = () => {
    const answers = artifacts.size >= 3
      ? ['Ilyan was the first curator. He hid the centrepiece because it records a future in which this museum burns—and everyone inside survives.', 'A small star, made from tomorrow’s first light. You have already seen its shape in the empty plinth.']
      : ['Shift close to an exhibit and press Q—or use the timeline button. Each object answers to one moment: past, present, or future.', 'Someone cut the memory from the archive. I can feel the shape of the absence, but not its author.'];
    ui.dialogueText.textContent = answers[i]; ui.dialogueChoices.innerHTML = `<button id="echo-continue">${language === 'id' ? 'Lanjutkan' : 'Continue'}</button>`; $('#echo-continue').onclick = closeEcho;
  });
}
function closeEcho() { dialogueOpen = false; ui.dialogue.classList.add('hidden'); }
function applyLanguage() {
  document.documentElement.lang = language === 'id' ? 'id' : 'en';
  const id = language === 'id';
  $('#start-button').innerHTML = id ? 'MASUKI MUSEUM <span>↗</span>' : 'ENTER THE MUSEUM <span>↗</span>';
  $('#journal-open small').textContent = id ? 'JURNAL' : 'JOURNAL';
  $('#map-open small').textContent = id ? 'PETA' : 'MAP';
  $('#settings-open small').textContent = id ? 'PENGATURAN' : 'SETTINGS';
  $('.objective small').textContent = id ? 'JEJAK SAAT INI' : 'CURRENT THREAD';
  $('.status-pills span:first-child').innerHTML = `<i class="pulse"></i> ${id ? 'ARSIP STABIL' : 'ARCHIVE STABLE'} <b>68%</b>`;
  $('.status-pills span:nth-child(2)').childNodes[0].textContent = id ? 'ARTEFAK ' : 'ARTIFACTS ';
  $('#timeline-toggle span:last-child').innerHTML = id ? 'UBAH<br><b>WAKTU</b>' : 'SHIFT<br><b>TIME</b>';
  $('.time-rail button[data-time="past"] b').textContent = id ? 'LALU' : 'PAST';
  $('.time-rail button[data-time="present"] b').textContent = id ? 'KINI' : 'PRESENT';
  $('.time-rail button[data-time="future"] b').textContent = id ? 'MASA DEPAN' : 'FUTURE';
  $('.timeline-foot span:first-child').textContent = id ? 'GESER UNTUK MENGUBAH' : 'DRAG TO SHIFT';
  $('#panel-title').textContent = id ? 'Catatan lapangan' : 'Field notes';
  updateArtifactCount();
}
function loadProgress() {
  try { artifacts = new Set(JSON.parse(localStorage.getItem('mot-artifacts') || '[]')); storyFlags = JSON.parse(localStorage.getItem('mot-story') || '{}'); } catch { artifacts = new Set(); storyFlags = {}; }
  updateArtifactCount();
}
loadProgress(); createRoom(); applyLanguage();

function openPanel(type){panelOpen=true;ui.panel.classList.remove('hidden');ui.panelLabel.textContent=type.toUpperCase();ui.panelContent.innerHTML='';
  if(type==='journal'){
    ui.panelTitle.textContent=language==='id'?'Catatan lapangan':'Field notes';
    const notes=[['2189 / SHIFT ONE','The missing centrepiece','The central exhibit has vanished. ECHO says it never existed. The dust around its empty plinth is still warm.'],['TEMPORAL OBJECT / 01','The three states','Every object keeps a past, a present, and a future. The future is not a prediction—it is a door left ajar.'],['PERSON OF INTEREST','Ilyan, the Witness','A name hidden beneath the face of a statue. The museum’s original architect, erased from every photograph.'],['RECOVERED MEMORY',`${artifacts.size} / 03 fragments`,'Fragments of a future that never happened. Each one feels familiar, though Arka cannot say why.']];
    ui.panelContent.innerHTML=notes.map(n=>`<article class="note-card"><small>${n[0]}</small><h3>${n[1]}</h3><p>${n[2]}</p></article>`).join('');
  } else if(type==='map'){
    ui.panelTitle.textContent='The archive';
    ui.panelContent.innerHTML='<div class="map-grid">'+regions.map((r,i)=>`<button class="map-node ${i===currentRegion?'active':''}" data-region="${i}"><small>WING 0${i+1} / ${i===currentRegion?'CURRENT':'MEMORY TRACE'}</small><b>${r.name}</b></button>`).join('')+'</div><p style="font-size:11px;line-height:1.7;color:#9eafa8;margin-top:18px">Six futures. None of them were built. Select a memory trace to step through the archive.</p>';
    ui.panelContent.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{changeRegion(Number(b.dataset.region));openPanel('map');});
  } else if(type==='settings'){
    ui.panelTitle.textContent='Preferences';
    ui.panelContent.innerHTML=`<label class="settings-row"><span>Language <small> / BAHASA</small></span><select id="language-setting"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></label><label class="settings-row"><span>Graphics quality</span><select id="graphics-setting"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><label class="settings-row"><span>Camera sensitivity</span><input id="sensitivity-setting" type="range" min="0.4" max="2" step="0.1" value="${cameraSensitivity}"></label><label class="settings-row"><span>Ambient audio</span><input type="checkbox" checked></label><div class="setting-actions"><button id="save-game">SAVE CHECKPOINT</button><button id="load-game">LOAD CHECKPOINT</button></div><p style="font-size:10px;color:#91a49d;line-height:1.7;margin-top:20px">Progress autosaves on artifact recovery, temporal discoveries and area changes. Three local save slots are supported on this device.</p><div class="setting-actions">${[1,2,3].map(n=>`<button data-slot="${n}">SLOT ${n}</button>`).join('')}</div>`;
    const ls=$('#language-setting');ls.value=language;ls.onchange=()=>{language=ls.value;localStorage.setItem('mot-language',language);applyLanguage();notify(language==='id'?'Bahasa Indonesia dipilih':'English selected');};
    const gs=$('#graphics-setting');gs.value=graphics;gs.onchange=()=>{graphics=gs.value;localStorage.setItem('mot-graphics',graphics);renderer.setPixelRatio(Math.min(devicePixelRatio || 1,qualityScale()));notify(`GRAPHICS · ${graphics.toUpperCase()}`);};
    $('#sensitivity-setting').oninput=e=>{cameraSensitivity=Number(e.target.value);localStorage.setItem('mot-sensitivity',cameraSensitivity);};
    $('#save-game').onclick=()=>{saveSlot(Number(localStorage.getItem('mot-slot')||1));notify('CHECKPOINT SAVED');};$('#load-game').onclick=()=>{loadSlot(Number(localStorage.getItem('mot-slot')||1));notify('CHECKPOINT LOADED');closePanel();};
    ui.panelContent.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{localStorage.setItem('mot-slot',b.dataset.slot);ui.panelContent.querySelectorAll('[data-slot]').forEach(x=>x.style.borderColor=x===b?'#83e9dc':'');notify(`SAVE SLOT ${b.dataset.slot} SELECTED`);});
  }
}
function closePanel(){panelOpen=false;ui.panel.classList.add('hidden');}
function saveSlot(slot){localStorage.setItem(`mot-save-${slot}`,JSON.stringify({artifacts:[...artifacts],storyFlags,currentRegion,player:{x:player.pos.x,z:player.pos.z}}));save();}
function loadSlot(slot){const data=JSON.parse(localStorage.getItem(`mot-save-${slot}`)||'null');if(!data){notify('NO CHECKPOINT IN THIS SLOT');return;}artifacts=new Set(data.artifacts||[]);storyFlags=data.storyFlags||{};changeRegion(data.currentRegion||0);player.pos.set(data.player?.x||0,0,data.player?.z||6);save();updateArtifactCount();}
$('#journal-open').onclick=()=>openPanel('journal');$('#map-open').onclick=()=>openPanel('map');$('#settings-open').onclick=()=>openPanel('settings');$('#panel-close').onclick=closePanel;
$('#timeline-toggle').onclick=()=>{if(ui.timeline.classList.contains('hidden')){const nearest=getNearest();if(nearest?.object?.userData.temporal)openTimeline(nearest.object);else notify('MOVE CLOSER TO A TEMPORAL OBJECT');}else closeTimeline();};$('#timeline-close').onclick=closeTimeline;
document.querySelectorAll('.time-rail button').forEach(b=>b.onclick=()=>setTime(b.dataset.time));
$('#dialogue-close').onclick=closeEcho;
function beginGame(){started=true;ui.title.classList.add('hidden');ui.hud.classList.remove('hidden');ui.crosshair.classList.remove('hidden');updateArtifactCount();localStorage.setItem('mot-slot',localStorage.getItem('mot-slot')||'1');const saved=Number(localStorage.getItem('mot-region')||0);if(saved>0)changeRegion(saved);setTimeout(()=>notify('NIGHT SHIFT 01 · THE CENTREPIECE IS GONE'),700);}
ui.start.onclick=beginGame;
window.__debugGame = { state: () => ({ pos: player.pos.toArray(), started, panelOpen, dialogueOpen, nearest: getNearest()?.name }), moveTo: (x, z) => player.pos.set(x, 0, z) };

function getNearest(){let nearest=null,dist=Infinity;for(const it of interactables){if(it.object&&!it.object.visible)continue;const d=player.pos.distanceTo(worldPosition(it));if(d<it.radius&&d<dist){nearest=it;dist=d;}}return nearest;}
function interact(){if(!started||panelOpen||dialogueOpen)return;if(!ui.timeline.classList.contains('hidden')){closeTimeline();return;}const target=getNearest();if(target){target.action();return;}notify('NOTHING TO INTERACT WITH HERE');}
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();held.add(e.code);if(e.code==='KeyE'||e.code==='Enter')interact();if(e.code==='KeyQ'){const n=getNearest();if(n?.object?.userData.temporal)openTimeline(n.object);else notify('NO TEMPORAL OBJECT IN RANGE');}if(e.code==='Escape'){if(!ui.timeline.classList.contains('hidden'))closeTimeline();else if(panelOpen)closePanel();else if(dialogueOpen)closeEcho();}});
window.addEventListener('keyup',e=>held.delete(e.code));
$('#world').addEventListener('click',()=>{if(started&&matchMedia('(pointer:fine)').matches&&document.pointerLockElement!==$('#world'))$('#world').requestPointerLock?.();});
document.addEventListener('pointerlockchange',()=>{});
window.addEventListener('mousemove',e=>{if(!started||panelOpen||dialogueOpen)return;if(document.pointerLockElement===$('#world')){player.yaw-=e.movementX*.0022*cameraSensitivity;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*.0017*cameraSensitivity,-.45,.42);}else if(pointerDown){player.yaw-=e.movementX*.004*cameraSensitivity;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*.003*cameraSensitivity,-.45,.42);}});
$('#world').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){pointerDown={x:e.clientX,y:e.clientY};$('#world').setPointerCapture(e.pointerId);}});
$('#world').addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&pointerDown){const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;if(e.clientX>innerWidth*.35){player.yaw-=dx*.006*cameraSensitivity;player.pitch=THREE.MathUtils.clamp(player.pitch-dy*.004*cameraSensitivity,-.45,.42);}pointerDown={x:e.clientX,y:e.clientY};}});
$('#world').addEventListener('pointerup',()=>{pointerDown=null;});
// Drag the timeline rail to scrub temporal states.
let railTouch=null;document.querySelector('.time-rail').addEventListener('pointerdown',e=>{railTouch=true;e.currentTarget.setPointerCapture(e.pointerId);scrubTime(e);});document.querySelector('.time-rail').addEventListener('pointermove',e=>{if(railTouch)scrubTime(e);});document.querySelector('.time-rail').addEventListener('pointerup',()=>railTouch=false);
function scrubTime(e){const r=e.currentTarget.getBoundingClientRect(),t=(e.clientX-r.left)/r.width;setTime(t<.34?'past':t<.67?'present':'future');}
$('#mobile-use').onclick=interact;$('#mobile-jump').ontouchstart=(e)=>{e.preventDefault();held.add('Space');};$('#mobile-jump').ontouchend=()=>held.delete('Space');$('#mobile-run').ontouchstart=()=>runHeld=true;$('#mobile-run').ontouchend=()=>runHeld=false;
const joystick=$('#joystick'),knob=$('#joy-knob');joystick.addEventListener('pointerdown',e=>{joystick.setPointerCapture(e.pointerId);moveJoy(e);});joystick.addEventListener('pointermove',e=>{if(e.buttons)moveJoy(e);});joystick.addEventListener('pointerup',()=>{joy={x:0,z:0};knob.style.transform='translate(0,0)';});
function moveJoy(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.min(34,Math.hypot(dx,dy)),ang=Math.atan2(dy,dx);joy.x=Math.cos(ang)*len/34;joy.z=Math.sin(ang)*len/34;knob.style.transform=`translate(${joy.x*25}px,${joy.z*25}px)`;}

function update(dt){if(!started)return;gameTime+=dt;
  if(!panelOpen&&!dialogueOpen){let f=0,s=0;if(held.has('KeyW')||held.has('ArrowUp'))f+=1;if(held.has('KeyS')||held.has('ArrowDown'))f-=1;if(held.has('KeyA')||held.has('ArrowLeft'))s-=1;if(held.has('KeyD')||held.has('ArrowRight'))s+=1;f-=joy.z;s+=joy.x;const len=Math.hypot(f,s);if(len>1){f/=len;s/=len;}const speed=(held.has('ShiftLeft')||held.has('ShiftRight')||runHeld)?7.4:4.15;const forward=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));const right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));player.pos.addScaledVector(forward,f*speed*dt);player.pos.addScaledVector(right,s*speed*dt);player.pos.x=THREE.MathUtils.clamp(player.pos.x,-8.25,8.25);player.pos.z=THREE.MathUtils.clamp(player.pos.z,-15.5,15.2);if(len>.05){avatar.rotation.y=player.yaw;avatar.position.x=player.pos.x;avatar.position.z=player.pos.z;}
    if((held.has('Space')||held.has('ArrowUp')&&held.has('ShiftLeft'))&&player.grounded){player.velocityY=6;player.grounded=false;}player.velocityY-=17*dt;player.pos.y+=player.velocityY*dt;if(player.pos.y<0){player.pos.y=0;player.velocityY=0;player.grounded=true;}
  }
  avatar.position.set(player.pos.x,player.pos.y,player.pos.z);const camDist=7.8,camHeight=3.1;const desired=new THREE.Vector3(player.pos.x+Math.sin(player.yaw)*camDist,player.pos.y+camHeight+player.pitch*2,player.pos.z+Math.cos(player.yaw)*camDist);camera.position.lerp(desired,1-Math.exp(-4.2*dt));camera.lookAt(player.pos.x,player.pos.y+1.25,player.pos.z- Math.cos(player.yaw)*1.5);
  for(const p of particles){if(p.userData.float){p.position.y+=Math.sin(gameTime*1.1+p.position.x)*dt*.12;p.rotation.y+=dt*.15;}else p.material.opacity=.2+Math.sin(gameTime*2+p.position.z)*.1;}
  if(world.portal)world.portal.rotation.y=Math.sin(gameTime*.4)*.035;
  const nearest=getNearest();ui.prompt.classList.toggle('hidden',!nearest||panelOpen||dialogueOpen||!ui.timeline.classList.contains('hidden'));if(nearest)ui.promptLabel.textContent=nearest.name;
}
function loop(){requestAnimationFrame(loop);const dt=Math.min(.04,clock.getDelta());update(dt);renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,graphics==='low'?.8:graphics==='medium'?1:graphics==='high'?1.5:2));});
setTimeout(()=>{ui.loading.classList.add('hidden');},950);
loop();
