import * as C from 'cesium';

/** Bundled OSM footprints; no runtime keys or public Overpass requests. */
export class LocalBuildings {
  constructor(viewer) {
    this.viewer = viewer;
    this.collection = viewer.scene.primitives.add(new C.PrimitiveCollection());
    this.count = 0;
    this.batches = [];
    this.credit = new C.Credit('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">3D footprints © OpenStreetMap contributors · ODbL · heights estimated</a>', true);
    this.ready = this.load();
  }
  async load() {
    const response = await fetch(`${import.meta.env.BASE_URL}data/buildings.json`);
    if (!response.ok) throw new Error(`Buildings HTTP ${response.status}`);
    const data = await response.json();
    const base = 0; // Match the rendered ellipsoid terrain; no floating bases.
    for (let start = 0; start < data.features.length; start += 350) {
      const instances = data.features.slice(start, start + 350).map(feature => {
        const shade = feature.id % 5;
        const color = C.Color.fromCssColorString(['#b7b6aa', '#c9c5b5', '#aaa99d', '#d0cbbd', '#b9b6ac'][shade]);
        return new C.GeometryInstance({
          geometry: new C.PolygonGeometry({
            polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(feature.ring.slice(0, -1).flat())),
            height: base + feature.heightM, extrudedHeight: base,
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
          }),
          attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color) }
        });
      });
      this.batches.push(this.collection.add(new C.Primitive({
        geometryInstances: instances, asynchronous: true, allowPicking: false,
        appearance: new C.PerInstanceColorAppearance({ closed: true, translucent: false })
      })));
    }
    this.count = data.features.length;
    this.viewer.cesiumWidget.creditDisplay.addStaticCredit(this.credit);
    return this.count;
  }
  get rendered() { return this.batches.length > 0 && this.batches.every(batch => batch.ready); }
  set show(value) { this.collection.show = value; }
  get show() { return this.collection.show; }
}
