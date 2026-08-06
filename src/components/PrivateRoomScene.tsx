// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Lipsync } from 'wawa-lipsync';

type ConvState = 'SELECT_CHAR' | 'LOADING' | 'GREETING' | 'PROMPT_WALK_SIT' | 'WALKING_TO_SOFA' | 'STORY_SOFA' | 'STORY_WALKING' | 'PAUSED' | 'GOODBYE';

export default function PrivateRoomScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadText, setLoadText] = useState("Initializing Room...");

  const [convState, setConvState] = useState<ConvState>('LOADING');
  const convStateRef = useRef<ConvState>('LOADING');
  useEffect(() => { convStateRef.current = convState; }, [convState]);

  const [caveLoaded, setCaveLoaded] = useState(false);
  const caveColliderRef = useRef<THREE.Group | null>(null);

  const [selectedChar, setSelectedChar] = useState<'wife' | 'dad' | null>(null);
  const selectedCharRef = useRef<'wife' | 'dad' | null>(null);
  useEffect(() => { selectedCharRef.current = selectedChar; }, [selectedChar]);

  // Core references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Physics and controls
  const worldOctree = useRef(new Octree());
  const controlsRef = useRef<PointerLockControls | null>(null);
  const playerCollider = useRef(new Capsule(new THREE.Vector3(-2, 0.35, -2), new THREE.Vector3(-2, 1.45, -2), 0.35));
  const playerVelocity = useRef(new THREE.Vector3());
  const playerDirection = useRef(new THREE.Vector3());
  const playerOnFloor = useRef(false);

  // Models
  const avatarGroup = useRef<THREE.Group | null>(null);
  const avatarMixer = useRef<THREE.AnimationMixer | null>(null);
  const animationsMap = useRef<Record<string, THREE.AnimationAction>>({});
  const headMeshRef = useRef<THREE.Mesh | null>(null);
  const teethMeshRef = useRef<THREE.Mesh | null>(null);
  const headBoneRef = useRef<THREE.Object3D | null>(null);

  // Audio & Lipsync
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lipsyncRef = useRef<Lipsync | null>(null);
  const wanderTarget = useRef(new THREE.Vector3(0, 0, -2));

  const pickNewWanderTarget = () => {
    const minX = -5;
    const maxX = 1;
    const minZ = -3;
    const maxZ = -1;
    wanderTarget.current.set(
      minX + Math.random() * (maxX - minX),
      0,
      minZ + Math.random() * (maxZ - minZ)
    );
  };

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.FogExp2(0x050508, 0.08); // Medium dark fog
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
      if (convStateRef.current !== 'SELECT_CHAR' && convStateRef.current !== 'PROMPT_WALK_SIT') {
        controls.lock();
      }
    });

    const keyStates: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => { keyStates[e.code] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keyStates[e.code] = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Cinematic Lighting (Sting movie style)
    const ambientLight = new THREE.AmbientLight(0x111116, 1.0); // Dim cool ambient // Dim cool ambient
    scene.add(ambientLight);

    // Light specifically to illuminate the avatar
    const avatarLight = new THREE.PointLight(0xaaccff, 2.0, 10);
    avatarLight.position.set(-0.5, 1.5, -1.0);
    scene.add(avatarLight);

    // Initial Load - load Cave
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);
    setLoadText("Loading Cave...");
    // Load visual cave
    loader.load('/models/updated cave.glb', (gltf) => {
      const cave = gltf.scene;
      scene.add(cave);
      cave.traverse((child) => {
        if (child.name === 'Leg part' || child.name === 'Seat part') {
          child.scale.set(2.0, 2.0, 2.0);
        }
      });
      cave.updateMatrixWorld(true);

      // Load optimized collider cave
      loader.load('/models/cave_collider.glb', (colGltf) => {
        const collider = colGltf.scene;
        collider.visible = false; // keep invisible
        scene.add(collider);
        collider.updateMatrixWorld(true);
        caveColliderRef.current = collider;

        worldOctree.current.fromGraphNode(collider);

        // Add a safety floor to prevent falling through any holes in the cave mesh
        const safetyFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial());
        safetyFloor.rotation.x = -Math.PI / 2;
        safetyFloor.updateMatrixWorld(true);
        worldOctree.current.fromGraphNode(safetyFloor);
        setCaveLoaded(true);
      });
    });

    // Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = Math.min(0.05, clock.getDelta());

      // Update avatar animations
      if (avatarMixer.current) {
        avatarMixer.current.update(deltaTime);

        // HEAD TRACKING
        if (headBoneRef.current && cameraRef.current && avatarGroup.current) {
          const head = headBoneRef.current;
          const cam = cameraRef.current;
          const avatar = avatarGroup.current;

          const headPos = new THREE.Vector3();
          head.getWorldPosition(headPos);

          // Get avatar's forward direction
          const avatarForward = new THREE.Vector3(0, 0, 1).applyQuaternion(avatar.quaternion).normalize();

          // Get direction to camera
          const toCam = new THREE.Vector3().subVectors(cam.position, headPos).normalize();

          // If camera is in front of avatar (dot product > 0 means within 180 degree cone)
          if (avatarForward.dot(toCam) > 0) {
            head.lookAt(cam.position);
          }
        }
      }

      // Update Lipsync
      if (lipsyncRef.current && headMeshRef.current && audioRef.current) {
        const audio = audioRef.current;
        const isPlaying = !audio.paused && !audio.ended;

        const headMesh = headMeshRef.current;
        const teethMesh = teethMeshRef.current;

        if (headMesh.morphTargetDictionary && headMesh.morphTargetInfluences) {
          const visemes = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR', 'viseme_sil'];

          visemes.forEach(v => {
            const headIdx = headMesh.morphTargetDictionary![v];
            if (headIdx !== undefined) headMesh.morphTargetInfluences![headIdx] = THREE.MathUtils.lerp(headMesh.morphTargetInfluences![headIdx], 0, 15 * deltaTime);

            if (teethMesh && teethMesh.morphTargetDictionary && teethMesh.morphTargetInfluences) {
              const teethIdx = teethMesh.morphTargetDictionary[v];
              if (teethIdx !== undefined) teethMesh.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teethMesh.morphTargetInfluences[teethIdx], 0, 15 * deltaTime);
            }
          });

          if (isPlaying) {
            lipsyncRef.current.processAudio();
            const viseme = lipsyncRef.current.viseme;

            const headIdx = headMesh.morphTargetDictionary[viseme];
            if (headIdx !== undefined) headMesh.morphTargetInfluences[headIdx] = THREE.MathUtils.lerp(headMesh.morphTargetInfluences![headIdx], 1, 15 * deltaTime);

            if (teethMesh && teethMesh.morphTargetDictionary && teethMesh.morphTargetInfluences) {
              const teethIdx = teethMesh.morphTargetDictionary[viseme];
              if (teethIdx !== undefined) teethMesh.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teethMesh.morphTargetInfluences[teethIdx], 1, 15 * deltaTime);
            }
          }
        }
      }

      // Check distance for pausing/resuming
      if (convStateRef.current.startsWith('STORY') || convStateRef.current === 'PAUSED') {
        const playerPos = playerCollider.current.end;
        const currentPos = avatarGroup.current?.position || new THREE.Vector3();
        const distance = playerPos.distanceTo(currentPos);

        if (convStateRef.current.startsWith('STORY') && distance > 3) {
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            audioRef.current.dataset.resumeTime = audioRef.current.currentTime.toString();
            audioRef.current.src = selectedCharRef.current === 'wife' ? '/audio/wife_proximity.mp3' : '/audio/dad_comecloser.mp3';
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.warn(e));
          }
          if (animationsMap.current['Talking_0']) animationsMap.current['Talking_0'].stop();
          if (animationsMap.current['Walking']) animationsMap.current['Walking'].stop();
          if (animationsMap.current['Sitting'] && convStateRef.current === 'STORY_SOFA') {
            // keep sitting
          } else if (animationsMap.current['Idle']) {
            animationsMap.current['Idle'].reset().fadeIn(0.5).play();
          }

          setConvState('PAUSED');

        } else if (convStateRef.current === 'PAUSED' && distance <= 3) {
          if (audioRef.current) {
            audioRef.current.pause();

            if (avatarGroup.current) {
              const sofaPos = new THREE.Vector3(-0.5, 0, -3.2);
              if (avatarGroup.current.position.distanceTo(sofaPos) < 1.0) {
                setConvState('STORY_SOFA');
                if (animationsMap.current['Sitting']) animationsMap.current['Sitting'].reset().fadeIn(0.5).play();
              } else {
                setConvState('STORY_WALKING');
                if (animationsMap.current['Talking_0']) animationsMap.current['Talking_0'].reset().fadeIn(0.5).play();
              }
            }

            const resumeTime = parseFloat(audioRef.current.dataset.resumeTime || '0');
            audioRef.current.src = selectedCharRef.current === 'wife' ? '/audio/wife_story.mp3' : '/audio/dad_story.mp3';
            const onLoaded = () => {
              if (audioRef.current) {
                audioRef.current.currentTime = resumeTime;
                audioRef.current.play().catch(e => console.warn(e));
                audioRef.current.removeEventListener('loadedmetadata', onLoaded);
              }
            };
            audioRef.current.addEventListener('loadedmetadata', onLoaded);

          }
        }
      }

      // --- Avatar Movement ---
      if (avatarGroup.current && convStateRef.current === 'WALKING_TO_SOFA') {
        const targetPos = new THREE.Vector3(-0.5, 0, -3.0); // Adjusted forward out of backrest
        const currentPos = avatarGroup.current.position;
        const dir = new THREE.Vector3().subVectors(targetPos, currentPos);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 0.1) {
          dir.normalize();
          avatarGroup.current.position.addScaledVector(dir, 0.5 * deltaTime);

          // Look at target
          const targetRot = Math.atan2(dir.x, dir.z);
          avatarGroup.current.rotation.y = targetRot;
        } else {
          // Reached sofa
          setConvState('STORY_SOFA');
          avatarGroup.current.rotation.y = 0; // Sit squarely on the sofa

          // Force perfect sitting position (lower height, forward Z)
          // Adjusted upward and slightly forward
          avatarGroup.current.position.set(-0.5, 0.05, -3.15); // Pushed back onto the seat

          // Lock player view and height!
          playerCollider.current.start.set(-0.5, 0.2, -2.0);
          playerCollider.current.end.set(-0.5, 0.7, -2.0);
          if (cameraRef.current && avatarGroup.current) {
            const lookTarget = avatarGroup.current.position.clone();
            lookTarget.y = 0.7; // face height
            cameraRef.current.lookAt(lookTarget);
          }

          Object.values(animationsMap.current).forEach(anim => anim.stop());
          if (animationsMap.current['Sitting']) {
            animationsMap.current['Sitting'].reset().fadeIn(0.5).play();
          } else if (animationsMap.current['Idle']) {
            animationsMap.current['Idle'].reset().fadeIn(0.5).play();
          }
          playAudio(selectedCharRef.current === 'wife' ? '/audio/wife_story.mp3' : '/audio/dad_story.mp3');
        }
      }

      if (avatarGroup.current && convStateRef.current === 'STORY_WALKING') {
        const currentPos = avatarGroup.current.position.clone();
        currentPos.y = 0;

        const targetPos = wanderTarget.current.clone();
        targetPos.y = 0;

        const dir = new THREE.Vector3().subVectors(targetPos, currentPos);
        const dist = dir.length();

        if (dist > 0.5) {
          dir.normalize();
          avatarGroup.current.position.addScaledVector(dir, 0.5 * deltaTime);
          avatarGroup.current.rotation.y = Math.atan2(dir.x, dir.z);
          if (animationsMap.current['Walking'] && !animationsMap.current['Walking'].isRunning()) {
            Object.values(animationsMap.current).forEach(anim => anim.stop());
            animationsMap.current['Walking'].reset().fadeIn(0.2).play();
          }
        } else {
          // Reached wander target, pick a new one
          pickNewWanderTarget();

          // Look at player briefly
          const playerPos = playerCollider.current.end.clone();
          playerPos.y = 0;
          const dirToPlayer = new THREE.Vector3().subVectors(playerPos, currentPos);
          avatarGroup.current.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);

          if (animationsMap.current['Talking_0'] && !animationsMap.current['Talking_0'].isRunning()) {
            Object.values(animationsMap.current).forEach(anim => anim.stop());
            animationsMap.current['Talking_0'].reset().fadeIn(0.2).play();
          }
        }
      }

      // Make avatar look at player when not walking or sitting
      if (avatarGroup.current && !['WALKING_TO_SOFA', 'STORY_SOFA', 'STORY_WALKING'].includes(convStateRef.current)) {
        const playerPos = playerCollider.current.end.clone();
        playerPos.y = avatarGroup.current.position.y; // Keep level
        const dirToPlayer = new THREE.Vector3().subVectors(playerPos, avatarGroup.current.position).normalize();
        avatarGroup.current.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      }

      // Physics controls
      if (controls.isLocked) {
        const speedDelta = deltaTime * (playerOnFloor.current ? 180 : 50);
        if (keyStates['KeyW']) playerVelocity.current.add(getForwardVector().multiplyScalar(speedDelta));
        if (keyStates['KeyS']) playerVelocity.current.add(getForwardVector().multiplyScalar(-speedDelta));
        if (keyStates['KeyA']) playerVelocity.current.add(getSideVector().multiplyScalar(-speedDelta));
        if (keyStates['KeyD']) playerVelocity.current.add(getSideVector().multiplyScalar(speedDelta));

        if (playerOnFloor.current && keyStates['Space']) {
          playerVelocity.current.y = 7; // Jump!
        }
      }

      let damping = Math.exp(-15 * deltaTime) - 1;
      if (caveColliderRef.current) {
        if (!playerOnFloor.current) {
          playerVelocity.current.y -= 20 * deltaTime; // Gravity!
          damping *= 0.1; // Air friction
        }
      } else {
        playerVelocity.current.y = 0; // Hover in place until cave loads
      }
      playerVelocity.current.addScaledVector(playerVelocity.current, damping);

      const deltaPosition = playerVelocity.current.clone().multiplyScalar(deltaTime);
      playerCollider.current.translate(deltaPosition);

      // Lock player Y to a flat plane for 60 FPS performance!
      // The high-poly cave mesh causes 2 FPS drops when raycasting every frame.
      playerCollider.current.start.y = 0.5;


      // Resolve player collisions using Octree!
      const result = worldOctree.current.capsuleIntersect(playerCollider.current);
      playerOnFloor.current = false;
      if (result) {
        playerOnFloor.current = result.normal.y > 0.1;
        if (!playerOnFloor.current) {
          playerVelocity.current.addScaledVector(result.normal, -result.normal.dot(playerVelocity.current));
        }
        playerCollider.current.translate(result.normal.multiplyScalar(result.depth));
      }

      // Enforce sitting rotation every frame (fixes hot-reload bugs)
      if (avatarGroup.current && convStateRef.current === 'STORY_SOFA') {
        avatarGroup.current.rotation.y = 0; // Sit squarely on the sofa
      }

      // Fast Raycast floor snapping for AI Character using collider mesh!
      if (avatarGroup.current && convStateRef.current !== 'STORY_SOFA' && caveColliderRef.current) {
        const raycaster = new THREE.Raycaster();
        raycaster.set(new THREE.Vector3(avatarGroup.current.position.x, avatarGroup.current.position.y + 0.5, avatarGroup.current.position.z), new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObject(caveColliderRef.current, true);
        if (hits.length > 0) {
          avatarGroup.current.position.y = hits[0].point.y;
        }
      }

      camera.position.copy(playerCollider.current.end);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  const getForwardVector = () => {
    if (!cameraRef.current) return new THREE.Vector3();
    cameraRef.current.getWorldDirection(playerDirection.current);
    playerDirection.current.y = 0;
    playerDirection.current.normalize();
    return playerDirection.current;
  };
  const getSideVector = () => {
    if (!cameraRef.current) return new THREE.Vector3();
    cameraRef.current.getWorldDirection(playerDirection.current);
    playerDirection.current.y = 0;
    playerDirection.current.normalize();
    playerDirection.current.cross(cameraRef.current.up);
    return playerDirection.current;
  };

  const resetToCharacterSelection = () => { };

  const loadCharacter = (type: 'wife' | 'dad') => {
    setSelectedChar(type);
    setLoading(true);
    setLoadText("Summoning Character...");
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    const loadGltf = (url: string) => new Promise<any>((resolve, reject) => loader.load(url, resolve, undefined, reject));
    const fbxLoader = new FBXLoader();
    const loadFbx = (url: string) => new Promise<any>((resolve, reject) => fbxLoader.load(url, resolve, undefined, reject));

    // Load character and animations concurrently
    const charFile = type === 'wife' ? '/models/guide_new.glb' : '/models/character done.glb';

    Promise.all([
      loadGltf('/models/animations.glb').catch(e => { console.error("Error loading animations.glb", e); return { animations: [] }; }),
      loadFbx('/models/Walking.fbx').catch(e => { console.error("Error loading Walking.fbx", e); return { animations: [] }; }),
      loadFbx('/models/Sitting Talking.fbx').catch(e => { console.error("Error loading Sitting Talking.fbx", e); return { animations: [] }; }),
      loadGltf(charFile)
    ]).then(([animGltf, walkFbx, sitFbx, gltf]) => {

      let finalAnims: THREE.AnimationClip[] = [];

      if (type === 'wife') {
        finalAnims = [...animGltf.animations];
        const fixTrackNames = (anim: THREE.AnimationClip) => {
          const newTracks: THREE.KeyframeTrack[] = [];
          anim.tracks.forEach(track => {
            if (track.name.includes('.scale')) return;
            track.name = track.name.replace(/mixamorig:?/g, '');
            if (track.name.includes('.position')) {
              for (let i = 0; i < track.values.length; i++) track.values[i] *= 0.01;
            }
            newTracks.push(track);
          });
          anim.tracks = newTracks;
          return anim;
        };

        if (walkFbx.animations && walkFbx.animations.length > 0) {
          const anim = fixTrackNames(walkFbx.animations[0]);
          anim.name = 'Walking';
          finalAnims.push(anim);
        }
        if (sitFbx.animations && sitFbx.animations.length > 0) {
          const anim = fixTrackNames(sitFbx.animations[0]);
          anim.name = 'Sitting';
          finalAnims.push(anim);
        }
      } else {
        // Dad character uses his embedded custom-rigged animations
        const dadAnims = gltf.animations || [];
        dadAnims.forEach((anim: THREE.AnimationClip) => {
          if (anim.name === 'Rig|Rig|man_idle' || anim.name === 't_pose') anim.name = 'Idle';
          else if (anim.name === 'Rig|Rig|man_walk_in_place') anim.name = 'Walking';
          else if (anim.name === 'Rig|Rig|man_sit_idle') anim.name = 'Sitting';
          else if (anim.name === 'talking') {
            anim.name = 'Talking_0';
            // Only keep facial/head tracks so he can talk while sitting
            anim.tracks = anim.tracks.filter(t =>
              !t.name.includes('Hips') && !t.name.includes('Spine') && !t.name.includes('Chest') &&
              !t.name.includes('Shoulder') && !t.name.includes('Arm') && !t.name.includes('hand') &&
              !t.name.includes('Leg') && !t.name.includes('Foot') && !t.name.includes('Toes') &&
              !t.name.includes('Thumb') && !t.name.includes('Index') && !t.name.includes('Middle') &&
              !t.name.includes('Ring') && !t.name.includes('Pinky') && !t.name.includes('Head') && !t.name.includes('Neck')
            );
          }
          finalAnims.push(anim);
        });

        // Fallback for Idle if man_idle wasn't found
        if (!finalAnims.find(a => a.name === 'Idle')) {
          const tpose = finalAnims.find(a => a.name === 't_pose');
          if (tpose) tpose.name = 'Idle';
        }
      }

      const char = gltf.scene;
      // Scale down and position avatar
      char.scale.set(0.45, 0.45, 0.45);
      char.position.set(-2, 0, -3); // Spawn point
      sceneRef.current?.add(char);
      avatarGroup.current = char;

      // Setup Mixer & Animations
      const mixer = new THREE.AnimationMixer(char);
      avatarMixer.current = mixer;

      finalAnims.forEach((clip) => {
        const action = mixer.clipAction(clip);
        if (type === 'dad') {
          if (clip.name === 'Talking_0' || clip.name === 'Idle' || clip.name === 'Sitting') {
            action.setLoop(THREE.LoopPingPong, Infinity);
          }
        }
        animationsMap.current[clip.name] = action;
      });
      animationsMap.current['Idle']?.play();

      // Find Head for Lipsync and Tracking
      char.traverse((node: any) => {
        if (node instanceof THREE.Mesh) {
          if (node.name.includes('Head')) headMeshRef.current = node;
          if (node.name.includes('Teeth')) teethMeshRef.current = node;
        }
        if (node.isBone && node.name.toLowerCase().includes('head')) {
          headBoneRef.current = node;
        }
      });

      setLoading(false);
      setConvState('GREETING');
      playAudio(type === 'wife' ? '/audio/wife_greeting.mp3' : '/audio/dad_greeting.mp3', () => {
        setConvState('PROMPT_WALK_SIT');
      });
    });
  };

  useEffect(() => {
    if (caveLoaded) {
      loadCharacter('wife');
    }
  }, [caveLoaded]);

  const playAudio = (url: string, onEnded?: () => void) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;

    if (!lipsyncRef.current) {
      lipsyncRef.current = new Lipsync();
    }

    lipsyncRef.current.connectAudio(audio);
    const ac = (lipsyncRef.current as any).audioContext;
    if (ac && ac.state === 'suspended') {
      ac.resume();
    }

    audio.play().catch(e => {
      if (e.name !== 'AbortError') console.warn("Audio play error", e);
    });

    if (onEnded) {
      audio.onended = onEnded;
    }
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

        {convState === 'PROMPT_WALK_SIT' && (
          <div style={{ position: 'absolute', bottom: '20%', left: '50%', transform: 'translate(-50%, 0)', background: 'rgba(0,0,0,0.8)', padding: '20px', color: 'white', borderRadius: '10px', pointerEvents: 'auto', textAlign: 'center' }}>
            <p>Would you like to hear the story while walking, or seated on a sofa?</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              <button onClick={() => {
                setConvState('WALKING_TO_SOFA');
                Object.values(animationsMap.current).forEach(anim => anim.stop());
                if (animationsMap.current['Walking']) {
                  animationsMap.current['Walking'].reset().fadeIn(0.5).play();
                } else if (animationsMap.current['Idle']) {
                  animationsMap.current['Idle'].reset().fadeIn(0.5).play();
                }
              }} style={{ padding: '10px 20px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Sit on Sofa</button>
              <button onClick={() => {
                setConvState('STORY_WALKING');
                Object.values(animationsMap.current).forEach(anim => anim.stop());
                if (animationsMap.current['Talking_0']) {
                  animationsMap.current['Talking_0'].reset().fadeIn(0.5).play();
                } else if (animationsMap.current['Idle']) {
                  animationsMap.current['Idle'].reset().fadeIn(0.5).play();
                }
                playAudio(selectedCharRef.current === 'wife' ? '/audio/wife_story.mp3' : '/audio/dad_story.mp3');
              }} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Take a Walk</button>
            </div>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px', color: 'white', borderRadius: '5px' }}>
          <strong>Controls</strong><br />
          Click anywhere to lock mouse<br />
          W A S D to walk<br />
          ESC to unlock
        </div>

      </div>
    </div>
  );
}
