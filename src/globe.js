// Adapted from ExoAVData's ExoGlobe and AircraftViews: tokenless Cesium,
// explicit camera ownership, bounded render resolution and satellite mosaic.
import * as C from 'cesium';
import { FT, SITE } from './simulation.js';

export class CockpitGlobe {
  constructor(element, onStatus) {
    this.onStatus = onStatus;
    this.overview = false;
    this.viewer = new C.Viewer(element, {
      animation: false, timeline: false, baseLayer: false, baseLayerPicker: false,
      geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      infoBox: false, selectionIndicator: false, fullscreenButton: false,
      terrainProvider: new C.EllipsoidTerrainProvider(), showRenderLoopErrors: false,
      contextOptions: { webgl: { alpha: false, antialias: true, preserveDrawingBuffer: true } }
    });
    const { viewer } = this;
    viewer.resolutionScale = Math.min(1, 1.5 / (window.devicePixelRatio || 1));
    viewer.targetFrameRate = 30;
    this.renderedFrames = 0;
    viewer.scene.postRender.addEventListener(() => { this.renderedFrames++; });
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#273e43');
    viewer.scene.globe.maximumScreenSpaceError = 3;
    viewer.scene.globe.tileCacheSize = 150;
    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00004;
    viewer.scene.skyBox.show = false;
    viewer.scene.backgroundColor = C.Color.fromCssColorString('#52748a');
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    viewer.camera.frustum.near = 0.5;
    viewer.camera.frustum.fov = C.Math.toRadians(85);
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = C.JulianDate.fromIso8601('2026-11-01T17:49:00Z');

    const provider = new C.UrlTemplateImageryProvider({
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
      maximumLevel: 14,
      credit: new C.Credit('<a href="https://s2maps.eu/" target="_blank" rel="noopener">Sentinel-2 cloudless © EOX · modified Copernicus Sentinel data 2024</a>')
    });
    this.imagery = viewer.imageryLayers.addImageryProvider(provider);
    provider.errorEvent.addEventListener(() => onStatus('Satellite tiles are unavailable. Check your connection; the scenario and instruments continue.'));
    viewer.scene.renderError.addEventListener((scene, error) => onStatus(`3D rendering stopped: ${error.message}. Reload with WebGL enabled.`));
    this.weatherStage = viewer.scene.postProcessStages.add(new C.PostProcessStage({
      name: 'historical-weather-interpretation',
      uniforms: { cloudDensity: () => this.cloudDensity ?? 0, simTime: () => this.time ?? 0, cloudSeed: () => this.seed ?? 0 },
      fragmentShader: `uniform sampler2D colorTexture;
        uniform float cloudDensity;
        uniform float simTime;
        uniform float cloudSeed;
        in vec2 v_textureCoordinates;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 uv=v_textureCoordinates;
          vec4 scene=texture(colorTexture,uv);
          vec2 p=uv*vec2(5.0,3.0)+vec2(simTime*.025+cloudSeed,simTime*.012);
          float n=noise(p)*.6+noise(p*2.3)*.25+noise(p*5.1)*.15;
          vec3 cloud=vec3(.46,.51,.54)+n*.2;
          float density=clamp(cloudDensity*(.82+n*.18),0.0,.96);
          vec3 graded=mix(scene.rgb,scene.rgb*vec3(.80,.88,.95),cloudDensity*.25);
          out_FragColor=vec4(mix(graded,cloud,density),1.0);
        }`
    }));
    this.path = viewer.entities.add({ polyline: { positions: [], width: 2, material: C.Color.fromCssColorString('#dfb67b').withAlpha(.85) }, show: false });
    this.aircraft = viewer.entities.add({ position: C.Cartesian3.fromDegrees(SITE.lon, SITE.lat, 12000), point: { pixelSize: 9, color: C.Color.fromCssColorString('#f5e0bc'), outlineColor: C.Color.BLACK, outlineWidth: 2 }, show: false });
    this.site = viewer.entities.add({ position: C.Cartesian3.fromDegrees(SITE.lon, SITE.lat, 5), point: { pixelSize: 6, color: C.Color.fromCssColorString('#e6aa68') }, label: { text: 'APPROXIMATE IMPACT AREA', font: '10px monospace', fillColor: C.Color.fromCssColorString('#e6c497'), pixelOffset: new C.Cartesian2(0, -18), style: C.LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3 }, show: false });
    this.ready = new Promise(resolve => {
      const remove = viewer.scene.globe.tileLoadProgressEvent.addEventListener(count => { if (!count) { remove(); resolve(); } });
      setTimeout(resolve, 10000);
    });
  }
  setTrack(track) {
    this.path.polyline.positions = track.samples.map(s => C.Cartesian3.fromDegrees(s.lon, s.lat, s.altitudeFt * FT));
  }
  update(sample, { weather = true, motion = true } = {}) {
    this.time = sample.time;
    this.seed = sample.heading / 50;
    this.cloudDensity = weather ? sample.weather.cloud * .93 : 0;
    const camera = this.viewer.camera;
    const position = C.Cartesian3.fromDegrees(sample.lon, sample.lat, Math.max(2, sample.altitudeFt * FT + 1.6));
    if (this.overview) {
      camera.lookAt(position, new C.HeadingPitchRange(C.Math.toRadians(-30), C.Math.toRadians(-35), 29000));
      camera.lookAtTransform(C.Matrix4.IDENTITY);
      this.aircraft.position = position;
      this.cloudDensity *= .15;
    } else {
      const shake = weather && motion && !sample.finished ? sample.weather.turbulence : 0;
      camera.setView({ destination: position, orientation: {
        heading: C.Math.toRadians(sample.heading + shake * .35),
        pitch: C.Math.toRadians(C.Math.clamp(sample.pitch + shake * .6, -89, 85)),
        roll: C.Math.toRadians(sample.bank + shake * 1.1)
      } });
    }
  }
  toggleOverview() {
    this.overview = !this.overview;
    this.path.show = this.aircraft.show = this.site.show = this.overview;
    return this.overview;
  }
  destroy() { this.viewer.destroy(); }
}
