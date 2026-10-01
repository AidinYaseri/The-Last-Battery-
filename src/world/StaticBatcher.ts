import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges static meshes that share a material into single meshes, cutting draw
 * calls dramatically for the prop-heavy levels. Anything interactive, animated
 * or flagged `userData.dynamic` is left untouched.
 */
export function batchStatic(root: THREE.Group, keep: Set<THREE.Object3D>, occluders: THREE.Object3D[]): number {
  root.updateMatrixWorld(true);
  const protectedSet = new Set<THREE.Object3D>();
  // anything kept (and all its descendants/ancestors chains) is protected
  keep.forEach((o) => o.traverse((c) => protectedSet.add(c)));
  const isProtected = (o: THREE.Object3D): boolean => {
    let p: THREE.Object3D | null = o;
    while (p && p !== root) {
      if (protectedSet.has(p) || p.userData.dynamic) return true;
      p = p.parent;
    }
    return false;
  };
  const occSet = new Set(occluders);
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[]; occ: boolean; cast: boolean; receive: boolean; layers: number }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as any).isInstancedMesh || (m as any).isSkinnedMesh) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if ((mat.transparent && !mat.userData.batchable) || !m.visible) return;
    if (isProtected(m)) return;
    const g = m.geometry;
    if (!g.getAttribute('position') || !g.getAttribute('normal') || !g.getAttribute('uv')) return;
    if (g.getAttribute('color')) return;
    const attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${mat.uuid}|${attrs}|${m.castShadow}|${m.receiveShadow}|${m.layers.mask}`;
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { mat, meshes: [], occ: false, cast: m.castShadow, receive: m.receiveShadow, layers: m.layers.mask }));
    grp.meshes.push(m);
    if (occSet.has(m)) grp.occ = true;
  });
  let removed = 0;
  groups.forEach((grp) => {
    if (grp.meshes.length < 2) return;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of grp.meshes) {
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(m.matrixWorld);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, grp.mat);
    mesh.castShadow = grp.cast;
    mesh.receiveShadow = grp.receive;
    mesh.layers.mask = grp.layers;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    for (const m of grp.meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
      const i = occluders.indexOf(m);
      if (i >= 0) occluders.splice(i, 1);
      removed++;
    }
    if (grp.occ) occluders.push(mesh);
  });
  return removed;
}
