// Three.js is loaded as a classic script from the CDN, which defines the global THREE
// (@types/three declares it). These aliases name its types in the sources, which stay plain scripts.
import type * as _T from 'three';

declare global {
  type TObject3D = _T.Object3D;
  type TGroup = _T.Group;
  type TMesh = _T.Mesh;
  type TMaterial = _T.MeshStandardMaterial;
  type TGeometry = _T.BufferGeometry;
  type TScene = _T.Scene;
  type TCamera = _T.PerspectiveCamera;
  type TRenderer = _T.WebGLRenderer;
  type TLight = _T.Light;
  interface Window { LBModels?: LBModelsApi }
}
