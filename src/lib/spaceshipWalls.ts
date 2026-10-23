import * as THREE from 'three';

/** Check if a mesh in spaceship.glb corresponds to a solid wall/hull shell */
function isSpaceshipWall(child: THREE.Object3D): boolean {
  if (!(child instanceof THREE.Mesh)) return false;
  const name = child.name.toLowerCase().replace(/[\s_\-\.]+/g, '');
  const parentName = child.parent?.name.toLowerCase().replace(/[\s_\-\.]+/g, '') || '';

  // Entrance door boundary should be included as a solid wall
  if (name.includes('doorboundry') || name.includes('doorboundary')) return true;

  // Exclude elevator glass, sliding doors, elevator tube, characters
  if (
    name.includes('glass') ||
    name.includes('door') ||
    name.includes('gate') ||
    name.includes('tube') ||
    name.includes('avatar') ||
    name.includes('guide')
  ) {
    return false;
  }

  // Shell meshes that define the walls of each level & exterior hull:
  // 1. Floor 1 / Ground floor: Main_Room, inside_wall
  // 2. Floor 2: BezierCurve5461_1 or meshes under second_level
  // 3. Floor 3: BezierCurve002_1 or meshes under third_level
  // 4. Exterior hull: F_ENT_NX
  return (
    name.includes('mainroom') ||
    name.includes('insidewall') ||
    name.includes('fentnx') ||
    name.includes('beziercurve54611') ||
    name.includes('beziercurve0021') ||
    (parentName.includes('secondlevel') && !name.includes('beziercurve5461')) ||
    (parentName.includes('thirdlevel') && !name.includes('beziercurve002'))
  );
}

/** Lightweight horizontal swept ray checks against existing spaceship geometry without an Octree. */
export class SpaceshipWalls {
  private readonly material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly walls: { mesh: THREE.Mesh; bounds: THREE.Box3; normalMatrix: THREE.Matrix3 }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly sweepBounds = new THREE.Box3();
  private readonly position = new THREE.Vector3();
  private readonly remaining = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly blockingNormal = new THREE.Vector3();
  private readonly pushRay = new THREE.Raycaster();
  private readonly pushHits: THREE.Intersection[] = [];
  private readonly skin = 0.02;

  setFromSpaceship(root: THREE.Object3D) {
    this.walls.length = 0;
    root.updateWorldMatrix(true, true);
    root.traverse(child => {
      if (!isSpaceshipWall(child)) return;
      const meshChild = child as THREE.Mesh;
      const geometry = meshChild.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();

      // Share vertex/index buffers. A separate material makes collision two-sided
      // without changing the rendered materials or copying any triangle data.
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorld.copy(meshChild.matrixWorld);
      this.walls.push({
        mesh,
        bounds: geometry.boundingBox!.clone().applyMatrix4(meshChild.matrixWorld),
        normalMatrix: new THREE.Matrix3().getNormalMatrix(meshChild.matrixWorld),
      });
    });
  }

  /**
   * Constrains horizontal displacement against spaceship walls.
   * Mutates displacement and velocity so the player slides along walls.
   * Vertical motion (gravity, floors, elevators) is handled separately.
   */
  constrain(start: THREE.Vector3, displacement: THREE.Vector3, radius: number, height: number, velocity: THREE.Vector3) {
    if (this.walls.length === 0) return;

    // Use at least 0.4m radius for solid wall collision
    const r = Math.max(0.4, radius);
    this.position.copy(start);
    this.remaining.set(displacement.x, 0, displacement.z);

    // 1. Re-sweep the remaining motion after each contact to slide along walls and stop at corners.
    for (let pass = 0; pass < 3 && this.remaining.lengthSq() > 1e-12; pass++) {
      const distance = this.remaining.length();
      this.direction.copy(this.remaining).divideScalar(distance);
      this.sweepBounds.min.set(
        Math.min(this.position.x, this.position.x + this.remaining.x) - r - this.skin,
        start.y,
        Math.min(this.position.z, this.position.z + this.remaining.z) - r - this.skin,
      );
      this.sweepBounds.max.set(
        Math.max(this.position.x, this.position.x + this.remaining.x) + r + this.skin,
        start.y + height,
        Math.max(this.position.z, this.position.z + this.remaining.z) + r + this.skin,
      );

      let allowed = distance;
      let blocked = false;

      for (const wall of this.walls) {
        if (!wall.bounds.intersectsBox(this.sweepBounds)) continue;

        // Sample feet (0.5m), torso (height * 0.5), and eye level (height - 0.5m)
        const sideOffset = r * 0.7;
        for (const y of [0.5, height * 0.5, height - 0.5]) {
          for (const side of [-sideOffset, 0, sideOffset]) {
            this.origin.set(
              this.position.x - this.direction.z * side,
              start.y + y,
              this.position.z + this.direction.x * side,
            );
            this.raycaster.set(this.origin, this.direction);
            this.raycaster.far = distance + r + this.skin;
            this.hits.length = 0;
            wall.mesh.raycast(this.raycaster, this.hits);

            for (const hit of this.hits) {
              if (!hit.face) continue;
              this.normal.copy(hit.face.normal).applyNormalMatrix(wall.normalMatrix);
              // Floors and ceilings continue to use downward raycasting; ignore horizontal faces
              if (Math.abs(this.normal.y) > 0.5) continue;
              this.normal.y = 0;
              this.normal.normalize();
              if (this.normal.dot(this.direction) > 0) this.normal.negate();
              const approach = -this.normal.dot(this.direction);
              if (approach < 1e-6) continue;
              const travel = Math.max(0, hit.distance - (r + this.skin) / approach);
              if (travel < allowed) {
                allowed = travel;
                this.blockingNormal.copy(this.normal);
                blocked = true;
              }
            }
          }
        }
      }

      this.position.addScaledVector(this.direction, allowed);
      if (!blocked) break;
      this.remaining.addScaledVector(this.direction, -allowed);
      this.remaining.addScaledVector(this.blockingNormal, -this.remaining.dot(this.blockingNormal));
      const intoWall = velocity.dot(this.blockingNormal);
      if (intoWall < 0) velocity.addScaledVector(this.blockingNormal, -intoWall);
    }

    // 2. Soft penetration recovery check: push out if too close to a wall
    const checkY = start.y + 1.5;
    for (let a = 0; a < 8; a++) {
      const angle = a * (Math.PI / 4);
      const rayDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      this.pushRay.set(new THREE.Vector3(this.position.x, checkY, this.position.z), rayDir);
      this.pushRay.far = r;

      for (const wall of this.walls) {
        if (!wall.bounds.containsPoint(this.pushRay.ray.origin) && wall.bounds.distanceToPoint(this.pushRay.ray.origin) > r) continue;
        this.pushHits.length = 0;
        wall.mesh.raycast(this.pushRay, this.pushHits);
        if (this.pushHits.length > 0 && this.pushHits[0].distance < r) {
          const overlap = r - this.pushHits[0].distance;
          this.position.addScaledVector(rayDir, -overlap);
        }
      }
    }

    displacement.x = this.position.x - start.x;
    displacement.z = this.position.z - start.z;
  }

  dispose() {
    this.walls.length = 0;
    this.hits.length = 0;
    this.pushHits.length = 0;
    this.material.dispose();
  }
}
