let viewer = null;

const CESIUM_JS = "https://ajax.googleapis.com/ajax/libs/cesiumjs/1.124/Build/Cesium/Cesium.js";
const CESIUM_CSS = "https://ajax.googleapis.com/ajax/libs/cesiumjs/1.124/Build/Cesium/Widgets/widgets.css";

export async function mountGoogleGlobe(el, { apiKey }) {
  if (!el || !apiKey) throw new Error("Google Maps Platform API key is required for the Google globe.");
  await loadCesium();
  const Cesium = window.Cesium;

  el.classList.add("google-globe");
  el.innerHTML = `<div class="google-globe-canvas"></div>`;
  const container = el.querySelector(".google-globe-canvas");

  Cesium.RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;
  viewer = new Cesium.Viewer(container, {
    animation:false,
    baseLayerPicker:false,
    fullscreenButton:false,
    geocoder:false,
    homeButton:false,
    infoBox:false,
    navigationHelpButton:false,
    sceneModePicker:false,
    selectionIndicator:false,
    timeline:false,
    requestRenderMode:false,
    imageryProvider:false,
    terrainProvider:undefined,
    shouldAnimate:true
  });

  viewer.scene.globe.show = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;
  viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
    url: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`,
    showCreditsOnScreen: true
  }));
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(103.85, 18.5, 7600000),
    orientation: {
      heading: Cesium.Math.toRadians(8),
      pitch: Cesium.Math.toRadians(-82),
      roll: 0
    }
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) {
    viewer.clock.onTick.addEventListener(() => {
      if (!viewer) return;
      viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.00008);
    });
  }

  addEventListener("resize", sizeGoogleGlobe);
  return viewer;
}

export function sizeGoogleGlobe() {
  viewer?.resize();
}

export function destroyGoogleGlobe() {
  removeEventListener("resize", sizeGoogleGlobe);
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
}

function loadCesium() {
  if (window.Cesium) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CESIUM_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CESIUM_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${CESIUM_JS}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once:true });
      existing.addEventListener("error", reject, { once:true });
      return;
    }
    const script = document.createElement("script");
    script.src = CESIUM_JS;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load CesiumJS for Google Photorealistic 3D Tiles."));
    document.head.appendChild(script);
  });
}
