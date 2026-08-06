// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Lipsync } from 'wawa-lipsync';

export default function TestAvatarScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");

  const lipsyncRef = useRef<Lipsync | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const headMeshRef = useRef<THREE.Mesh | null>(null);
  const teethMeshRef = useRef<THREE.Mesh | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentActionRef = useRef<string>('Idle');

  useEffect(() => {
    let mounted = true;
    let reqId: number;

    if (!containerRef.current) return;

    // 1. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 3); // Look at face

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Nuke any existing canvases just in case Strict Mode or HMR left them
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
    
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // 3. Loaders
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    let avatar: THREE.Group | null = null;

    setStatus("Loading Avatar...");
    loader.load('/models/guide_new.glb', (gltf) => {
      if (!mounted) return;
      avatar = gltf.scene;
      
      // Fix materials and find head
      avatar.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false; // Fix disappearance bug
          if (mesh.name === 'Wolf3D_Head' || mesh.name === 'Wolf3D_Avatar') headMeshRef.current = mesh;
          if (mesh.name === 'Wolf3D_Teeth') teethMeshRef.current = mesh;
        }
      });

      scene.add(avatar);

      setStatus("Loading Animations...");
      loader.load('/models/animations.glb', (animGltf) => {
        if (!mounted) return;
        const mixer = new THREE.AnimationMixer(avatar!);
        mixerRef.current = mixer;

        const actionMap: Record<string, THREE.AnimationAction> = {};
        animGltf.animations.forEach((clip) => {
          actionMap[clip.name] = mixer.clipAction(clip);
        });
        
        // Load walking animation
        loader.load('/models/walking.glb', (walkGltf) => {
          if (!mounted) return;
          walkGltf.animations.forEach((clip) => {
            // Strip mixamorig and Armature prefixes from track names
            clip.tracks.forEach(track => {
              track.name = track.name.replace(/mixamorig:?/g, '');
              track.name = track.name.replace(/Armature\|/g, '');
            });
            
            // Remove ALL position tracks (including Hips) to prevent scaling mismatches and stretching
            // Also remove Hips.quaternion to prevent the 90-degree face-plant issue from FBX to GLB conversions
            clip.tracks = clip.tracks.filter(track => !track.name.endsWith('.position') && !track.name.includes('Hips.quaternion'));
            
            // You can rename the clip to 'Walking' if it isn't already
            clip.name = 'Walking';
            actionMap['Walking'] = mixer.clipAction(clip);
          });
          
          actionsRef.current = actionMap;

          if (actionMap['Idle']) {
            actionMap['Idle'].play();
          }

          setLoading(false);
          setStatus("Ready! Click buttons below to test.");
        });
      });
    });

    // 4. Render Loop
    const clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (!mounted) return;
      
      const delta = clock.getDelta();

      if (mixerRef.current) mixerRef.current.update(delta);

      // Lip-sync logic
      const head = headMeshRef.current;
      const teeth = teethMeshRef.current;
      const lipsync = lipsyncRef.current;
      const audio = audioRef.current;

      if (head && head.morphTargetDictionary && head.morphTargetInfluences && lipsync && audio) {
        const isPlaying = !audio.paused && !audio.ended;

        const visemes = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR', 'viseme_sil'];

        // Reset all towards 0
        visemes.forEach(v => {
          const headIdx = head.morphTargetDictionary![v];
          if (headIdx !== undefined) head.morphTargetInfluences![headIdx] = THREE.MathUtils.lerp(head.morphTargetInfluences![headIdx], 0, 15 * delta);
          
          if (teeth && teeth.morphTargetDictionary && teeth.morphTargetInfluences) {
            const teethIdx = teeth.morphTargetDictionary[v];
            if (teethIdx !== undefined) teeth.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teeth.morphTargetInfluences[teethIdx], 0, 15 * delta);
          }
        });

        // Set active viseme towards 1
        if (isPlaying) {
          lipsync.processAudio();
          let viseme = lipsync.viseme;
          
          // DIAGNOSTIC FALLBACK: If wawa-lipsync is always returning sil (silent) 
          // because of browser Audio routing issues, let's force the mouth to move
          // physically over time just to prove the morph targets work!
          if (viseme === 'viseme_sil') {
             const time = performance.now() / 100;
             const bounce = Math.abs(Math.sin(time));
             if (bounce > 0.5) viseme = 'viseme_O' as any;
             else if (bounce > 0.2) viseme = 'viseme_aa' as any;
          }
          
          const headIdx = head.morphTargetDictionary[viseme];
          if (headIdx !== undefined) head.morphTargetInfluences[headIdx] = THREE.MathUtils.lerp(head.morphTargetInfluences[headIdx], 1, 15 * delta);
          
          if (teeth && teeth.morphTargetDictionary && teeth.morphTargetInfluences) {
            const teethIdx = teeth.morphTargetDictionary[viseme];
            if (teethIdx !== undefined) teeth.morphTargetInfluences[teethIdx] = THREE.MathUtils.lerp(teeth.morphTargetInfluences[teethIdx], 1, 15 * delta);
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mounted = false;
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const playAudio = (url: string) => {
    if (audioRef.current && !audioRef.current.paused) {
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
      if (e.name !== 'AbortError') console.error("Audio play error:", e);
    });

    // Switch to talking animation
    console.log("Playing audio and switching to Talking_0");
    playAnimation('Talking_0');
  };

  const playAnimation = (name: string) => {
    const actionMap = actionsRef.current;
    const current = currentActionRef.current;
    
    if (current !== name && actionMap[name]) {
      console.log(`Transitioning animation from ${current} to ${name}`);
      if (actionMap[current]) actionMap[current].fadeOut(0.5);
      actionMap[name].reset().fadeIn(0.5).play();
      currentActionRef.current = name;
    } else {
      console.log(`Failed to play ${name}: action map has keys`, Object.keys(actionMap));
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* UI Overlay */}
      <div style={{
        position: 'absolute', top: 20, left: 20, padding: 20, 
        background: 'rgba(0,0,0,0.8)', color: 'white', borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 10
      }}>
        <h3>Avatar Sandbox Test</h3>
        <p>Status: {status}</p>
        
        {!loading && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 300 }}>
              
              <hr style={{ width: '100%', borderColor: '#444', margin: '10px 0' }} />
              
              <button onClick={() => playAnimation('Idle')} style={btnStyle}>Anim: Idle</button>
              <button onClick={() => playAnimation('Talking_0')} style={btnStyle}>Anim: Talking_0</button>
              <button onClick={() => playAnimation('Talking_1')} style={btnStyle}>Anim: Talking_1</button>
              <button onClick={() => playAnimation('Talking_2')} style={btnStyle}>Anim: Talking_2</button>
              <button onClick={() => playAnimation('Rumba')} style={btnStyle}>Anim: Rumba</button>
              <button onClick={() => playAnimation('Walking')} style={btnStyle}>Anim: Walking</button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: 400, marginTop: '20px' }}>
              <button onClick={() => playAudio('/audio/greeting.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Play Greeting
              </button>
              <button onClick={() => playAudio('/audio/response_0.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Response 0
              </button>
              <button onClick={() => playAudio('/audio/response_1.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Response 1
              </button>
              <button onClick={() => playAudio('/audio/response_2.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Response 2
              </button>
              <button onClick={() => playAudio('/audio/response_3.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Response 3
              </button>
              <button onClick={() => playAudio('/audio/no_niche_found.mp3')} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                No Niche Audio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '8px 12px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '14px'
};
