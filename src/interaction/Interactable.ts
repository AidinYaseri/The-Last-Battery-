import type * as THREE from 'three';

export interface Interactable {
  id: string;
  /** Object that is ray-tested (may be an invisible hitbox). */
  object: THREE.Object3D;
  prompt: string | (() => string);
  onInteract: () => void;
  enabled?: () => boolean;
  /** Max interaction distance in metres (default 2.6). */
  range?: number;
}
