// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
// @ts-ignore
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
// @ts-ignore
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
// @ts-ignore
import { Octree } from 'three/examples/jsm/math/Octree.js';
// @ts-ignore
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Lipsync } from 'wawa-lipsync';
import { DUMMY_PEOPLE } from '../data/dummyData';

// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useSession, signIn } from 'next-auth/react';

interface SpaceshipCache {
  gltf: any;
  worldOctree?: any; // Deprecated
  doorPosition: THREE.Vector3 | null;
  tubeCenter: THREE.Vector3 | null;
  tubeRadius: number;
  chamberDoorPositions: { pos: THREE.Vector3, floorY: number }[];
  assignments: Record<string, typeof DUMMY_PEOPLE[0]>;
  guideGltf?: any;
  guideAnimations?: any;
  pawGltf?: any;
  glassDoors?: any[];
}

declare global {
  interface Window {
    __SPACESHIP_CACHE__?: SpaceshipCache & {
      currentAudio?: HTMLAudioElement;
      lipsyncManager?: Lipsync;
      guideHeadMesh?: THREE.Mesh;
      guideTeethMesh?: THREE.Mesh;
      guideHeadBone?: THREE.Object3D;
      guideJawBone?: THREE.Object3D;
      guideLipBones?: THREE.Object3D[];
      guideActionMap?: Record<string, THREE.AnimationAction>;
      guideCurrentAction?: string;
    };
  }
}

interface ARSceneProps {
  onExit?: () => void;
}

