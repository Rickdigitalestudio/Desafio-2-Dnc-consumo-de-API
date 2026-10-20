/* ============================================================
   DncWeather 3D · cena meteorológica WebGL (Three.js)
   - Ilha flutuante com casa, árvores, lago e estação anemométrica
   - Sol/lua, estrelas, nuvens, chuva, neve, névoa e relâmpagos
   - Tudo dirigido pelos dados em tempo real da Open-Meteo
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEG = Math.PI / 180;
const lerp = THREE.MathUtils.lerp;

/* ---------- texturas procedurais ---------- */
function radialTexture(rgb = '255,255,255', size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${rgb},1)`);
    grd.addColorStop(0.35, `rgba(${rgb},0.55)`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
}

function streakTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, 'rgba(190,225,255,0)');
    grd.addColorStop(0.5, 'rgba(200,230,255,0.95)');
    grd.addColorStop(1, 'rgba(190,225,255,0)');
    g.fillStyle = grd;
    g.fillRect(14, 0, 4, 32);
    return new THREE.CanvasTexture(c);
}

function starTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(220,235,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
}

/* ---------- paletas de céu ---------- */
function skyPalette(code, isDay, cloud) {
    if (!isDay) {
        if (code >= 95) return [0x070a14, 0x1b2230];
        if (code >= 61) return [0x080e1c, 0x1b2b3e];
        return [0x040a1c, 0x14304f];
    }
    if (code >= 95) return [0x232a38, 0x565f70];
    if (code >= 61) return [0x37485e, 0x8797a8];
    if (code >= 45) return [0x5c6b7d, 0xb4bfc9];
    if (code >= 3 || cloud >= 85) return [0x4a6f96, 0xa9bccd];
    if (cloud >= 45) return [0x2f7fc4, 0xbcdcef];
    return [0x1e6fd6, 0xa9d9f7];
}

const cloudShadeFor = (code, isDay) => {
    if (code >= 95) return 0x5a6272;
    if (code >= 61) return 0x9aa6b4;
    if (!isDay) return 0x6a7b93;
    return 0xffffff;
};

/* ============================================================
   CENA PRINCIPAL
   ============================================================ */
export class WeatherScene {
    constructor(canvas) {
        this.canvas = canvas;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x9fc6e8, 0.012);

        this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
        this.camera.position.set(11, 7.5, 13.5);

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.target.set(0, 2, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.enablePan = false;
        this.controls.minDistance = 9;
        this.controls.maxDistance = 34;
        this.controls.maxPolarAngle = 1.47;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.5;
        this.camera.position.set(...this.camera.position.toArray());
        this._camHome = this.camera.position.clone();

        /* ---- estado alvo (animado) ---- */
        this.tgt = {
            top: new THREE.Color(0x1e6fd6),
            bottom: new THREE.Color(0xa9d9f7),
            shade: new THREE.Color(0xffffff),
            fog: new THREE.Color(0x9fc6e8),
            cloudCover: 0.5, rain: 0, snow: 0, storm: 0,
            fogDensity: 0.012, wind: 8, night: 0, cloudBoost: 0
        };
        this.cur = {
            top: this.tgt.top.clone(), bottom: this.tgt.bottom.clone(),
            shade: this.tgt.shade.clone(), fog: this.tgt.fog.clone(),
            cloudCover: 0.5, rain: 0, snow: 0, storm: 0,
            fogDensity: 0.012, wind: 8, night: 0
        };

        this._buildSky();
        this._buildLights();
        this._buildIsland();
        this._buildClouds();
        this._buildRain();
        this._buildStars();
        this._buildLightning();

        this._t = 0;
        this._last = 0;
        this._whiteCol = new THREE.Color(0xffffff);
        this._boltTimer = 3;
        this._flashLife = 0;
        this._visible = true;
        this._disposed = false;

        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
        if (window.ResizeObserver) {
            this._ro = new ResizeObserver(this._onResize);
            this._ro.observe(canvas.parentElement || canvas);
        }

        if ('IntersectionObserver' in window) {
            this._io = new IntersectionObserver((e) => { this._visible = e[0].isIntersecting; }, { threshold: 0.02 });
            this._io.observe(canvas);
        }

        this.resize();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    /* ---------------- céu ---------------- */
    _buildSky() {
        const geo = new THREE.SphereGeometry(160, 32, 20);
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: { top: { value: this.tgt.top }, bottom: { value: this.tgt.bottom } },
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
                void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, pow(clamp(h,0.0,1.0), 0.75)), 1.0); }`
        });
        this.sky = new THREE.Mesh(geo, mat);
        this.scene.add(this.sky);

        /* sol */
        this.sun = new THREE.Group();
        const sunCore = new THREE.Mesh(
            new THREE.SphereGeometry(2.4, 24, 20),
            new THREE.MeshBasicMaterial({ color: 0xffe08a })
        );
        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: radialTexture('255,214,110'), transparent: true, depthWrite: false, opacity: 0.95
        }));
        sunGlow.scale.set(22, 22, 1);
        this.sun.add(sunCore, sunGlow);
        this.sun.position.set(30, 34, -46);
        this.scene.add(this.sun);

        /* lua */
        this.moon = new THREE.Group();
        const moonCore = new THREE.Mesh(
            new THREE.SphereGeometry(1.9, 24, 20),
            new THREE.MeshStandardMaterial({ color: 0xe6edf7, roughness: 1, emissive: 0x2a3550, emissiveIntensity: 0.7 })
        );
        const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: radialTexture('190,215,255'), transparent: true, depthWrite: false, opacity: 0.7
        }));
        moonGlow.scale.set(14, 14, 1);
        this.moon.add(moonCore, moonGlow);
        this.moon.position.set(-34, 30, -44);
        this.moon.visible = false;
        this.scene.add(this.moon);
    }

    _buildLights() {
        this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x33507a, 0.95);
        this.scene.add(this.hemi);

        this.dir = new THREE.DirectionalLight(0xfff3d6, 1.7);
        this.dir.position.set(14, 20, 9);
        this.dir.castShadow = true;
        this.dir.shadow.mapSize.set(1024, 1024);
        const c = this.dir.shadow.camera;
        c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 60;
        this.scene.add(this.dir);

        this.amb = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(this.amb);
    }

    /* ---------------- ilha ---------------- */
    _buildIsland() {
        const island = new THREE.Group();
        this.island = island;
        this.scene.add(island);

        const grass = new THREE.Mesh(
            new THREE.CylinderGeometry(7, 6.4, 0.8, 56),
            new THREE.MeshStandardMaterial({ color: 0x57a34b, roughness: 0.95 })
        );
        grass.position.y = -0.4;
        grass.receiveShadow = true;
        island.add(grass);

        const soil = new THREE.Mesh(
            new THREE.CylinderGeometry(6.4, 3, 3.4, 56),
            new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 })
        );
        soil.position.y = -2.5;
        island.add(soil);

        const tip = new THREE.Mesh(
            new THREE.ConeGeometry(3, 4.4, 40),
            new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 1 })
        );
        tip.rotation.x = Math.PI;
        tip.position.y = -6.3;
        island.add(tip);

        /* lago */
        this.lake = new THREE.Mesh(
            new THREE.CircleGeometry(2.1, 48),
            new THREE.MeshStandardMaterial({ color: 0x39a4dd, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.92 })
        );
        this.lake.rotation.x = -Math.PI / 2;
        this.lake.position.set(3.1, 0.02, -2.6);
        island.add(this.lake);

        /* casa */
        const house = new THREE.Group();
        const walls = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 1.7, 2.1),
            new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.85 })
        );
        walls.position.y = 0.85;
        walls.castShadow = true;
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(2.1, 1.2, 4),
            new THREE.MeshStandardMaterial({ color: 0xc0503f, roughness: 0.8 })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 2.1;
        roof.castShadow = true;
        house.add(walls, roof);

        this.windowMat = new THREE.MeshStandardMaterial({ color: 0x2f4d6b, emissive: 0xffcf7a, emissiveIntensity: 0.06 });
        [[1.31, 1.0, 0.5], [1.31, 1.0, -0.5]].forEach((p) => {
            const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), this.windowMat);
            w.position.set(...p);
            w.rotation.y = Math.PI / 2;
            house.add(w);
        });
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.9, 0.55),
            new THREE.MeshStandardMaterial({ color: 0x7a4a2b })
        );
        door.position.set(1.31, 0.45, 0);
        house.add(door);
        house.position.set(-3.4, 0, 2.1);
        house.rotation.y = -0.35;
        island.add(house);
        this.house = house;

        /* árvores */
        this.trees = [];
        const treeSpots = [[4.6, 1.6], [5.2, -0.6], [1.2, 4.6], [-1.4, 4.9], [-5.4, -1.2], [-4.4, -3.4], [1.6, -4.9], [-0.6, -5.4], [4.6, 3.4]];
        treeSpots.forEach(([x, z], i) => {
            const t = this._makeTree(0.85 + ((i * 37) % 40) / 100);
            t.position.set(x, 0, z);
            t.rotation.y = i * 1.3;
            island.add(t);
            this.trees.push(t);
        });

        /* arbustos e pedras */
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3c, roughness: 1 });
        [[2.4, 3.9], [-2.2, -4.2], [-5.9, 1.4], [0.4, 2.6]].forEach(([x, z]) => {
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), bushMat);
            b.position.set(x, 0.4, z);
            b.scale.y = 0.75;
            b.castShadow = true;
            island.add(b);
        });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 1, flatShading: true });
        [[-1.9, 3.1, 0.5], [5.7, -2.9, 0.42], [-6.1, -0.4, 0.36]].forEach(([x, z, s]) => {
            const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
            r.position.set(x, s * 0.6, z);
            r.rotation.set(x, z, x + z);
            r.castShadow = true;
            island.add(r);
        });

        /* estação meteorológica (anemômetro) */
        const st = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.09, 2.6, 10),
            new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.6, roughness: 0.35 })
        );
        pole.position.y = 1.3;
        pole.castShadow = true;
        st.add(pole);
        this.anemo = new THREE.Group();
        this.anemo.position.y = 2.65;
        for (let i = 0; i < 3; i++) {
            const arm = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.03, 0.03),
                new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.6, roughness: 0.35 })
            );
            arm.position.x = 0.35;
            const cup = new THREE.Mesh(
                new THREE.SphereGeometry(0.11, 10, 8),
                new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5 })
            );
            cup.position.x = 0.72;
            const g = new THREE.Group();
            g.add(arm, cup);
            g.rotation.y = (i * Math.PI * 2) / 3;
            this.anemo.add(g);
        }
        st.add(this.anemo);
        const vane = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.03, 1),
            new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.6, roughness: 0.35 })
        );
        vane.position.y = 2.2;
        this.vane = vane;
        st.add(vane);
        st.position.set(2.9, 0, 3.4);
        island.add(st);
        this.station = st;
    }

    _makeTree(scale) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8),
            new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 })
        );
        trunk.position.y = 0.55;
        trunk.castShadow = true;
        g.add(trunk);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a45, roughness: 0.95, flatShading: true });
        [[1.5, 1.05, 0.95], [2.2, 0.8, 0.7], [2.75, 0.55, 0.45]].forEach(([y, r, h]) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 1.9, 9), leafMat);
            cone.position.y = y;
            cone.castShadow = true;
            g.add(cone);
        });
        g.scale.setScalar(scale);
        return g;
    }

    /* ---------------- nuvens ---------------- */
    _buildClouds() {
        this.clouds = [];
        this.cloudGroup = new THREE.Group();
        this.scene.add(this.cloudGroup);
        for (let i = 0; i < 11; i++) {
            const g = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff, roughness: 1, transparent: true, opacity: 0.95, flatShading: true
            });
            const puffs = 4 + (i % 3);
            for (let p = 0; p < puffs; p++) {
                const r = 0.9 + Math.random() * 1.2;
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
                s.position.set((p - puffs / 2) * 1.15 + Math.random() * 0.5, Math.random() * 0.7, (Math.random() - 0.5) * 1.5);
                g.add(s);
            }
            g.scale.setScalar(0.85 + Math.random() * 1.1);
            g.position.set(
                -20 + Math.random() * 40,
                8.5 + Math.random() * 5,
                -16 + Math.random() * 26
            );
            this.cloudGroup.add(g);
            this.clouds.push({ g, mat, speed: 0.25 + Math.random() * 0.5, seed: Math.random() * 10 });
        }
    }

    /* ---------------- chuva / neve ---------------- */
    _buildRain() {
        this.RAIN = 2400;
        const pos = new Float32Array(this.RAIN * 3);
        for (let i = 0; i < this.RAIN; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 34;
            pos[i * 3 + 1] = Math.random() * 20;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.rainMat = new THREE.PointsMaterial({
            color: 0xbfe1ff, size: 0.55, map: streakTexture(), transparent: true,
            opacity: 0, depthWrite: false, sizeAttenuation: true
        });
        this.rainPts = new THREE.Points(geo, this.rainMat);
        this.rainPts.frustumCulled = false;
        this.scene.add(this.rainPts);

        this.SNOW = 1400;
        const spos = new Float32Array(this.SNOW * 3);
        for (let i = 0; i < this.SNOW; i++) {
            spos[i * 3] = (Math.random() - 0.5) * 32;
            spos[i * 3 + 1] = Math.random() * 20;
            spos[i * 3 + 2] = (Math.random() - 0.5) * 32;
        }
        const sgeo = new THREE.BufferGeometry();
        sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
        this.snowMat = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.3, map: radialTexture('255,255,255', 64), transparent: true,
            opacity: 0, depthWrite: false, sizeAttenuation: true
        });
        this.snowPts = new THREE.Points(sgeo, this.snowMat);
        this.snowPts.frustumCulled = false;
        this.scene.add(this.snowPts);
    }

    _buildStars() {
        const N = 900;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const r = 90 + Math.random() * 50;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(Math.random() * 0.95);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) + 4;
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.starMat = new THREE.PointsMaterial({
            size: 1.6, map: starTexture(), transparent: true, opacity: 0,
            depthWrite: false, sizeAttenuation: true
        });
        this.stars = new THREE.Points(geo, this.starMat);
        this.scene.add(this.stars);
    }

    _buildLightning() {
        const N = 12;
        const pos = new Float32Array(N * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.boltMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        this.bolt = new THREE.Line(geo, this.boltMat);
        this.bolt.visible = false;
        this.scene.add(this.bolt);
        this.flash = new THREE.PointLight(0xcfe0ff, 0, 70, 1.6);
        this.flash.position.set(0, 11, 0);
        this.scene.add(this.flash);
    }

    /* ---------------- API pública ---------------- */
    setWeather({ code = 0, isDay = true, temperature = 24, humidity = 60, wind = 10, cloud = 30, precipitation = 0 } = {}) {
        const t = this.tgt;
        const [top, bottom] = skyPalette(code, isDay, cloud);
        t.top.setHex(top);
        t.bottom.setHex(bottom);
        t.fog.setHex(bottom);
        t.shade.setHex(cloudShadeFor(code, isDay));

        let cover = cloud / 100;
        if (code >= 3) cover = Math.max(cover, 0.9);
        if (code >= 61) cover = Math.max(cover, 0.95);
        if (code === 0) cover = Math.min(cover, 0.12);
        t.cloudCover = THREE.MathUtils.clamp(cover, 0.05, 1);

        /* intensidade de precipitação */
        let rain = 0, snow = 0;
        const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86 || (temperature <= 0 && precipitation > 0);
        if (code >= 51 && code <= 57) rain = 0.3;
        else if (code >= 61 && code <= 67) rain = 0.6;
        else if (code >= 80 && code <= 82) rain = 0.9;
        else if (code >= 95) rain = 1;
        else if (precipitation > 0) rain = Math.min(1, 0.25 + precipitation / 3);
        if (isSnow) {
            snow = precipitation > 0 ? Math.min(1, 0.5 + precipitation / 3) : 0.6;
            rain = 0;
        }

        t.rain = rain;
        t.snow = snow;
        t.storm = code >= 95 ? 1 : 0;
        t.fogDensity = (code === 45 || code === 48) ? 0.06 : (rain > 0 ? 0.022 : (cloud > 70 ? 0.016 : 0.011));
        if (code >= 61 && temperature < 6) t.fogDensity = 0.03;
        t.wind = wind;
        t.night = isDay ? 0 : 1;

        this.hudData = { code, isDay, temperature, humidity, wind, cloud, precipitation };
    }

    setAutoRotate(on) { this.controls.autoRotate = !!on; }

    resetCamera() {
        this.camera.position.copy(this._camHome);
        this.controls.target.set(0, 2, 0);
        this.controls.update();
    }

    resize() {
        const cw = this.canvas.clientWidth;
        const ch = this.canvas.clientHeight;
        const par = this.canvas.parentElement;
        const w = cw || (par ? par.clientWidth : 0) || 600;
        const h = ch || (par ? par.clientHeight : 0) || 420;
        this._w = cw; this._h = ch;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /* ---------------- loop ---------------- */
    _loop() {
        if (this._disposed) return;
        requestAnimationFrame(this._loop);
        if (document.hidden || !this._visible) return;

        const now = performance.now();
        if (!this._last) this._last = now;
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this._t += dt;
        if (this.canvas.clientWidth !== this._w || this.canvas.clientHeight !== this._h) this.resize();

        /* interpolação do estado */
        const k = Math.min(1, dt * 1.6);
        const c = this.cur, t = this.tgt;
        c.top.lerp(t.top, k); c.bottom.lerp(t.bottom, k);
        c.shade.lerp(t.shade, k); c.fog.lerp(t.fog, k);
        c.cloudCover = lerp(c.cloudCover, t.cloudCover, k);
        c.rain = lerp(c.rain, t.rain, k);
        c.snow = lerp(c.snow, t.snow, k);
        c.storm = lerp(c.storm, t.storm, k);
        c.fogDensity = lerp(c.fogDensity, t.fogDensity, k);
        c.wind = lerp(c.wind, t.wind, k);
        c.night = lerp(c.night, t.night, k);

        this.sky.material.uniforms.top.value.copy(c.top);
        this.sky.material.uniforms.bottom.value.copy(c.bottom);
        this.scene.fog.color.copy(c.fog);
        this.scene.fog.density = c.fogDensity;

        /* sol / lua / estrelas / luzes */
        this.sun.visible = c.night < 0.97;
        this.sun.children[1].material.opacity = 0.95 * (1 - c.night);
        this.moon.visible = c.night > 0.03;
        this.starMat.opacity = 0.95 * c.night;
        this.hemi.intensity = lerp(0.95, 0.35, c.night);
        this.dir.intensity = lerp(1.7, 0.35, c.night);
        this.amb.intensity = lerp(0.25, 0.14, c.night);
        this.dir.color.setHex(c.night > 0.5 ? 0x9fb8e8 : 0xfff3d6);
        this.windowMat.emissiveIntensity = lerp(0.06, 1.5, c.night);

        /* nuvens */
        const windF = 0.5 + c.wind / 26;
        const visibleN = Math.round(2 + c.cloudCover * 9);
        this.clouds.forEach((cl, i) => {
            cl.g.visible = i < visibleN;
            if (!cl.g.visible) return;
            cl.g.position.x += cl.speed * windF * dt;
            if (cl.g.position.x > 24) cl.g.position.x = -24;
            cl.g.position.y += Math.sin(this._t * 0.4 + cl.seed) * dt * 0.25;
            cl.mat.color.lerpColors(this._whiteCol, c.shade, 1 - c.night * 0.3);
            cl.mat.opacity = 0.95 - (c.night * 0.15);
        });

        /* chuva */
        const rainOn = c.rain > 0.02;
        this.rainPts.visible = rainOn;
        if (rainOn) {
            this.rainMat.opacity = Math.min(1, c.rain * 1.15);
            this.rainPts.geometry.setDrawRange(0, Math.floor(this.RAIN * (0.25 + c.rain * 0.75)));
            const p = this.rainPts.geometry.attributes.position;
            const arr = p.array;
            const fall = (16 + c.rain * 26) * dt;
            const drift = (c.wind / 16) * dt * 6;
            for (let i = 0; i < this.RAIN; i++) {
                const i3 = i * 3;
                arr[i3 + 1] -= fall;
                arr[i3] += drift;
                if (arr[i3 + 1] < -0.2 || arr[i3] > 18) {
                    arr[i3] = (Math.random() - 0.5) * 34;
                    arr[i3 + 1] = 16 + Math.random() * 6;
                    arr[i3 + 2] = (Math.random() - 0.5) * 34;
                }
            }
            p.needsUpdate = true;
        }

        /* neve */
        const snowOn = c.snow > 0.02;
        this.snowPts.visible = snowOn;
        if (snowOn) {
            this.snowMat.opacity = Math.min(1, c.snow * 1.2);
            this.snowPts.geometry.setDrawRange(0, Math.floor(this.SNOW * (0.3 + c.snow * 0.7)));
            const p = this.snowPts.geometry.attributes.position;
            const arr = p.array;
            const fall = (1.6 + c.snow * 3) * dt;
            const drift = (c.wind / 22) * dt * 4;
            for (let i = 0; i < this.SNOW; i++) {
                const i3 = i * 3;
                arr[i3 + 1] -= fall;
                arr[i3] += drift + Math.sin(this._t * 1.5 + i) * dt * 0.9;
                if (arr[i3 + 1] < -0.2 || arr[i3] > 18) {
                    arr[i3] = (Math.random() - 0.5) * 32;
                    arr[i3 + 1] = 16 + Math.random() * 6;
                    arr[i3 + 2] = (Math.random() - 0.5) * 32;
                }
            }
            p.needsUpdate = true;
        }

        /* relâmpagos */
        if (c.storm > 0.5) {
            this._boltTimer -= dt;
            if (this._boltTimer <= 0) {
                this._triggerBolt();
                this._boltTimer = 1.6 + Math.random() * 3.5;
            }
        }
        if (this._flashLife > 0) {
            this._flashLife = Math.max(0, this._flashLife - dt);
            const f = this._flashLife / 0.4;
            const flick = Math.sin(this._flashLife * 55) * 0.5 + 0.5;
            this.boltMat.opacity = f * (0.35 + flick * 0.65);
            this.flash.intensity = f * flick * 26;
        } else {
            this.boltMat.opacity = 0;
            this.flash.intensity = 0;
            this.bolt.visible = false;
        }

        /* vento: anemômetro, vane, árvores, lago */
        this.anemo.rotation.y += (0.6 + c.wind * 0.35) * dt;
        this.vane.rotation.y = lerp(this.vane.rotation.y, (c.wind * 2) * DEG, dt * 2);
        this.trees.forEach((tr, i) => {
            tr.rotation.z = Math.sin(this._t * (1 + (i % 3) * 0.4) + i) * 0.035 * Math.min(3, c.wind / 12);
        });
        this.lake.material.opacity = 0.92 - c.rain * 0.2;
        this.lake.scale.setScalar(1 + Math.sin(this._t * 1.6) * 0.006);

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _triggerBolt() {
        const arr = this.bolt.geometry.attributes.position.array;
        const sx = (Math.random() - 0.5) * 16;
        const sz = (Math.random() - 0.5) * 14;
        const N = arr.length / 3;
        for (let i = 0; i < N; i++) {
            const p = i / (N - 1);
            arr[i * 3] = sx + (Math.random() - 0.5) * 2.2 * (1 - p) + Math.sin(p * 14) * 0.7;
            arr[i * 3 + 1] = 11 - p * 11;
            arr[i * 3 + 2] = sz + (Math.random() - 0.5) * 1.6 * (1 - p);
        }
        this.bolt.geometry.attributes.position.needsUpdate = true;
        this.bolt.visible = true;
        this.flash.position.set(sx, 10, sz);
        this._flashLife = 0.4;
    }

    dispose() {
        this._disposed = true;
        window.removeEventListener('resize', this._onResize);
        if (this._ro) this._ro.disconnect();
        if (this._io) this._io.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
    }
}

/* ============================================================
   GLOBO 3D (mini) com o marcador da localização
   ============================================================ */
export class Globe3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
        this.camera.position.set(0, 0.7, 4.4);
        this.camera.lookAt(0, 0, 0);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(3, 4, 5);
        this.scene.add(dir);

        this.group = new THREE.Group();
        this.group.rotation.z = 0.32;
        this.scene.add(this.group);

        const core = new THREE.Mesh(
            new THREE.SphereGeometry(1, 40, 26),
            new THREE.MeshStandardMaterial({ color: 0x0d2c4d, roughness: 0.8, metalness: 0.15 })
        );
        const wire = new THREE.Mesh(
            new THREE.SphereGeometry(1.012, 24, 16),
            new THREE.MeshBasicMaterial({ color: 0x59b0e8, wireframe: true, transparent: true, opacity: 0.35 })
        );
        const eq = new THREE.Mesh(
            new THREE.TorusGeometry(1.02, 0.006, 6, 80),
            new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.75 })
        );
        eq.rotation.x = Math.PI / 2;
        this.group.add(core, wire, eq);

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: radialTexture('90,170,240'), transparent: true, opacity: 0.5, depthWrite: false
        }));
        glow.scale.set(3.4, 3.4, 1);
        this.scene.add(glow);

        /* marcador */
        this.marker = new THREE.Group();
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xff8a3d })
        );
        dot.position.z = 0.02;
        this.ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.012, 8, 40),
            new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.9 })
        );
        const pin = new THREE.Mesh(
            new THREE.ConeGeometry(0.045, 0.34, 12),
            new THREE.MeshBasicMaterial({ color: 0xffcf4d })
        );
        pin.rotation.x = Math.PI / 2;
        pin.position.z = 0.2;
        this.marker.add(dot, this.ring, pin);
        this.marker.visible = false;
        this.group.add(this.marker);

        this._t = 0;
        this._visible = true;
        this._disposed = false;
        window.addEventListener('resize', () => this.resize());
        if (window.ResizeObserver) {
            this._ro = new ResizeObserver(() => this.resize());
            this._ro.observe(canvas.parentElement || canvas);
        }
        if ('IntersectionObserver' in window) {
            this._io = new IntersectionObserver((e) => { this._visible = e[0].isIntersecting; }, { threshold: 0.05 });
            this._io.observe(canvas);
        }
        this.resize();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    setLocation(lat, lon) {
        const phi = (90 - lat) * DEG;
        const theta = (lon + 180) * DEG;
        const r = 1.02;
        const x = -r * Math.sin(phi) * Math.cos(theta);
        const z = r * Math.sin(phi) * Math.sin(theta);
        const y = r * Math.cos(phi);
        this.marker.position.set(x, y, z);
        this.marker.lookAt(0, 0, 0);
        this.marker.visible = true;
    }

    resize() {
        const cw = this.canvas.clientWidth;
        const ch = this.canvas.clientHeight;
        const par = this.canvas.parentElement;
        const w = cw || (par ? par.clientWidth : 0) || 240;
        const h = ch || (par ? par.clientHeight : 0) || 240;
        this._w = cw; this._h = ch;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _loop() {
        if (this._disposed) return;
        requestAnimationFrame(this._loop);
        if (document.hidden || !this._visible) return;
        this._t += 0.016;
        if (this.canvas.clientWidth !== this._w || this.canvas.clientHeight !== this._h) this.resize();
        this.group.rotation.y += 0.0045;
        if (this.marker.visible) {
            const s = 1 + Math.sin(this._t * 3) * 0.22;
            this.ring.scale.setScalar(s);
            this.ring.material.opacity = 0.55 + Math.sin(this._t * 3) * 0.35;
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this._disposed = true;
        if (this._io) this._io.disconnect();
        if (this._ro) this._ro.disconnect();
        this.renderer.dispose();
    }
}
