"use client";

import { Environment, Float, Lightformer, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const R = 0.62;
const HALF = 0.78;

function Half({ dir, open }: { dir: 1 | -1; open: React.RefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = dir * (HALF / 2 + 0.035 + open.current * 0.95);
  });
  return (
    <group ref={ref} rotation={[dir === 1 ? 0 : Math.PI, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[R, R, HALF, 96, 1, true]} />
        <meshPhysicalMaterial color="#232c4f" metalness={0.9} roughness={0.27} clearcoat={1} clearcoatRoughness={0.18} envMapIntensity={1.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, HALF / 2, 0]}>
        <sphereGeometry args={[R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#232c4f" metalness={0.9} roughness={0.27} clearcoat={1} clearcoatRoughness={0.18} envMapIntensity={1.25} />
      </mesh>
      {/* machined collar where the halves meet */}
      <mesh position={[0, -HALF / 2 + 0.05, 0]}>
        <cylinderGeometry args={[R + 0.018, R + 0.018, 0.1, 96, 1, true]} />
        <meshPhysicalMaterial color="#c9d2ea" metalness={1} roughness={0.28} envMapIntensity={1.4} />
      </mesh>
    </group>
  );
}

function Capsule({ open, still }: { open: React.RefObject<number>; still: boolean }) {
  const body = useRef<THREE.Group>(null);
  const seam = useRef<THREE.MeshBasicMaterial>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const orbitA = useRef<THREE.Group>(null);
  const orbitB = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const o = open.current;
    if (body.current && !still) body.current.rotation.y += dt * 0.16;
    if (orbitA.current && !still) orbitA.current.rotation.z += dt * 0.22;
    if (orbitB.current && !still) orbitB.current.rotation.z -= dt * 0.13;
    const pulse = still ? 0.8 : 0.72 + Math.sin(t * 1.4) * 0.18;
    if (seam.current) seam.current.opacity = Math.min(1, pulse + o);
    if (core.current) core.current.scale.setScalar(0.3 + o * 1.5);
    if (light.current) light.current.intensity = 2.2 * pulse + o * 60;
  });

  return (
    <group rotation={[0.18, 0, 0.42]}>
      <group ref={body}>
        <Half dir={1} open={open} />
        <Half dir={-1} open={open} />
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R - 0.02, 0.02, 16, 128]} />
          <meshBasicMaterial ref={seam} color="#8aa6ff" transparent toneMapped={false} />
        </mesh>
        <mesh ref={core}>
          <sphereGeometry args={[0.36, 32, 32]} />
          <meshBasicMaterial color="#dfe6ff" toneMapped={false} />
        </mesh>
        <pointLight ref={light} color="#7f9bff" distance={7} decay={2} />
      </group>
      {/* the orbit from the logo, with its point of light */}
      <group rotation={[Math.PI / 2.25, 0.2, 0]}>
        <group ref={orbitA}>
          <mesh>
            <torusGeometry args={[1.62, 0.0045, 8, 220]} />
            <meshBasicMaterial color="#a8b0c4" transparent opacity={0.5} />
          </mesh>
          <mesh position={[1.62, 0, 0]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color="#8aa6ff" toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group rotation={[Math.PI / 1.7, -0.5, 0]}>
        <group ref={orbitB}>
          <mesh>
            <torusGeometry args={[2.05, 0.003, 8, 220]} />
            <meshBasicMaterial color="#9c86ff" transparent opacity={0.28} />
          </mesh>
          <mesh position={[-2.05, 0, 0]}>
            <sphereGeometry args={[0.022, 12, 12]} />
            <meshBasicMaterial color="#c2b6ff" toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * The capsule. `open` (0 → 1) parts the halves and lets the light out; it is
 * eased inside the render loop so callers can simply set a target.
 */
export default function CapsuleScene({ open = 0, still = false, particles = true }: { open?: number; still?: boolean; particles?: boolean }) {
  const target = useRef(open);
  target.current = open;
  const eased = useRef(open);
  const dpr = useMemo<[number, number]>(() => [1, 1.75], []);

  function Ease() {
    useFrame((_, dt) => {
      eased.current += (target.current - eased.current) * Math.min(1, dt * (still ? 60 : 1.6));
    });
    return null;
  }

  return (
    <Canvas dpr={dpr} camera={{ fov: 30, position: [0, 0, 8.4] }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} frameloop={still ? "demand" : "always"} aria-hidden="true">
      <Ease />
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} color="#dfe6ff" />
      <directionalLight position={[-6, -2, -4]} intensity={0.9} color="#6f5cff" />
      <Float speed={still ? 0 : 1.1} rotationIntensity={still ? 0 : 0.18} floatIntensity={still ? 0 : 0.7}>
        <Capsule open={eased} still={still} />
      </Float>
      {particles && !still && <Sparkles count={70} scale={[9, 6, 5]} size={1.6} speed={0.22} opacity={0.5} color="#b9c6ff" />}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={5} color="#ffffff" position={[0, 5, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#648bff" position={[-5, 0, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 1.2, 1]} />
        <Lightformer form="rect" intensity={2} color="#9c86ff" position={[5, -1, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 1, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#dfe6ff" position={[0, -4, -3]} scale={3} />
      </Environment>
    </Canvas>
  );
}