export default function ARScene({ onExit }: ARSceneProps) {
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const occupiedMapRef = useRef<Record<string, typeof DUMMY_PEOPLE[0]>>({});

  // State for UI
  const [loading, setLoading] = useState(true);
  const [physicsLoading, setPhysicsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const selectedNicheRef = useRef<string | null>(null);
  useEffect(() => {
    selectedNicheRef.current = selectedNiche;
  }, [selectedNiche]);
  const [occupiedMap, setOccupiedMap] = useState<Record<string, typeof DUMMY_PEOPLE[0]>>({});

  // Nun Receptionist State
  const [showNunDialog, setShowNunDialog] = useState(false);
  const [searchPrompt, setSearchPrompt] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [guideMode, setGuideMode] = useState<'nun' | 'paw' | null>(null);
  const targetFloorYRef = useRef<number>(11.0); // 13.0 = Ground floor

  // Guide references
  const guideOriginalPosRef = useRef<THREE.Vector3 | null>(null);
  const guideOriginalRotRef = useRef<THREE.Quaternion | null>(null);
  const debugAnimRef = useRef<string | null>(null);

  const [nunTargetNiche, setNunTargetNiche] = useState<string | null>(null);
  const nunTargetNicheRef = useRef<string | null>(null);
  useEffect(() => {
    nunTargetNicheRef.current = nunTargetNiche;
  }, [nunTargetNiche]);

  const [pawTargetNiche, setPawTargetNiche] = useState<string | null>(null);
  const pawTargetNicheRef = useRef<string | null>(null);
  const pawGroupRef = useRef<THREE.Group | null>(null);
  const lastPawTargetRef = useRef<string | null>(null);
  useEffect(() => {
    pawTargetNicheRef.current = pawTargetNiche;
  }, [pawTargetNiche]);
  const hasGreetedRef = useRef(false);

  const playAudioWithLipSync = (url: string): HTMLAudioElement => {
    // Stop any currently playing audio
    if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.currentAudio) {
      const oldAudio = window.__SPACESHIP_CACHE__.currentAudio;
      if (!oldAudio.paused) {
        try { oldAudio.pause(); } catch (e) { }
      }
    }

    const audio = new Audio(url);

    if (window.__SPACESHIP_CACHE__) {
      window.__SPACESHIP_CACHE__.currentAudio = audio;

      // Setup Wawa-Lipsync if not exists
      if (!window.__SPACESHIP_CACHE__.lipsyncManager) {
        window.__SPACESHIP_CACHE__.lipsyncManager = new Lipsync();
      }

      const lipsyncManager = window.__SPACESHIP_CACHE__.lipsyncManager;
      lipsyncManager.connectAudio(audio);

      // Ensure AudioContext is resumed (browsers suspend it if not created during user gesture)
      const ac = (lipsyncManager as any).audioContext;
      if (ac && ac.state === 'suspended') {
        ac.resume();
      }
    }

    audio.play().catch(e => {
      if (e.name !== 'AbortError') {
        console.warn("Error playing audio:", e);
      }
    });

    return audio;
  };

  const handleNunOptionClick = (optionIndex: number) => {
    setShowNunDialog(false);
    if (optionIndex === 0) {
      window.location.href = '/private-room';
    } else if (optionIndex === 1) {
      setGuideMode('paw');
      setSearchPrompt(true);
    } else if (optionIndex === 2) {
      setGuideMode('nun');
      setSearchPrompt(true);
    } else {
      playAudioWithLipSync(`/audio/response_${optionIndex}.mp3`);
    }
  };

  const handleSearchSubmit = () => {
    setSearchPrompt(false);

    // Find matching person
    let foundMeshName = null;
    for (const [meshName, person] of Object.entries(occupiedMap)) {
      if (person.name.toLowerCase() === searchQuery.toLowerCase()) {
        foundMeshName = meshName;
        break;
      }
    }

    if (!foundMeshName) {
      playAudioWithLipSync('/audio/no_niche_found.mp3');
    } else {
      if (guideMode === 'paw') {
        setPawTargetNiche(foundMeshName);
      } else {
        setNunTargetNiche(foundMeshName);
      }
    }
  };

  // iFly Tube State
  const [inTube, setInTube] = useState(false);
  const inTubeRef = useRef(false);

  // Dynamic Tube Dimensions
  const tubeCenterRef = useRef<THREE.Vector3 | null>(null);
  const tubeRadiusRef = useRef<number>(3.5);

  // Helper to sync ref and state
  const updateInTube = (val: boolean) => {
    if (inTubeRef.current !== val) {
      inTubeRef.current = val;
      setInTube(val);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    const clock = new THREE.Clock();

    // 1. SETUP SCENE
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508); // Dark atmospheric background
    // Fog disabled so the outside environment is fully visible
    // scene.fog = new THREE.FogExp2(0x050508, 0.015);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Spawn player inside the spaceship
    camera.position.set(120.0, 50.0, 40.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio for high FPS
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    // Ensure proper color space for glTF textures to try and fix white trees
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    const vrButton = VRButton.createButton(renderer);
    vrButton.style.bottom = '20px';
    vrButton.style.zIndex = '100';
    document.body.appendChild(vrButton);

    // 2. LIGHTING (Matched with OutsideScene)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Optimized Point Lighting for upper floors (4 lights per floor for ultra-smooth 60+ FPS)
    for (let z = -45; z <= 45; z += 30) {
      // First Floor (Y ~ 21.5) - Bright play area natural light
      const f1Light = new THREE.PointLight(0xffffff, 2.0, 30);
      f1Light.position.set(0, 21.48, z);
      scene.add(f1Light);

      // Second Floor (Y ~ 31.0) - Neon Theater Vibe
      const color = (Math.abs(z) % 60 === 0) ? 0x9900ff : 0xff6600;
      const f2Light = new THREE.PointLight(color, 2.5, 35);
      f2Light.position.set(0, 30.94, z);
      scene.add(f2Light);
    }

    // 2.5 ENVIRONMENT MAP (For reflections)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // 3. PHYSICS ENGINE (Octree & Capsule)
    const playerCollider = new Capsule(
      new THREE.Vector3(camera.position.x, camera.position.y - 4, camera.position.z),
      new THREE.Vector3(camera.position.x, camera.position.y - 1.5, camera.position.z),
      0.15
    );
    const playerVelocity = new THREE.Vector3();
    let currentCameraHeight = 12.0;
    const playerDirection = new THREE.Vector3();

    const guideCollider = new Capsule(
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(0, 1.5, 0),
      0.25
    );

    let worldOctree = new Octree();

    const floorRaycaster = new THREE.Raycaster();
    const wallRaycaster = new THREE.Raycaster();
    const controls = new PointerLockControls(camera, renderer.domElement);

    const blockClick = (e: MouseEvent) => {
      if (!controls.isLocked) {
        controls.lock();
      }
    };
    renderer.domElement.addEventListener('click', blockClick);

    // Keyboard Movement State
    const moveState = { forward: false, backward: false, left: false, right: false };
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // 4. LOAD ASSETS
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    let spaceshipGroup: THREE.Group | null = null;
    let spaceshipMixer: THREE.AnimationMixer | null = null;
    let mainDoorActions: { action: THREE.AnimationAction, isOpen: boolean }[] = [];
    let chamberDoorActions: { action: THREE.AnimationAction, isOpen: boolean, floorY: number }[] = [];
    let chamberDoorPositions: { pos: THREE.Vector3, floorY: number }[] = [];
    let glassDoors: { mesh: THREE.Mesh, side: 'left' | 'right', floorY: number, initialZ: number, isOpen: boolean }[] = [];
    let doorPosition: THREE.Vector3 | null = null;

    let envGroup: THREE.Group | null = null;
    let terrainY = 0;
    loader.load('/models/outside-env-draco.glb', (gltf) => {
      envGroup = gltf.scene;
      
      // Fix tree leaves (alpha map issues)
      envGroup.traverse((child: any) => {
        if (child.isMesh && child.material) {
          // If the material has a texture map, it's likely a leaf or decal that needs alpha cutout
          if (child.material.map) {
            child.material.transparent = false; // False is better for trees to avoid z-fighting
            child.material.alphaTest = 0.5; // Cut out the white/transparent background
            child.material.side = THREE.DoubleSide; // Render both sides of the leaf
            
            // Reset color to pure white so the texture colors show naturally
            if (child.material.color) {
               child.material.color.setHex(0xffffff);
            }
            
            child.material.needsUpdate = true;
          }
        }
      });

      envGroup.position.set(54.62, 0, 0); 
      scene.add(envGroup);
      envGroup.updateMatrixWorld(true);

      const raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(54.62, 500, 0), new THREE.Vector3(0, -1, 0));
      const intersects = raycaster.intersectObject(envGroup, true);
      
      if (intersects.length > 0) {
        terrainY = intersects[0].point.y;
      }
      // Instead of shifting the spaceship up/down (which breaks hardcoded interior coords like Y=11.0),
      // we shift the terrain to perfectly meet the spaceship at Y=0!
      // We need the terrain to be at Y=2.8 relative to the spaceship.
      envGroup.position.set(54.62, 2.8 - terrainY, 0);
      envGroup.updateMatrixWorld(true);
      
      if (spaceshipGroup) {
        spaceshipGroup.position.set(54.62, 0, 0); // Keep spaceship rigidly at original Y=0
        spaceshipGroup.updateMatrixWorld(true);
      }
      
      
      
      // Safely calculate terrain height exactly where we spawn!
      const spawnRaycaster = new THREE.Raycaster();
      spawnRaycaster.set(new THREE.Vector3(120.0, 500.0, 40.0), new THREE.Vector3(0, -1, 0));
      const spawnHits = spawnRaycaster.intersectObject(envGroup, true);
      let spawnY = 0;
      if (spawnHits.length > 0) {
        spawnY = spawnHits[0].point.y;
        console.log('[SPAWN DEBUG] Terrain hit at X: 120, Z: 40! Height is: ', spawnY);
      } else {
        console.error('[SPAWN DEBUG] NO TERRAIN FOUND at X: 120, Z: 40! Falling into the abyss!');
      }
      
      playerCollider.start.set(120.0, spawnY + 2.0, 40.0);

      playerCollider.end.set(120.0, spawnY + 3.0, 40.0);
      playerVelocity.set(0, 0, 0);
      camera.position.copy(playerCollider.start);
      camera.position.y += 12.0;

    });


    const applySpaceshipGltf = (gltf: any) => {
      spaceshipGroup = gltf.scene;
      spaceshipGroup.position.set(54.62, 0, 0);
      scene.add(spaceshipGroup!);

      if (gltf.animations && gltf.animations.length > 0) {
        // Strip out any baked jaw animations so Wawa-Lipsync has full control
        gltf.animations.forEach((clip: THREE.AnimationClip) => {
          console.log(clip.name, clip.tracks.map(t => t.name)); clip.tracks = clip.tracks.filter(track => !track.name.toLowerCase().includes('jaw'));
        });

        spaceshipMixer = new THREE.AnimationMixer(spaceshipGroup!);

        gltf.animations.forEach((clip: THREE.AnimationClip) => {
          const action = spaceshipMixer!.clipAction(clip);
          action.loop = THREE.LoopOnce;
          action.clampWhenFinished = true;

          const name = clip.name.toLowerCase();
          if (name.includes('gate') || name.includes('door')) {
            if (name.includes('f1_')) {
              chamberDoorActions.push({ action, isOpen: false, floorY: 13.0 });
            } else if (name.includes('f2_')) {
              chamberDoorActions.push({ action, isOpen: false, floorY: 21.48 });
            } else if (name.includes('f3_')) {
              chamberDoorActions.push({ action, isOpen: false, floorY: 30.94 });
            } else {
              mainDoorActions.push({ action, isOpen: false });
            }
          }
        });
      }
    };

    if (window.__SPACESHIP_CACHE__) {
      const cache = window.__SPACESHIP_CACHE__;
      applySpaceshipGltf(cache.gltf);
      tubeRadiusRef.current = cache.tubeRadius;
      doorPosition = cache.doorPosition;
      tubeCenterRef.current = cache.tubeCenter;
      tubeRadiusRef.current = cache.tubeRadius;
      chamberDoorPositions = cache.chamberDoorPositions || [];
      glassDoors = cache.glassDoors || [];
      occupiedMapRef.current = cache.assignments;
      setOccupiedMap(cache.assignments);
      setPhysicsLoading(false);
      setLoading(false);
    } else {
      loader.load(
        '/models/spaceship.glb',
        async (gltf) => {
          if (!isMounted) return;
          gltf.scene.name = 'spaceship_visual';
          applySpaceshipGltf(gltf);

          const sharedSpaceshipMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
          sharedSpaceshipMaterial.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
              '#include <common>',
              `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n`
            ).replace(
              '#include <worldpos_vertex>',
              `#include <worldpos_vertex>\n
               vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n
               vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);\n`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>',
              `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n`
            ).replace(
              '#include <roughnessmap_fragment>',
              `
              float roughnessFactor = roughness;
              float metalnessFactor = metalness;
              vec3 customColor = diffuseColor.rgb;
              
              // If normal points mostly up/down, it's a floor or ceiling
              bool isFloor = abs(vWorldNormal.y) > 0.8;
              
              if (isFloor || vWorldPos.y < 5.0) {
                  roughnessFactor = 0.1;
                  metalnessFactor = 0.9;
                  customColor = vec3(0.2, 0.2, 0.2);
              } else {
                  // It's a wall
                  if (vWorldPos.y > 17.0 && vWorldPos.y < 26.0) {
                      // First Floor Play Area (Matte Rainbow)
                      roughnessFactor = 0.9;
                      metalnessFactor = 0.0;
                      float angle = atan(vWorldPos.x, vWorldPos.z);
                      customColor = vec3(0.5 + 0.5 * sin(angle * 10.0), 0.5 + 0.5 * sin(angle * 10.0 + 2.094), 0.5 + 0.5 * sin(angle * 10.0 + 4.188));
                  } else if (vWorldPos.y >= 26.0) {
                      // Second Floor Theater (Matte Dark Purple)
                      roughnessFactor = 0.9;
                      metalnessFactor = 0.0;
                      customColor = vec3(0.16, 0.15, 0.20);
                  } else {
                      // Ground Floor (Metallic Dark)
                      roughnessFactor = 0.3;
                      metalnessFactor = 0.8;
                      customColor = vec3(0.2, 0.2, 0.2);
                  }
              }
              diffuseColor = vec4(customColor, opacity);
              `
            ).replace(
              '#include <metalnessmap_fragment>',
              `// metalnessFactor already defined`
            );
          };

          // Update world matrices so bounding boxes correctly account for the X=54.62 shift
          spaceshipGroup!.updateMatrixWorld(true);

          const allNiches: THREE.Mesh[] = [];
          spaceshipGroup!.traverse((child) => {
            const nodeName = child.name.toLowerCase();
            if (nodeName === 'glass') {
              const box = new THREE.Box3().setFromObject(child);
              const center = new THREE.Vector3();
              box.getCenter(center);
              tubeCenterRef.current = center;
              tubeRadiusRef.current = (box.max.x - box.min.x) / 2;
            }
            if (nodeName.includes('room') && !nodeName.includes('main')) {
              allNiches.push(child as THREE.Mesh);
            } else if ((child as THREE.Mesh).isMesh && !nodeName.includes('door') && !nodeName.includes('gate') && !nodeName.includes('glass')) {
              const mesh = child as THREE.Mesh;
              if (mesh.material) {
                mesh.material = sharedSpaceshipMaterial;
              }
            }
            if (nodeName.includes('door_f')) {
              let floorY = 13.0;
              if (nodeName.includes('f1_')) {
                floorY = 21.48;
              } else if (nodeName.includes('f2_')) {
                floorY = 30.94;
                child.position.y -= 0.3; // Adjust floating door down
              } else {
                // f0
                child.position.y -= 1.5; // Lower ground floor glass door so it touches the floor
              }
              child.scale.y *= 1.6; // Multiplicatively scale the visual glass doors up so they don't shrink if their default scale was > 1.25
              child.scale.y *= 1.9; // Scale the visual glass doors up significantly so they are taller!
              const side = nodeName.includes('left') ? 'left' : 'right';
              glassDoors.push({ mesh: child as THREE.Mesh, side, floorY, initialZ: child.position.z, isOpen: false });
            } else if ((nodeName.includes('door') || nodeName.includes('gate')) && !nodeName.includes('main')) {
              const pos = new THREE.Vector3();
              child.getWorldPosition(pos);
              let floorY = 13.0;
              if (nodeName.includes('f2_')) floorY = 21.48;
              if (nodeName.includes('f3_')) floorY = 30.94;
              chamberDoorPositions.push({ pos, floorY });
            }
          });

          const spaceshipBox = new THREE.Box3().setFromObject(spaceshipGroup!);
          doorPosition = new THREE.Vector3(spaceshipBox.max.x, 0, 0);

          const assignments: Record<string, typeof DUMMY_PEOPLE[0]> = {};

          let dbNiches: Record<string, any> = {};
          try {
            const res = await fetch("/api/niches");
            dbNiches = await res.json();
          } catch (e) {
            console.error("Failed to load niches from DB:", e);
          }

          if (allNiches.length > 0) {
            allNiches.sort((a, b) => a.name.localeCompare(b.name));
            let baseMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
            const occupiedMat = baseMat.clone();
            occupiedMat.emissive = new THREE.Color(0xff3333); // Deep red
            occupiedMat.emissiveIntensity = 1.0;
            const reservedMat = baseMat.clone();
            reservedMat.emissive = new THREE.Color(0xffaa00); // Amber
            reservedMat.emissiveIntensity = 1.0;
            const availableGlowingMat = baseMat.clone();
            availableGlowingMat.emissive = new THREE.Color(0x33ff55); // Green
            availableGlowingMat.emissiveIntensity = 1.0;

            let dummyIndex = 0;
            for (let i = 0; i < allNiches.length; i++) {
              const nicheMesh = allNiches[i];
              const nodeName = nicheMesh.name.toLowerCase();

              if (nodeName.includes('room') && !nodeName.includes('main')) {
                // Ensure frustum culling is disabled for niches
                nicheMesh.frustumCulled = false;

                let status = 'available';
                let data: any = { nicheNum: nicheMesh.name, status: 'available', name: "Available", dob: "", dod: "", message: "This niche is available for purchase." };

                if (dbNiches[nicheMesh.name]) {
                  data = dbNiches[nicheMesh.name];
                  status = data.status;
                } else if (dummyIndex < DUMMY_PEOPLE.length) {
                  // Fallback to dummy data for visually interesting presentation if not in DB
                  data = DUMMY_PEOPLE[dummyIndex];
                  status = data.status;
                  dummyIndex++;
                }

                assignments[nicheMesh.name] = data;

                if (status === 'occupied' || status === 'SOLD' || status === 'sold') {
                  nicheMesh.material = occupiedMat;
                } else if (status === 'reserved') {
                  nicheMesh.material = reservedMat;
                } else {
                  if (Math.random() < 0.1) {
                    nicheMesh.material = availableGlowingMat;
                  } else {
                    nicheMesh.material = baseMat;
                  }
                }
              }
            }
          }
          occupiedMapRef.current = assignments;
          setOccupiedMap(assignments);

          window.__SPACESHIP_CACHE__ = {
            ...(window.__SPACESHIP_CACHE__ || {}),
            gltf,
            doorPosition,
            tubeCenter: tubeCenterRef.current,
            tubeRadius: tubeRadiusRef.current,
            chamberDoorPositions,
            glassDoors,
            assignments: occupiedMapRef.current,
          };

          setPhysicsLoading(false);
          setLoading(false);
        },
        (xhr) => {
          if (!isMounted) return;
          setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
        },
        (err) => console.error("Error loading spaceship:", err)
      );

      // Load the Screen Wall
      loader.load('/models/wall.glb', (wallGltf) => {
        if (!isMounted) return;

        const wallScene = wallGltf.scene;
        wallScene.position.set(-91, 30.94, 1.6);
        wallScene.scale.set(1.0, 0.40, 0.40);
        wallScene.rotation.y = Math.PI;
        scene.add(wallScene);
      });

    }

    let mixer: THREE.AnimationMixer | null = null;
    let guideAnimationsData: any = null;
    let guideActionMap: Record<string, THREE.AnimationAction> = {};

    const applyGuideGltf = (gltf: any) => {
      const avatar = gltf.scene;

      if (!(window as any).DEBUG_BONE_LOGGED) {
        (window as any).DEBUG_BONE_LOGGED = true;
        const bones: string[] = [];
        avatar.traverse(c => { if ((c as any).isBone) bones.push(c.name); });
        
      }
      const avatarGroup = new THREE.Group();
      avatarGroup.add(avatar);
      avatarGroup.position.set(50.0, 10.0, -2.0); // Static height
      avatarGroup.scale.set(2, 2, 2);
      if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideOuterGroup = avatarGroup;

      avatarGroup.rotation.y = 0;

      avatar.traverse((child: THREE.Object3D) => {
        const rawName = child.name;
        child.name = child.name.replace(/mixamorig:?/g, '');
        child.name = child.name.replace(/Armature\|/g, '');

        const nameLower = child.name.toLowerCase();
        const rawLower = rawName.toLowerCase();

        if (nameLower.includes('jaw') || rawLower.includes('jaw')) {
          if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideJawBone = child;
        }
        if (nameLower.includes('lip') || rawLower.includes('lip') || nameLower.includes('mouth') || rawLower.includes('mouth')) {
          if (window.__SPACESHIP_CACHE__) {
            if (!window.__SPACESHIP_CACHE__.guideLipBones) window.__SPACESHIP_CACHE__.guideLipBones = [];
            window.__SPACESHIP_CACHE__.guideLipBones.push(child);
          }
        }
        if ((child as any).isBone && (child.name === 'Head' || nameLower.includes('head') || rawName.toLowerCase().includes('head'))) {
          if (!window.__SPACESHIP_CACHE__?.guideHeadBone) {
            if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideHeadBone = child;
          }
        }

        if ((child as THREE.Mesh).isMesh) {
          child.frustumCulled = false;
          const mesh = child as THREE.Mesh;

          if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 0) {
            if (nameLower.includes('teeth')) {
              if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideTeethMesh = mesh;
            } else {
              if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideHeadMesh = mesh;
            }
          }
        }
      });
      scene.add(avatarGroup);

      // FIX: Check guideAnimationsData instead of gltf.animations, because the user's new model has no built-in animations!
      if (guideAnimationsData && guideAnimationsData.length > 0) {
        mixer = new THREE.AnimationMixer(avatar);
        guideAnimationsData.forEach((clip: THREE.AnimationClip) => {
          const action = mixer!.clipAction(clip);
          if (clip.name === 'Talking_0') {
            action.timeScale = 1.3;
          }
          guideActionMap[clip.name] = action;
        });
        
        if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideActionMap = guideActionMap;

        const idleAnim = guideActionMap['Idle'] || guideActionMap[Object.keys(guideActionMap)[0]];
        if (idleAnim) {
          idleAnim.play();
          if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideCurrentAction = idleAnim.getClip().name;
        }
      }
    };

    // --- ADD TV AND WALL ON 2ND FLOOR ---
    const createTVAndWall = () => {
      // 1. Create TV (Video Screen)
      const video = document.createElement('video');
      video.src = '/video/034852EC-7326-4E59-8679-40F91ACEE98B.mov';
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true; // muted by default for auto-play
      video.play().catch(e => console.warn("TV autoplay prevented:", e));

      const videoTexture = new THREE.VideoTexture(video);
      const tvGeometry = new THREE.PlaneGeometry(16, 9); // 16:9 aspect ratio
      const tvMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
      const tvMesh = new THREE.Mesh(tvGeometry, tvMaterial);

      // Position TV on the outer wall (approx X = -43)
      tvMesh.position.set(-18.0, 33.0, 0);
      tvMesh.lookAt(0, 36.0, 0); // Face towards the center of the spaceship
      tvMesh.scale.set(0.3, 0.3, 0.3);
      scene.add(tvMesh);

      // Add a click listener to toggle mute (we'll implement this via raycaster if needed)
      tvMesh.name = 'memorial_tv';

      // 2. Create Wall on the opposite side of the spaceship (X = 43)
      const wallGeometry = new THREE.BoxGeometry(20, 15, 1);
      const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

      // Position Wall opposite to TV (Flip the X axis)
      wallMesh.position.set(-36.0, 33.0, 0);
      wallMesh.lookAt(0, 36.0, 0); // Face towards the center
      wallMesh.scale.set(0.3, 0.3, 0.3);
      scene.add(wallMesh);

      // Load NFT 3D Models on the Opposite Wall (X = +36.0)
      const oppositeX = 36.0;
      const floorY = 30.94; // 2nd Floor Y

      // 1. Load Images (Tree, Stepping Stones, Statue) onto the Board (X = -36.0)
      const textureLoader = new THREE.TextureLoader();
      
      const loadBoardImage = (url: string, yOffset: number, zOffset: number) => {
        textureLoader.load(url, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          
          // Make images smaller to fit perfectly in a 2x2 grid (board is 4.5m tall and 6.0m wide)
          const aspect = texture.image.width / texture.image.height;
          const height = 1.5; // Scaled down to 1.5m tall
          const width = height * aspect; 
          
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: true,
            side: THREE.DoubleSide
          });
          
          const mesh = new THREE.Mesh(geometry, material);
          // Base Y is 33.0 (center of board)
          mesh.position.set(-35.8, 33.0 + yOffset, zOffset);
          mesh.lookAt(0, 33.0 + yOffset, zOffset);
          scene.add(mesh);
        });
      };

      // 2x2 Grid Layout
      // Top Left
      loadBoardImage('/imgs/tree.PNG', 1.0, -1.5);
      // Top Right
      loadBoardImage('/imgs/stepping stones.PNG', 1.0, 1.5);
      // Bottom Center (Or Bottom Left)
      loadBoardImage('/imgs/statue.PNG', -1.0, 0.0);
    };

    createTVAndWall();

    if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.guideGltf && window.__SPACESHIP_CACHE__.guideAnimations) {
      guideAnimationsData = window.__SPACESHIP_CACHE__.guideAnimations;
      applyGuideGltf(window.__SPACESHIP_CACHE__.guideGltf);
    } else {
      loader.load('/models/animations.glb', (animGltf) => {
        if (!isMounted) return;
        const baseAnims = [...animGltf.animations];

        loader.load('/models/walking.glb', (walkGltf) => {
          if (!isMounted) return;
          walkGltf.animations.forEach(clip => {
            clip.tracks.forEach(track => {
              track.name = track.name.replace(/mixamorig:?/g, '');
              track.name = track.name.replace(/Armature\|/g, '');
            });

            // Strip ALL scale tracks, and ALL position tracks except Hips.
            // MUST strip Hips.quaternion because Mixamo adds 90 degree horizontal rotations!
            clip.tracks = clip.tracks.filter(track => !track.name.endsWith('.scale') && (!track.name.endsWith('.position') || track.name === 'Hips.position') && !track.name.includes('Hips.quaternion'));

            clip.name = 'Walking';
            if (!(window as any).DEBUG_ANIM_LOGGED) {
              (window as any).DEBUG_ANIM_LOGGED = true;
              
            }
            baseAnims.push(clip);
          });

          loader.load('/models/guide_new.glb', async (gltf) => {
            if (!isMounted) return;

            const wifeAnims = gltf.animations;
            const talkingAnim = wifeAnims.length > 0 ? wifeAnims[0] : null;
            if (talkingAnim) {
              const talkingClone = talkingAnim.clone();
              talkingClone.name = 'Talking_0';

              const existingTalkIdx = baseAnims.findIndex(a => a.name === 'Talking_0');
              if (existingTalkIdx !== -1) {
                baseAnims.splice(existingTalkIdx, 1);
              }
              baseAnims.push(talkingClone);
            }

            baseAnims.forEach(anim => {
              anim.tracks.forEach(track => {
                track.name = track.name.replace(/mixamorig:?/g, '');
                track.name = track.name.replace(/Armature\|/g, '');
              });
              anim.tracks = anim.tracks.filter(track => track.name !== 'Hips.position' && !track.name.endsWith('.scale'));
            });

            guideAnimationsData = baseAnims;
            if (window.__SPACESHIP_CACHE__) window.__SPACESHIP_CACHE__.guideAnimations = baseAnims;

            if (!window.__SPACESHIP_CACHE__) {
              window.__SPACESHIP_CACHE__ = {
                gltf: null,
                tubeCenter: null,
                tubeRadius: 3.5,
                chamberDoorPositions: [],
                assignments: {},
                guideGltf: gltf,
                guideAnimations: baseAnims,
                pawGltf: null
              };
            } else {
              window.__SPACESHIP_CACHE__.guideGltf = gltf;
            }

            applyGuideGltf(gltf);
          }, undefined, (error) => {
            console.error("FAILED TO LOAD GUIDE:", error);
          });
        });
      });
    }

    if (!window.__SPACESHIP_CACHE__?.pawGltf) {
      loader.load('/models/paw-draco.glb', (gltf) => {
        if (!isMounted) return;
        if (window.__SPACESHIP_CACHE__) {
          window.__SPACESHIP_CACHE__.pawGltf = gltf;
        } else {
          window.__SPACESHIP_CACHE__ = {
            gltf: null,
            tubeCenter: null,
            tubeRadius: 3.5,
            chamberDoorPositions: [],
            assignments: {},
            guideGltf: null,
            guideAnimations: null,
            pawGltf: gltf
          };
        }
      }, undefined, (err) => {
        loader.load('/models/paw.glb', (fallback) => {
          if (!isMounted) return;
          if (window.__SPACESHIP_CACHE__) {
            window.__SPACESHIP_CACHE__.pawGltf = fallback;
          } else {
            window.__SPACESHIP_CACHE__ = {
              gltf: null,
              tubeCenter: null,
              tubeRadius: 3.5,
              chamberDoorPositions: [],
              assignments: {},
              guideGltf: null,
              guideAnimations: null,
              pawGltf: fallback
            };
          }
        });
      });
    }

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);

    const onMouseClick = (event: MouseEvent) => {
      if (!controls.isLocked) return;

      raycaster.setFromCamera(center, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Filter out ceiling/environment if raycasting hits non-interactable meshes
      const interactiveIntersects = intersects.filter(i => {
        const name = i.object.name.toLowerCase();
        if (name.includes('room') || name.includes('gate') || name.includes('niche')) return true;

        let isGuide = false;
        i.object.traverseAncestors((ancestor) => {
          if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.guideGltf && ancestor === window.__SPACESHIP_CACHE__.guideGltf.scene) {
            isGuide = true;
          }
        });
        if (window.__SPACESHIP_CACHE__ && i.object === window.__SPACESHIP_CACHE__.guideGltf?.scene) isGuide = true;

        return isGuide;
      });

      if (interactiveIntersects.length > 0) {
        const object = interactiveIntersects[0].object as THREE.Mesh;
        const nodeName = object.name.toLowerCase();

        // Check if Guide was clicked
        let isGuide = false;
        object.traverseAncestors((ancestor) => {
          if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.guideGltf && ancestor === window.__SPACESHIP_CACHE__.guideGltf.scene) {
            isGuide = true;
          }
        });
        if (object === window.__SPACESHIP_CACHE__?.guideGltf?.scene) isGuide = true;

        if (isGuide) {
          controls.unlock();
          setShowNunDialog(true);
          setSearchPrompt(false);
        } else if (nodeName.includes('room') && !nodeName.includes('main')) {
          // Remove the strict distance check, as the niche's origin might be far away from its actual visual mesh
          setSelectedNiche(object.name);

          // Change color to cyan (selected) only if it is AVAILABLE (not occupied/reserved)
          const nicheData = occupiedMapRef.current[object.name];
          if (nicheData && nicheData.status === 'available' && object.material) {
            const mat = object.material as THREE.MeshStandardMaterial;
            const newMat = mat.clone();
            newMat.emissive = new THREE.Color(0x00ffff); // Cyan to indicate selection
            newMat.emissiveIntensity = 3.0;
            object.material = newMat;
          }
        }
      }
    };
    document.addEventListener('click', onMouseClick);

    // 6. RENDER LOOP
    const speed = 350.0;
    const gravity = 60.0;

    let playerOnFloor = false;

    function playerCollisions() {
      if (!spaceshipGroup && !envGroup) return false;
      let collisionOccurred = false;
      playerOnFloor = false;

      // 1. Floor Raycasting (Handles Gravity & Outside Terrain)
      floorRaycaster.set(
        new THREE.Vector3(playerCollider.start.x, playerCollider.start.y + 3.0, playerCollider.start.z),
        new THREE.Vector3(0, -1, 0)
      );

      const collidableObjects = [spaceshipGroup, envGroup].filter(Boolean);
      const floorHits = floorRaycaster.intersectObjects(collidableObjects, true);
      const validFloorHit = floorHits.find(hit => !hit.object.name.toLowerCase().includes('glass'));

      if (validFloorHit && validFloorHit.distance < 3.5) {
        playerOnFloor = true;
        
        let isOnSpaceship = false;
        if (spaceshipGroup) {
          let parent = validFloorHit.object;
          while (parent) {
            if (parent === spaceshipGroup) {
              isOnSpaceship = true;
              break;
            }
            parent = parent.parent;
          }
        }
        (window as any).__PLAYER_ON_SPACESHIP__ = isOnSpaceship;

        const diff = validFloorHit.point.y - playerCollider.start.y;
        playerCollider.translate(new THREE.Vector3(0, diff, 0));
        playerVelocity.y = Math.max(0, playerVelocity.y);
      }

      // 2. Spaceship Wall Collisions (Using robust Octree)
      const result = worldOctree.capsuleIntersect(playerCollider);
      if (result) {
        collisionOccurred = true;
        // If the normal is horizontal (wall) or ceiling, or if we weren't on the floor
        if (result.normal.y <= 0.1 || !playerOnFloor) {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
        // If we hit a wall, stop velocity
        if (Math.abs(result.normal.y) <= 0.1) {
            playerVelocity.x = 0;
            playerVelocity.z = 0;
        }
      }

      return collisionOccurred;
    }

    let lastTime = performance.now();

    // Track sliding animations for niches
    const animatedNiches: {
      [name: string]: {
        mesh: THREE.Mesh,
        originalPos: THREE.Vector3,
        slideDir: THREE.Vector3
      }
    } = {};

    renderer.setAnimationLoop(() => {
      if (!isMounted) return;
      const time = performance.now();
      // Cap delta time to prevent massive jumps when switching tabs
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      // Niche Sliding Logic
      const activeNicheName = selectedNicheRef.current;

      // If a new niche is selected and not in animatedNiches, add it
      if (activeNicheName && !animatedNiches[activeNicheName]) {
        const mesh = scene.getObjectByName(activeNicheName) as THREE.Mesh;
        if (mesh) {
          const originalPos = mesh.position.clone();

          // Calculate the true center of the mesh geometry since mesh.position might be (0,0,0)
          mesh.geometry.computeBoundingBox();
          const centerOfMesh = new THREE.Vector3();
          if (mesh.geometry.boundingBox) {
            mesh.geometry.boundingBox.getCenter(centerOfMesh);
          }

          // The user explicitly requested to only change the Y axis (sliding straight up)
          const slideDir = new THREE.Vector3(0, 0, 1);

          animatedNiches[activeNicheName] = { mesh, originalPos, slideDir };
        }
      }

      // Process all known animated niches
      for (const name in animatedNiches) {
        const anim = animatedNiches[name];
        const isActive = (name === activeNicheName);

        // Slide out 1 inch (0.0254 meters) towards the center of the room
        const targetPos = isActive
          ? anim.originalPos.clone().add(anim.slideDir.clone().multiplyScalar(0.0254))
          : anim.originalPos;

        // Lerp position smoothly
        anim.mesh.position.lerp(targetPos, 5 * delta);
      }

      // Paw Path Logic
      const currentPawTarget = pawTargetNicheRef.current;
      const pawGltf = window.__SPACESHIP_CACHE__?.pawGltf;
      if (currentPawTarget && currentPawTarget !== lastPawTargetRef.current && pawGltf) {
        const targetMesh = scene.getObjectByName(currentPawTarget) as THREE.Mesh;
        if (targetMesh) {
          // Clear old paws
          if (pawGroupRef.current) {
            scene.remove(pawGroupRef.current);
          }
          pawGroupRef.current = new THREE.Group();
          scene.add(pawGroupRef.current);

          const startPos = new THREE.Vector3(50.0, targetFloorYRef.current + 0.1, -2.0); // Start from Nun's Idle Position!

          const nichePos = new THREE.Vector3();
          const box = new THREE.Box3().setFromObject(targetMesh);
          box.getCenter(nichePos); const size = new THREE.Vector3(); box.getSize(size); console.log(`[NICHE DEBUG] Niche-name: ${targetMesh.name}, Center: ${nichePos.x}, ${nichePos.y}, ${nichePos.z} | Size: ${size.x}, ${size.y}, ${size.z}`);

                    // Draw an L-shaped path! First straight down the hallway, then turn to the wall.
          const cornerPos = new THREE.Vector3(nichePos.x, startPos.y, startPos.z);
          const targetPos = new THREE.Vector3(nichePos.x, startPos.y, nichePos.z);
          console.log(`[PAW DEBUG - ${Date.now()}] Target Niche Position (Center): X=${nichePos.x.toFixed(3)}, Y=${nichePos.y.toFixed(3)}, Z=${nichePos.z.toFixed(3)}`);

          const dist1 = startPos.distanceTo(cornerPos);
          const dist2 = cornerPos.distanceTo(targetPos);
          const totalDist = dist1 + dist2;
          
          const numPaws = Math.max(2, Math.floor(totalDist / 1.5)); // 1 paw every 1.5 meters

          // Create a raycaster to perfectly hug the floor height!
          const pawRaycaster = new THREE.Raycaster();
          const downVector = new THREE.Vector3(0, -1, 0);

          for (let i = 0; i <= numPaws; i++) {
            const pawClone = pawGltf.scene.clone();

            // Make the paw glow purple
            pawClone.traverse((child) => {
              if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xa020f0,
                  emissive: 0xa020f0,
                  emissiveIntensity: 2.0
                });
              }
            });

            const currentDist = (i / numPaws) * totalDist;
            let currentTarget;
            
            if (currentDist <= dist1) {
              // On the first segment (hallway)
              const alpha = dist1 === 0 ? 0 : currentDist / dist1;
              pawClone.position.lerpVectors(startPos, cornerPos, alpha);
              currentTarget = cornerPos;
            } else {
              // On the second segment (turning to the wall)
              const alpha = dist2 === 0 ? 0 : (currentDist - dist1) / dist2;
              pawClone.position.lerpVectors(cornerPos, targetPos, alpha);
              currentTarget = targetPos;
            }

            // Look exactly along the segment it is currently on
            if (currentDist <= dist1 && dist1 > 0.01) {
              pawClone.lookAt(cornerPos);
            } else if (currentDist > dist1 && dist2 > 0.01) {
              pawClone.lookAt(targetPos);
            } else {
              pawClone.lookAt(targetPos);
            }
            
            // Adjust paw rotations correctly
            pawClone.rotateY(Math.PI);
            pawClone.rotateX(-Math.PI / 2);
            pawClone.scale.set(0.005, 0.005, 0.005);
            
            // --- DYNAMIC FLOOR HEIGHT SNAP ---
            // Raycast straight down from JUST above the interior floor (startPos.y + 3.0) 
            // so we don't hit the spaceship's roof! This perfectly mimics the player's gravity.
            pawRaycaster.set(new THREE.Vector3(pawClone.position.x, startPos.y + 3.0, pawClone.position.z), downVector);
            const collidableObjects = [];
            
            // In OutsideScene, spaceshipGroup might be accessible via the cache
            if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.gltf) {
                collidableObjects.push(window.__SPACESHIP_CACHE__.gltf.scene);
            }
            
            if (collidableObjects.length > 0) {
                const hits = pawRaycaster.intersectObjects(collidableObjects, true);
                // We want a solid floor hit.
                const validFloor = hits.find(h => h.object.name && !h.object.name.toLowerCase().includes('glass') && !h.object.name.toLowerCase().includes('niche'));
                if (validFloor) {
                    pawClone.position.y = validFloor.point.y + 0.1; // Place perfectly 0.1m above the physical floor!
                } else {
                    // Fallback to startPos.y if raycast completely misses
                    pawClone.position.y = startPos.y; 
                }
            } else {
                pawClone.position.y = startPos.y;
            }

            pawGroupRef.current.add(pawClone);
            console.log(`[PAW DEBUG - ${Date.now()}] Paw ${i}/${numPaws} placed at X=${pawClone.position.x.toFixed(3)}, Y=${pawClone.position.y.toFixed(3)}, Z=${pawClone.position.z.toFixed(3)}`);
          }

          lastPawTargetRef.current = currentPawTarget;
          // Trigger the niche popup
          if (selectedNicheRef.current !== currentPawTarget) {
            setSelectedNiche(currentPawTarget);
          }
        }
      }

      // Guide Walking Logic (Restored using X-axis Paw Path logic)
      const currentTargetNiche = nunTargetNicheRef.current;
      const avatarGroup = window.__SPACESHIP_CACHE__?.guideOuterGroup;

      if (currentTargetNiche && avatarGroup) {
        let targetPos = new THREE.Vector3();
        let targetMesh: THREE.Mesh | null = null;
        let isReturning = currentTargetNiche === 'RETURN';
        let targetAnimation = 'Idle';

        if (isReturning) {
          // Returning to original position
          if (guideOriginalPosRef.current) {
            const cornerPos = new THREE.Vector3(avatarGroup.position.x, avatarGroup.position.y, -2.0);
            const finalPos = guideOriginalPosRef.current.clone();
            finalPos.y = avatarGroup.position.y;
            
            // State-free L-Shape returning: check if Z has reached the hallway center
            if (Math.abs(avatarGroup.position.z - cornerPos.z) > 0.2) {
              targetPos.copy(cornerPos);
            } else {
              targetPos.copy(finalPos);
            }
          }
        } else {
          // Walking to niche
          targetMesh = scene.getObjectByName(currentTargetNiche) as THREE.Mesh;
          if (targetMesh) {
            const nichePos = new THREE.Vector3();
            const box = new THREE.Box3().setFromObject(targetMesh);
            box.getCenter(nichePos);

            // Save original position if not saved yet
            if (!guideOriginalPosRef.current) {
              guideOriginalPosRef.current = avatarGroup.position.clone();
              guideOriginalRotRef.current = avatarGroup.quaternion.clone();
            }

            // L-SHAPE NUN PATHING LOGIC
            // Hallway center is at Z = -2.0. The corner is at the Niche's X coordinate.
            const cornerPos = new THREE.Vector3(nichePos.x, avatarGroup.position.y, -2.0);
            
            // Final target is Niche's X and Z.
            const finalPos = new THREE.Vector3(nichePos.x, avatarGroup.position.y, nichePos.z);
            // Stop exactly 2.0 meters short to avoid clipping into the wall
            const toFinalDir = new THREE.Vector3().subVectors(cornerPos, finalPos);
            toFinalDir.y = 0;
            toFinalDir.normalize();
            if (toFinalDir.lengthSq() > 0) {
                finalPos.add(toFinalDir.multiplyScalar(2.0));
            }

            // State-free L-Shape target: check if X has reached the niche's corridor position
            if (Math.abs(avatarGroup.position.x - cornerPos.x) > 0.2) {
              targetPos.copy(cornerPos);
            } else {
              targetPos.copy(finalPos);
            }
          }
        }

        // If we have a valid target position (length > 0 means it was set)
        if (targetPos.lengthSq() > 0) {
          // Calculate distance on the XZ plane
          const posXZ = new THREE.Vector3(avatarGroup.position.x, 0, avatarGroup.position.z);
          const targetXZ = new THREE.Vector3(targetPos.x, 0, targetPos.z);
          const distance = posXZ.distanceTo(targetXZ);
          
          if (distance > 0.2) {
            // Face the target
            avatarGroup.lookAt(targetPos);
            // Move towards target at normal walking speed (4.0 units/sec)
            // Cap delta to 0.1s max to prevent massive jumps/teleportation during lag
            const safeDelta = Math.min(delta, 0.1); 
            const moveStep = Math.min(distance, 4.0 * safeDelta);
            const moveDir = new THREE.Vector3().subVectors(targetPos, avatarGroup.position).normalize();
            moveDir.y = 0;
            moveDir.normalize();

            avatarGroup.position.addScaledVector(moveDir, moveStep);
            
            // --- NUN DYNAMIC GRAVITY RAYCASTER ---
            const nunRaycaster = new THREE.Raycaster();
            const downVector = new THREE.Vector3(0, -1, 0);
            // Shoot from Y=14.0 to start BELOW the ceiling (which is at Y=19.14) but ABOVE the floor (Y=11.1)
            nunRaycaster.set(new THREE.Vector3(avatarGroup.position.x, 14.0, avatarGroup.position.z), downVector);
            const collidableObjects = [];
            
            if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.gltf) {
                collidableObjects.push(window.__SPACESHIP_CACHE__.gltf.scene);
            }
            if (collidableObjects.length > 0) {
                const hits = nunRaycaster.intersectObjects(collidableObjects, true);
                const validFloor = hits.find(h => h.object.name && !h.object.name.toLowerCase().includes('glass') && !h.object.name.toLowerCase().includes('niche'));
                if (validFloor) {
                    avatarGroup.position.y = validFloor.point.y; // Snap exactly to the floor height
                    if (Math.random() < 0.05) console.log(`[NUN WALK DEBUG] X: ${avatarGroup.position.x.toFixed(2)}, Z: ${avatarGroup.position.z.toFixed(2)} | Floor hit at Y: ${validFloor.point.y.toFixed(2)}`);
                }
            }

            targetAnimation = 'Walking';
            
            // Debug logs
            
          } else {
            // Reached destination
            if (isReturning) {
              // Reached home
              if (guideOriginalRotRef.current) {
                avatarGroup.quaternion.copy(guideOriginalRotRef.current);
              }
              setNunTargetNiche(null);
              setGuideMode(null);
              guideOriginalPosRef.current = null;
              guideOriginalRotRef.current = null;
            } else if (targetMesh) {
              // Reached niche
              const lookTarget = targetMesh.getWorldPosition(new THREE.Vector3());
              lookTarget.y = avatarGroup.position.y;
              avatarGroup.lookAt(lookTarget);

              // Only trigger once
              if (selectedNicheRef.current !== currentTargetNiche) {
                setSelectedNiche(currentTargetNiche);
              }

              // Clear target to cleanly exit walking loop
              setNunTargetNiche(null);
            }
            targetAnimation = 'Idle';
          }

          // Switch animation
          if (window.__SPACESHIP_CACHE__?.guideActionMap) {
            const actionMap = window.__SPACESHIP_CACHE__.guideActionMap;
            let actualAnim = targetAnimation;

            if (actualAnim === 'Walking' && !actionMap['Walking']) actualAnim = 'Idle';

            const isPlaying = window.__SPACESHIP_CACHE__?.currentAudio && !window.__SPACESHIP_CACHE__?.currentAudio.paused;
            if (actualAnim === 'Idle' && isPlaying && actionMap['Talking_0']) actualAnim = 'Talking_0';

            if (debugAnimRef.current && actionMap[debugAnimRef.current]) actualAnim = debugAnimRef.current;

            if (window.__SPACESHIP_CACHE__.guideCurrentAction !== actualAnim) {
              if (actionMap[actualAnim]) {
                const currentAct = actionMap[window.__SPACESHIP_CACHE__.guideCurrentAction!];
                const nextAct = actionMap[actualAnim];
                if (currentAct) currentAct.fadeOut(0.5);
                nextAct.reset().fadeIn(0.5).play();
                window.__SPACESHIP_CACHE__.guideCurrentAction = actualAnim;
              }
            }
          }
        }
      } else {
        // Not walking, check if talking
        if (window.__SPACESHIP_CACHE__?.guideActionMap) {
          const actionMap = window.__SPACESHIP_CACHE__.guideActionMap;
          const isPlaying = window.__SPACESHIP_CACHE__?.currentAudio && !window.__SPACESHIP_CACHE__?.currentAudio.paused;
          let actualAnim = isPlaying && actionMap['Talking_0'] ? 'Talking_0' : 'Idle';

          // Override with debug sandbox animation if set
          if (debugAnimRef.current && actionMap[debugAnimRef.current]) {
            actualAnim = debugAnimRef.current;
          }

          if (window.__SPACESHIP_CACHE__.guideCurrentAction !== actualAnim) {
            if (actionMap[actualAnim]) {
              const currentAct = actionMap[window.__SPACESHIP_CACHE__.guideCurrentAction!];
              const nextAct = actionMap[actualAnim];
              if (currentAct) currentAct.fadeOut(0.5);
              nextAct.reset().fadeIn(0.5).play();
              window.__SPACESHIP_CACHE__.guideCurrentAction = actualAnim;
            }
          }
        }
      }

      // ENFORCE NUN UPRIGHT POSTURE:
      // Prevent the nun from ever pitching forward or rolling to the side.
      if (window.__SPACESHIP_CACHE__?.guideGltf?.scene) {
        window.__SPACESHIP_CACHE__.guideGltf.scene.rotation.x = 0;
        window.__SPACESHIP_CACHE__.guideGltf.scene.rotation.z = 0;
      }

      if (mixer) {
        mixer.update(delta);

        // HEAD TRACKING
        const head = window.__SPACESHIP_CACHE__?.guideHeadBone;
        const avatarGroup = window.__SPACESHIP_CACHE__?.guideGltf?.scene;
        if (head && (head as any).isBone && avatarGroup && camera) {
          const headPos = new THREE.Vector3();
          head.getWorldPosition(headPos);
          const avatarForward = new THREE.Vector3(0, 0, 1).applyQuaternion(avatarGroup.quaternion).normalize();
          const toCam = new THREE.Vector3().subVectors(camera.position, headPos).normalize();

          // Only track if camera is in front of avatar (dot > 0 = within 180 degree cone)
          if (avatarForward.dot(toCam) > 0 && window.__SPACESHIP_CACHE__?.guideCurrentAction !== 'Walking') {
            head.lookAt(camera.position);
          }
        }

        // Audio Lip Sync & Talking Mouth Motion
        if (window.__SPACESHIP_CACHE__?.currentAudio) {
          const audio = window.__SPACESHIP_CACHE__.currentAudio;
          const lipsyncManager = window.__SPACESHIP_CACHE__.lipsyncManager;
          const isPlaying = !audio.paused && !audio.ended;

          const headMesh = window.__SPACESHIP_CACHE__.guideHeadMesh;
          const teethMesh = window.__SPACESHIP_CACHE__.guideTeethMesh;
          const jawBone = window.__SPACESHIP_CACHE__.guideJawBone;
          const headBone = window.__SPACESHIP_CACHE__.guideHeadBone;

          // 1. Viseme Morph Target Lip Sync (for models with blendshapes)
          if (headMesh && headMesh.morphTargetDictionary && headMesh.morphTargetInfluences) {
            const visemes = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR', 'viseme_sil'];

            // Reset all visemes to 0
            visemes.forEach(v => {
              const headIdx = headMesh.morphTargetDictionary![v];
              if (headIdx !== undefined) headMesh.morphTargetInfluences![headIdx] = THREE.MathUtils.lerp(headMesh.morphTargetInfluences![headIdx], 0, 15 * delta);

              if (teethMesh && teethMesh.morphTargetDictionary && teethMesh.morphTargetInfluences) {
                const teethIdx = teethMesh.morphTargetDictionary[v];
                if (teethIdx !== undefined) teethMesh.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teethMesh.morphTargetInfluences[teethIdx], 0, 15 * delta);
              }
            });

            if (isPlaying && lipsyncManager) {
              lipsyncManager.processAudio();
              const viseme = lipsyncManager.viseme;
              const headIdx = headMesh.morphTargetDictionary[viseme];

              if (headIdx !== undefined) headMesh.morphTargetInfluences[headIdx] = THREE.MathUtils.lerp(headMesh.morphTargetInfluences[headIdx], 1, 15 * delta);

              if (teethMesh && teethMesh.morphTargetDictionary && teethMesh.morphTargetInfluences) {
                const teethIdx = teethMesh.morphTargetDictionary[viseme];
                if (teethIdx !== undefined) teethMesh.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teethMesh.morphTargetInfluences[teethIdx], 1, 15 * delta);
              }
            }
          }

          // 2. Bone-driven Jaw / Lip Talking Motion (for Sister Madeline Nun model)
          const targetJawRot = isPlaying ? (Math.sin(performance.now() * 0.022) * 0.16 + 0.08) : 0;
          if (jawBone) {
            jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, targetJawRot, 15 * delta);
          } else if (headBone && isPlaying) {
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetJawRot * 0.4, 10 * delta);
          }

          if (window.__SPACESHIP_CACHE__.guideLipBones) {
            window.__SPACESHIP_CACHE__.guideLipBones.forEach(lip => {
              const targetLipRot = isPlaying ? (Math.sin(performance.now() * 0.033) * 0.12) : 0;
              lip.rotation.x = THREE.MathUtils.lerp(lip.rotation.x, targetLipRot, 15 * delta);
            });
          }
        }
      }

      if (spaceshipMixer) spaceshipMixer.update(delta);

      if (mainDoorActions.length > 0 && doorPosition) {
        const camPos2D = new THREE.Vector3(camera.position.x, 0, camera.position.z);
        const doorPos2D = new THREE.Vector3(doorPosition.x, 0, doorPosition.z);
        const dist = camPos2D.distanceTo(doorPos2D);

        // The spaceship is deep along the negative X axis. So if we are past the door (camera.position.x < doorPosition.x), we are inside.
        const isInsideSpaceship = camera.position.x < doorPosition.x + 2.0;
        const isNearDoor = dist < 15.0;
        const shouldDoorBeOpen = isNearDoor || isInsideSpaceship;

        // NUN GREETING LOGIC
        if (window.__SPACESHIP_CACHE__ && window.__SPACESHIP_CACHE__.guideGltf) {
          const nunPos = new THREE.Vector3();
          window.__SPACESHIP_CACHE__.guideGltf.scene.getWorldPosition(nunPos);
          const camPosFlat = new THREE.Vector3(camera.position.x, 0, camera.position.z);
          const nunPosFlat = new THREE.Vector3(nunPos.x, 0, nunPos.z);
          const distToNun = camPosFlat.distanceTo(nunPosFlat);

          // DEBUG: Throttle log every ~1 sec (60 frames) to check greeting logic
          if (!(window as any)._LOGGED_GREETING && Math.random() < 0.02) {
            
          }

          // Trigger Nun Greeting ONLY when they are within 5.0m of the Nun (Plays exactly once)
          if (distToNun < 5.0 && !hasGreetedRef.current) {
            
            (window as any)._LOGGED_GREETING = true;
            hasGreetedRef.current = true;
            const audio = playAudioWithLipSync('/audio/greeting.mp3');
            audio.onended = () => {
              setShowNunDialog(true);
            };
          }
        }

        mainDoorActions.forEach(state => {
          if (shouldDoorBeOpen && !state.isOpen) {
            state.action.paused = false;
            state.action.timeScale = 1;
            state.action.play();
            state.isOpen = true;
          } else if (!shouldDoorBeOpen && state.isOpen) {
            state.action.paused = false;
            state.action.timeScale = -1;
            state.action.play();
            state.isOpen = false;
          }
        });
      }

      // iFly Chamber Door Proximity
      if ((chamberDoorActions.length > 0 || glassDoors.length > 0) && tubeCenterRef.current) {
        const playerPos = playerCollider.start;
        const tubePos = tubeCenterRef.current;

        const distToTube = Math.sqrt(
          Math.pow(playerPos.x - tubePos.x, 2) +
          Math.pow(playerPos.z - tubePos.z, 2)
        );

        chamberDoorActions.forEach(state => {
          // Remove the Y floor check because the physics collider offset (8.76m) ruins visual Y comparisons
          const shouldOpen = distToTube < 6.0;

          if (shouldOpen && !state.isOpen) {
            state.action.paused = false;
            state.action.timeScale = 1;
            state.action.play();
            state.isOpen = true;
          } else if (!shouldOpen && state.isOpen) {
            state.action.paused = false;
            state.action.timeScale = -1;
            state.action.play();
            state.isOpen = false;
          }
        });

        // Slide the new glass doors
        glassDoors.forEach(door => {
          const shouldOpen = distToTube < 5.0;
          const targetOffset = shouldOpen ? 0.8 : 0;
          door.isOpen = shouldOpen;

          const currentOffset = Math.abs(door.mesh.position.z - door.initialZ);
          const diff = targetOffset - currentOffset;

          if (Math.abs(diff) > 0.01) {
            const step = Math.sign(diff) * 1.5 * delta;
            if (Math.abs(step) > Math.abs(diff)) {
              door.mesh.position.z = door.initialZ + (door.side === 'left' ? targetOffset : -targetOffset);
            } else {
              door.mesh.position.z += door.side === 'left' ? step : -step;
            }
          }
        });
      }

      // Desktop Movement Logic (Octree & Capsule)
      if (controls.isLocked) {
        // Calculate forward/right vectors based on camera yaw
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

        // Input movement
        const moveZ = Number(moveState.forward) - Number(moveState.backward);
        const moveX = Number(moveState.right) - Number(moveState.left);

        // Physics Sub-stepping for stability
        const STEPS_PER_FRAME = 5;
        const dt = delta / STEPS_PER_FRAME;

        for (let i = 0; i < STEPS_PER_FRAME; i++) {

          let damping = Math.exp(-4 * dt) - 1;

          if (!playerOnFloor) {
            if (envGroup) { playerVelocity.y -= 30 * dt; } else { playerVelocity.y = 0; } // GRAVITY
            damping = Math.exp(-1.5 * dt) - 1; // Less air resistance
          }

          playerVelocity.addScaledVector(playerVelocity, damping);

          // Apply acceleration if moving (always full speed since we removed floor logic)
          const acceleration = (window as any).__PLAYER_ON_SPACESHIP__ ? 350.0 : 1200.0;
          if (moveZ !== 0) playerVelocity.addScaledVector(camDir, moveZ * acceleration * dt);
          if (moveX !== 0) playerVelocity.addScaledVector(camRight, moveX * acceleration * dt);

          // Translate Capsule
          const deltaPos = playerVelocity.clone().multiplyScalar(dt);
          playerCollider.translate(deltaPos);

          // iFly Zero-Gravity Chamber Pre-Check
          // We must know if we are in the tube BEFORE resolving octree collisions 
          // so we can bypass floor ceilings when floating upwards.
          let isCurrentlyInTube = false;
          let distToTubeCenter = 0;

          if (tubeCenterRef.current) {
            const tempDx = playerCollider.start.x - tubeCenterRef.current.x;
            const tempDz = playerCollider.start.z - tubeCenterRef.current.z;
            const tempRadius = Math.max(2.0, Math.min(tubeRadiusRef.current, 10.0));
            if (Math.sqrt(tempDx * tempDx + tempDz * tempDz) < tempRadius) {
              isCurrentlyInTube = true;
            }
          }

          // Resolve Collisions with Octree ONLY if outside tube
          if (!isCurrentlyInTube) {
            playerCollisions();
          }

          // iFly Zero-Gravity Chamber Boundary Clamping

          if (tubeCenterRef.current) {
            const dx = playerCollider.start.x - tubeCenterRef.current.x;
            const dz = playerCollider.start.z - tubeCenterRef.current.z;
            distToTubeCenter = Math.sqrt(dx * dx + dz * dz);

            // Allow a tiny margin of error inside the tube
            const activeRadius = Math.max(2.0, Math.min(tubeRadiusRef.current, 10.0));

            // Doorway is defined by being within 3.5 units of ANY door (glass or metal) on the current floor, regardless of if it's open
            const currentFloorY = targetFloorYRef.current;
            const isDoorway = chamberDoorPositions.some(door => {
              return Math.abs(door.floorY - currentFloorY) < 3.0 &&
                Math.sqrt(Math.pow(door.pos.x - playerCollider.start.x, 2) + Math.pow(door.pos.z - playerCollider.start.z, 2)) < 4.0;
            }) || glassDoors.some(door => {
              const doorPos = new THREE.Vector3();
              door.mesh.getWorldPosition(doorPos);
              return Math.abs(door.floorY - currentFloorY) < 3.0 &&
                Math.sqrt(Math.pow(doorPos.x - playerCollider.start.x, 2) + Math.pow(doorPos.z - playerCollider.start.z, 2)) < 4.0;
            });

            if (!isDoorway) {
              // Glass Boundary Clamping
              if (inTubeRef.current && distToTubeCenter >= activeRadius - 0.2) {
                // Clamp inside
                const normalizeX = dx / distToTubeCenter;
                const normalizeZ = dz / distToTubeCenter;
                playerCollider.translate(new THREE.Vector3(
                  (normalizeX * (activeRadius - 0.2)) - dx,
                  0,
                  (normalizeZ * (activeRadius - 0.2)) - dz
                ));
              } else if (!inTubeRef.current && distToTubeCenter <= activeRadius + 0.2) {
                // Clamp outside
                const normalizeX = dx / distToTubeCenter;
                const normalizeZ = dz / distToTubeCenter;
                playerCollider.translate(new THREE.Vector3(
                  (normalizeX * (activeRadius + 0.2)) - dx,
                  0,
                  (normalizeZ * (activeRadius + 0.2)) - dz
                ));
              }
            }

            // Recalculate distance in case it was clamped
            const newDx = playerCollider.start.x - tubeCenterRef.current.x;
            const newDz = playerCollider.start.z - tubeCenterRef.current.z;
            isCurrentlyInTube = Math.sqrt(newDx * newDx + newDz * newDz) < activeRadius;
          }

          updateInTube(isCurrentlyInTube);

          let targetY = targetFloorYRef.current;

          if (isCurrentlyInTube) {
            // Inside tube: Smoothly float to target floor Y
            const diff = targetY - playerCollider.start.y;
            const stepY = Math.sign(diff) * Math.min(Math.abs(diff), 12.0 * dt);
            playerCollider.translate(new THREE.Vector3(0, stepY, 0));
          }
        }

        // Sync Camera to Capsule Feet (start)
        camera.position.copy(playerCollider.start);
        // Force camera to exactly 4.5m height above the feet visually to maintain a tall human height!
        camera.position.y += (window as any).__PLAYER_ON_SPACESHIP__ ? 4.0 : 12.0;
      }

      renderer.render(scene, camera);
    });

    // 7. HANDLE RESIZE
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // CLEANUP
    return () => {
      isMounted = false;
      renderer.setAnimationLoop(null);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('click', onMouseClick);
      renderer.domElement.removeEventListener('click', blockClick);
      window.removeEventListener('resize', onWindowResize);
      if (containerRef.current) containerRef.current.innerHTML = '';
      if (vrButton.parentNode) vrButton.parentNode.removeChild(vrButton);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* 3D Canvas Container */}
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} />

      {/* Loading Screen */}
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#111', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 50, color: 'white' }}>
          <h2>{physicsLoading ? "Calculating Advanced Physics..." : "Loading Immersive Environment..."}</h2>
          {!physicsLoading && <p>{loadProgress}%</p>}
          <p style={{ color: 'gray', fontSize: '0.8rem', marginTop: '20px' }}>Loading 120MB unoptimized local file. This may take a moment.</p>
        </div>
      )}

      {/* iFly Chamber UI */}
      {inTube && (
        <div style={{
          position: 'absolute',
          top: '50%',
          right: '20px',
          transform: 'translateY(-50%)',
          backgroundColor: 'rgba(0, 50, 100, 0.8)',
          color: '#fff',
          padding: '20px',
          borderRadius: '15px',
          fontFamily: 'sans-serif',
          zIndex: 1000,
          border: '1px solid #00aaff',
          boxShadow: '0 0 20px rgba(0, 170, 255, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#00ffff' }}>iFly Chamber</h3>
          <button
            onClick={() => {
              const role = session ? (session.user as any).role : "GUEST";
              // if (role === "GUEST") {
              //   alert("Please Sign In to access the Second Floor.");
              //   signIn("credentials");
              // } else {
              // Add 8.76 to align the visual 30.94 floor with the Octree physics collider which has an 8.76 offset!
              targetFloorYRef.current = 30.94;
              // }
            }} // Floor 3 (Second)
            style={{
              padding: '12px 24px',
              backgroundColor: targetFloorYRef.current === 30.94 ? '#00ffff' : '#003366',
              color: targetFloorYRef.current === 30.94 ? '#000' : '#fff',
              border: '1px solid #00ffff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}>
            Second Floor
          </button>
          <button
            onClick={() => {
              const role = session ? (session.user as any).role : "GUEST";
              // if (role !== "PREMIUM") {
              //   alert("The First Floor is restricted to Premium members. Please upgrade your account.");
              // } else {
              // Add 8.76 to align the visual 21.48 floor with the Octree physics collider which has an 8.76 offset!
              targetFloorYRef.current = 21.48;
              // }
            }} // Floor 2 (First)
            style={{
              padding: '12px 24px',
              backgroundColor: targetFloorYRef.current === 21.48 ? '#00ffff' : '#003366',
              color: targetFloorYRef.current === 21.48 ? '#000' : '#fff',
              border: '1px solid #00ffff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}>
            First Floor
          </button>
          <button
            onClick={() => targetFloorYRef.current = 11.0} // Floor 1 (Ground)
            style={{
              padding: '12px 24px',
              backgroundColor: targetFloorYRef.current === 11.0 ? '#00ffff' : '#003366',
              color: targetFloorYRef.current === 11.0 ? '#000' : '#fff',
              border: '1px solid #00ffff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}>
            Ground Floor
          </button>
        </div>
      )}

      {/* Crosshair */}
      {!loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '10px', height: '10px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, pointerEvents: 'none' }} />
      )}

      {/* Hologram UI Overlay */}
      {selectedNiche && (() => {
        const data = occupiedMap[selectedNiche];
        const isSold = data && (data.status === 'occupied' || data.status === 'SOLD' || data.status === 'sold');
        const color = data ? (isSold ? '#ff4444' : '#ffaa00') : '#00ffcc';
        const bgColor = data ? (isSold ? 'rgba(255,0,0,0.1)' : 'rgba(255,170,0,0.1)') : 'transparent';

        return (
          <div style={{ position: 'absolute', top: '20%', right: '5%', width: '350px', backgroundColor: 'rgba(0,20,40,0.85)', border: `1px solid ${color}`, padding: '25px', color: color, borderRadius: '10px', zIndex: 10, boxShadow: `0 0 15px ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${color}`, paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase' }}>{data?.nicheNum || selectedNiche}</h3>
              <button onClick={() => {
                setSelectedNiche(null);
                if (guideMode === 'nun') {
                  setNunTargetNiche('RETURN');
                }
              }} style={{ background: 'none', border: 'none', color: color, cursor: 'pointer', fontSize: '1.2rem' }}>X</button>
            </div>

            {data ? (
              <div>
                <p style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>{data.name}</p>
                {isSold && (
                  <p style={{ margin: '5px 0', fontSize: '0.9rem', color: '#ccc' }}>{data.dob} {data.dob && '-'} {data.dod}</p>
                )}
                {data.status === 'reserved' && data.dob && (
                  <p style={{ margin: '5px 0', fontSize: '0.9rem', color: '#ccc' }}>Reserved since: {data.dob}</p>
                )}
                <div style={{ marginTop: '15px', padding: '15px', backgroundColor: bgColor, borderLeft: `3px solid ${color}`, fontStyle: 'italic', color: '#eee' }}>
                  "{data.message || (data.status === 'SOLD' ? 'This niche bundle is sold.' : 'This niche is available for purchase.')}"
                </div>
                {isSold && (
                  <button style={{ marginTop: '20px', width: '100%', padding: '10px', backgroundColor: 'transparent', color: color, border: `1px solid ${color}`, fontWeight: 'bold', cursor: 'pointer' }}>View Memories & NFT</button>
                )}
                {data.status === 'available' && (
                  <button
                    onClick={async () => {
                      // if (!session) {
                      //   alert("Please Sign In to purchase a Niche.");
                      //   signIn("credentials");
                      //   return;
                      // }
                      try {
                        const res = await fetch("/api/checkout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ shapeId: data.nicheNum || selectedNiche })
                        });
                        const json = await res.json();
                        if (json.url) {
                          window.location.href = json.url;
                        } else {
                          alert("Error: " + json.error);
                        }
                      } catch (e) { console.error(e); }
                    }}
                    style={{ marginTop: '20px', width: '100%', padding: '12px', backgroundColor: '#33ff55', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Buy Niche Bundle (10 Niches for $5,000)
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p><strong>Status:</strong> AVAILABLE</p>
                <p>This niche bundle (10 niches) is vacant and available for purchase.</p>
                <button
                  onClick={async () => {
                    // if (!session) {
                    //   alert("Please Sign In to purchase a Niche Bundle.");
                    //   signIn("credentials");
                    //   return;
                    // }
                    try {
                      const res = await fetch("/api/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ shapeId: selectedNiche })
                      });
                      const json = await res.json();
                      if (json.url) {
                        window.location.href = json.url;
                      } else {
                        alert("Error: " + json.error);
                      }
                    } catch (e) { console.error(e); }
                  }}
                  style={{ marginTop: '15px', width: '100%', padding: '10px', backgroundColor: color, color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>Buy Niche Bundle (10)</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Desktop Instruction Overlay */}
      {!loading && !showNunDialog && (
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '8px', zIndex: 10, pointerEvents: 'none' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Desktop Controls</h4>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>• <strong>Click anywhere</strong> to lock mouse & look around</p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>• <strong>W A S D</strong> to walk</p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>• <strong>ESC</strong> to unlock mouse</p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>• <strong>Left Click (while locked)</strong> to interact with Niches</p>
        </div>
      )}

      {/* Nun Receptionist Dialog */}
      {showNunDialog && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(10, 10, 15, 0.9)', border: '2px solid #d4af37', padding: '30px', borderRadius: '12px', zIndex: 100, color: 'white', width: '400px', textAlign: 'center', boxShadow: '0 0 20px rgba(212, 175, 55, 0.3)' }}>
          <h2 style={{ color: '#d4af37', marginBottom: '10px' }}>Receptionist</h2>
          {!hasGreetedRef.current && (
            <p style={{ marginBottom: '25px', fontStyle: 'italic', color: '#ccc' }}>"Welcome to the Akasha Spaceship. How may I assist you today?"</p>
          )}
          {hasGreetedRef.current && (
            <p style={{ marginBottom: '25px', fontStyle: 'italic', color: '#ccc' }}>"How else may I assist you?"</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => handleNunOptionClick(0)} style={{ padding: '12px', backgroundColor: '#222', border: '1px solid #444', color: 'white', borderRadius: '5px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#444')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#222')}>Have a private conversation</button>
            <button onClick={() => handleNunOptionClick(1)} style={{ padding: '12px', backgroundColor: '#222', border: '1px solid #444', color: 'white', borderRadius: '5px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#444')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#222')}>Show path leading to specific niche</button>
            <button onClick={() => handleNunOptionClick(2)} style={{ padding: '12px', backgroundColor: '#222', border: '1px solid #444', color: 'white', borderRadius: '5px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#444')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#222')}>Nun herself guides me to specific niche</button>
            <button onClick={() => handleNunOptionClick(3)} style={{ padding: '12px', backgroundColor: '#222', border: '1px solid #444', color: 'white', borderRadius: '5px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#444')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#222')}>Wander myself alone in the environment</button>
          </div>
        </div>
      )}

      {/* Search Prompt */}
      {searchPrompt && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(10, 10, 15, 0.9)', border: '2px solid #00aaff', padding: '30px', borderRadius: '12px', zIndex: 100, color: 'white', width: '350px', textAlign: 'center', boxShadow: '0 0 20px rgba(0, 170, 255, 0.3)' }}>
          <h2 style={{ color: '#00aaff', marginBottom: '10px' }}>Who are you visiting?</h2>
          <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#ccc' }}>Enter the full name of the person you are looking for.</p>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. Person 5"
            style={{ width: '90%', padding: '12px', marginBottom: '20px', borderRadius: '5px', border: '1px solid #00aaff', backgroundColor: '#111', color: 'white', fontSize: '1rem' }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={handleSearchSubmit} style={{ padding: '10px 20px', backgroundColor: '#00aaff', border: 'none', color: 'black', fontWeight: 'bold', borderRadius: '5px', cursor: 'pointer' }}>Search</button>
            <button onClick={() => setSearchPrompt(false)} style={{ padding: '10px 20px', backgroundColor: '#222', border: '1px solid #444', color: 'white', borderRadius: '5px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Exit Button */}
      <button
        onClick={() => onExit ? onExit() : window.location.reload()}
        style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, padding: '10px 20px', backgroundColor: 'transparent', color: '#d4af37', border: '1px solid #d4af37', borderRadius: '5px', cursor: 'pointer' }}
      >
        Exit to Lobby
      </button>

    </div>
  );
}
