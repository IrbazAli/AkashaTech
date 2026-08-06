// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

export default function OutsideScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadText, setLoadText] = useState("Loading Environment...");

  // Core references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Physics and controls
  const envRef = useRef<THREE.Group | null>(null);
  const spaceshipRef = useRef<THREE.Group | null>(null);
  const floorRaycaster = useRef(new THREE.Raycaster());
  const wallRaycaster = useRef(new THREE.Raycaster());
  const controlsRef = useRef<PointerLockControls | null>(null);
  const playerCollider = useRef(new Capsule(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.35));
  const playerVelocity = useRef(new THREE.Vector3());
  const playerDirection = useRef(new THREE.Vector3());
  const playerOnFloor = useRef(false);

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    container.addEventListener('click', () => {
      controls.lock();
    });

    const keyStates: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => { keyStates[e.code] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keyStates[e.code] = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Initial Load - load Environment
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    // Load Environment and Spaceship in parallel to save time
    const loadEnv = new Promise<THREE.Group>((resolve) => {
      loader.load('/models/outside-env-draco.glb', (gltf) => resolve(gltf.scene));
    });

    const loadSpaceship = new Promise<THREE.Group>((resolve) => {
      loader.load('/models/spaceship.glb', (gltf) => resolve(gltf.scene));
    });

    Promise.all([loadEnv, loadSpaceship]).then(([env, spaceship]) => {
      // 1. Add Environment
      scene.add(env);
      env.updateMatrixWorld(true);
      envRef.current = env;

      // 2. Raycast to find exact terrain height at X=0, Z=0
      const raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(0, 500, 0), new THREE.Vector3(0, -1, 0));
      const intersects = raycaster.intersectObject(env, true);
      let terrainY = 0;
      if (intersects.length > 0) {
        terrainY = intersects[0].point.y;
        console.log("Calculated Outside Terrain Height:", terrainY);
      } else {
        console.warn("Raycast missed terrain. Defaulting height to 0");
      }

      // 3. Position Spaceship Visual on the Terrain
      // Lowering it by 2.8 so the ramp bites into the ground perfectly
      spaceship.position.set(0, terrainY - 2.8, 0);
      scene.add(spaceship);

      // Save spaceship reference for raycasting collision detection
      spaceshipRef.current = spaceship;

      // 4. Spawn player slightly above the terrain
      playerCollider.current.start.set(0, terrainY + 2, 10);
      playerCollider.current.end.set(0, terrainY + 3, 10);

      setLoading(false);
    });

    // Animation Loop
    const clock = new THREE.Clock();
    const STEPS_PER_FRAME = 5;

    const playerCollisions = () => {
      // Raycast Collision for BOTH Environment and Spaceship
      if (envRef.current && spaceshipRef.current) {
        const collidableObjects = [envRef.current, spaceshipRef.current];

        // Floor Raycasting (Start higher up to detect ramps and stairs)
        floorRaycaster.current.set(
          new THREE.Vector3(playerCollider.current.start.x, playerCollider.current.start.y + 3.0, playerCollider.current.start.z),
          new THREE.Vector3(0, -1, 0)
        );
        const floorHits = floorRaycaster.current.intersectObjects(collidableObjects, true);
        const validFloorHit = floorHits.find(hit => {
          const name = hit.object.name.toLowerCase();
          // Ensure we are hitting a floor/upward-facing surface, not a ceiling
          const isFloor = hit.face ? hit.face.normal.y > 0.1 : true;
          return !name.includes('door') && !name.includes('gate') && !name.includes('glass') && isFloor;
        });

        playerOnFloor.current = false;
        // distance < 3.5 means the floor is between start.y + 3.0 and start.y - 0.5
        if (validFloorHit && validFloorHit.distance < 3.5) {
          playerOnFloor.current = true;
          const diff = validFloorHit.point.y - playerCollider.current.start.y;
          // Smoothly snap up ramps or down slopes
          if (diff > -0.5 && diff < 2.0) {
            playerCollider.current.translate(new THREE.Vector3(0, diff, 0));
            playerVelocity.current.y = Math.max(0, playerVelocity.current.y);
          }
        }

        // Wall Raycasting
        if (playerVelocity.current.x !== 0 || playerVelocity.current.z !== 0) {
          const moveDir = new THREE.Vector3(playerVelocity.current.x, 0, playerVelocity.current.z).normalize();
          // Check for walls at chest-height
          wallRaycaster.current.set(
            new THREE.Vector3(playerCollider.current.start.x, playerCollider.current.start.y + 2.0, playerCollider.current.start.z),
            moveDir
          );
          const wallHits = wallRaycaster.current.intersectObjects(collidableObjects, true);
          const validWallHit = wallHits.find(hit => {
            const name = hit.object.name.toLowerCase();
            return !name.includes('door') && !name.includes('gate') && !name.includes('glass');
          });

          if (validWallHit && validWallHit.distance < 1.0) {
            playerVelocity.current.x = 0;
            playerVelocity.current.z = 0;
            const pushBack = moveDir.clone().multiplyScalar(validWallHit.distance - 1.1);
            playerCollider.current.translate(pushBack);
          }
        }
      }
    };

    const updatePlayer = (deltaTime: number) => {
      let damping = Math.exp(-4 * deltaTime) - 1;
      if (!playerOnFloor.current) {
        playerVelocity.current.y -= 30 * deltaTime; // Gravity
        damping *= 0.1; // Small air resistance
      }
      playerVelocity.current.addScaledVector(playerVelocity.current, damping);

      const deltaPosition = playerVelocity.current.clone().multiplyScalar(deltaTime);
      playerCollider.current.translate(deltaPosition);

      playerCollisions();

      camera.position.copy(playerCollider.current.start);
      camera.position.y += 12; // Raise camera to a much higher standing eye level
    };

    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;

      if (controls.isLocked) {
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          const speedDelta = deltaTime * (playerOnFloor.current ? 80 : 20);
          const forward = getForwardVector();
          const side = getSideVector();

          if (keyStates['KeyW']) playerVelocity.current.addScaledVector(forward, speedDelta);
          if (keyStates['KeyS']) playerVelocity.current.addScaledVector(forward, -speedDelta);
          if (keyStates['KeyA']) playerVelocity.current.addScaledVector(side, -speedDelta);
          if (keyStates['KeyD']) playerVelocity.current.addScaledVector(side, speedDelta);

          if (playerOnFloor.current && keyStates['Space']) {
            playerVelocity.current.y = 15; // Jump force
          }

          updatePlayer(deltaTime);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      container.removeChild(renderer.domElement);
    };
  }, []);

  const getForwardVector = () => {
    if (!cameraRef.current) return new THREE.Vector3();
    const dir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    return dir;
  };
  const getSideVector = () => {
    if (!cameraRef.current) return new THREE.Vector3();
    const dir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    dir.cross(cameraRef.current.up);
    return dir;
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }} ref={containerRef}>
      {/* UI Overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.8)', padding: '20px', color: 'white', borderRadius: '10px' }}>
            <h2>{loadText}</h2>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px', color: 'white', borderRadius: '5px' }}>
          <strong>Octree Physics Controls</strong><br />
          Click anywhere to lock mouse<br />
          W A S D to walk, SPACE to jump<br />
          ESC to unlock
        </div>
      </div>
    </div>
  );
}
