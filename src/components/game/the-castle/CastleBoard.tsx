
"use client";

import React, { useCallback, useMemo, useRef } from 'react';
import type { Game, Player } from '@/types';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Box, Cylinder, Octahedron, Plane, Stars, Decal, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion-3d';

// --- 3D Models for Game Elements ---

function PlayerModel({ player, isTurn, color, targetPosition }: { player: Player, isTurn: boolean, color: string, targetPosition: {x: number, y: number, z: number} }) {
    const ref = useRef<THREE.Group>(null!);
    const [decalTexture] = useTexture([`/avatars/${player.avatarId}`]);

    useFrame((state, delta) => {
        // Floating animation
        if (ref.current) {
            ref.current.position.y = 0.6 + Math.sin(state.clock.elapsedTime * 2) * 0.1;

            // Smooth movement (lerp)
            const currentPos = new THREE.Vector3(ref.current.position.x, 0.5, ref.current.position.z);
            const targetPos = new THREE.Vector3(targetPosition.x, 0.5, targetPosition.z);
            currentPos.lerp(targetPos, delta * 10); // Adjust the multiplier for speed
            ref.current.position.x = currentPos.x;
            ref.current.position.z = currentPos.z;
        }
    });

    return (
        <group ref={ref} position={[targetPosition.x, 0.5, targetPosition.z]}>
            <Cylinder args={[0.4, 0.4, 1, 16]} castShadow>
                <meshStandardMaterial color={color} emissive={isTurn ? color : 'black'} emissiveIntensity={isTurn ? 2 : 0} />
                 {decalTexture && (
                    <Decal
                        position={[0, 0, 0.4]} // Position the decal on the front of the cylinder
                        rotation={[0, 0, 0]}
                        scale={0.8}
                        map={decalTexture}
                    />
                )}
            </Cylinder>
        </group>
    );
}

function WallModel() {
    return (
        <Box args={[0.9, 1, 0.9]} castShadow receiveShadow>
            <meshStandardMaterial color="#6b7280" roughness={0.7} metalness={0.2} />
        </Box>
    );
}

function TrapModel() {
    return (
        <Octahedron args={[0.3, 0]} position={[0, 0.1, 0]}>
            <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={1} wireframe />
        </Octahedron>
    );
}

function BombModel({ timer }: { timer: number }) {
    const ref = useRef<THREE.Mesh>(null!);
    useFrame((_state, delta) => {
        // Pulsating animation
        const scale = 1 + Math.sin(_state.clock.elapsedTime * 5) * 0.1;
        if(ref.current) {
            ref.current.scale.set(scale, scale, scale);
        }
    });

    return (
        <group>
            <mesh ref={ref} castShadow>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
            </mesh>
            <Text
                position={[0, 0.7, 0]}
                fontSize={0.4}
                color="white"
                anchorX="center"
                anchorY="middle"
            >
                {timer}
            </Text>
        </group>
    );
}


// --- Main Board Component ---

interface CastleBoardProps {
  game: Game;
  self: Player;
  onTileClick: (x: number, y: number) => void;
  buildMode: 'wall' | 'trap' | 'bomb' | 'long_range_wall' | null;
}

export function CastleBoard({ game, self, onTileClick, buildMode }: CastleBoardProps) {
  const { settings, playersState, walls, turn, traps, bombs } = game.theCastleState!;
  const { width, height } = settings.mapSize;
  const isMyTurn = self.id === turn;
  
  const getPlayerAt = useCallback((x: number, y: number) => {
    for (const player of game.players) {
      const playerState = playersState[player.id];
      if (playerState && playerState.position.x === x && playerState.position.y === y) {
        return player as (Player & { team: 'red' | 'blue' });
      }
    }
    return null;
  }, [game.players, playersState]);

  const isWallAt = useCallback((x: number, y: number) => walls?.some(wall => wall.x === x && wall.y === y), [walls]);
  const isTrapAt = useCallback((x: number, y: number) => traps?.some(trap => trap.position.x === x && trap.position.y === y), [traps]);
  const selfState = playersState[self.id];

  const getPossibleMoves = useCallback(() => {
    if (!isMyTurn || buildMode || !selfState || selfState.movesLeft <= 0) return new Set<string>();
    const possible = new Set<string>();
    const queue: [{ pos: { x: number; y: number }; dist: number }] = [{ pos: selfState.position, dist: 0 }];
    const visited = new Set<string>([`${selfState.position.x},${selfState.position.y}`]);
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.dist < selfState.movesLeft) {
            const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
            for (const dir of directions) {
                const newX = current.pos.x + dir.dx;
                const newY = current.pos.y + dir.dy;
                const newKey = `${newX},${newY}`;
                if (newX >= 0 && newX < width && newY >= 0 && newY < height && !visited.has(newKey) && !isWallAt(newX, newY) && !getPlayerAt(newX, newY)) {
                    visited.add(newKey);
                    possible.add(newKey);
                    queue.push({ pos: { x: newX, y: newY }, dist: current.dist + 1 });
                }
            }
        }
    }
    return possible;
  }, [width, height, isMyTurn, isWallAt, getPlayerAt, buildMode, selfState]);

  const getPossibleBuilds = useCallback((isLongRange: boolean) => {
       if (!isMyTurn || !buildMode) return new Set<string>();
       const builds = new Set<string>();
       if (isLongRange) {
           for (let y = 0; y < height; y++) {
               for (let x = 0; x < width; x++) {
                   if (!isWallAt(x, y) && !getPlayerAt(x, y)) builds.add(`${x},${y}`);
               }
           }
           return builds;
       }
       if (!selfState) return builds;
       const pos = selfState.position;
       const directions = [{dx:0, dy:1}, {dx:0, dy:-1}, {dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:0}]; 
       for(const dir of directions) {
            const newX = pos.x + dir.dx;
            const newY = pos.y + dir.dy;
            if (newX >= 0 && newX < width && newY >= 0 && newY < height && !isWallAt(newX, newY) && !getPlayerAt(newX, newY) && !(buildMode === 'trap' && isTrapAt(newX, newY))) builds.add(`${newX},${newY}`);
       }
       return builds;
  }, [isMyTurn, buildMode, width, height, isWallAt, isTrapAt, getPlayerAt, selfState]);

  const possibleMoves = useMemo(() => getPossibleMoves(), [getPossibleMoves]);
  const possibleBuilds = useMemo(() => getPossibleBuilds(buildMode === 'long_range_wall'), [getPossibleBuilds, buildMode]);

  return (
    <div className="w-full h-[85vh] rounded-lg bg-gray-900 border border-primary/20">
      <Canvas shadows camera={{ position: [width / 2, 15, height], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 20, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight
            position={[-10, 15, -10]}
            intensity={0.8}
            color="#6d28d9"
        />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <group position={[-width / 2 + 0.5, 0, -height / 2 + 0.5]}>
          {/* Ground Plane */}
          <Plane args={[width, height]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#1f2937" />
          </Plane>

          {/* Tiles */}
          {Array.from({ length: width * height }).map((_, i) => {
            const x = i % width;
            const y = Math.floor(i / height);
            const tileKey = `${x},${y}`;
            
            const isBlueBase = x === 0;
            const isRedBase = x === width - 1;
            const isPossibleMove = possibleMoves.has(tileKey);
            const isPossibleBuild = possibleBuilds.has(tileKey);
            const isClickable = isMyTurn && (isPossibleMove || isPossibleBuild);
            
            return (
              <mesh
                key={tileKey}
                position={[x, 0.01, y]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={() => isClickable && onTileClick(x, y)}
              >
                <planeGeometry args={[1, 1]} />
                <meshStandardMaterial
                  color={
                    isPossibleMove ? '#22c55e' :
                    isPossibleBuild ? '#eab308' :
                    isBlueBase ? '#1e3a8a' :
                    isRedBase ? '#991b1b' :
                    '#374151'
                  }
                  opacity={isPossibleMove || isPossibleBuild ? 0.7 : 0.4}
                  transparent
                />
              </mesh>
            );
          })}
          
            {/* Boundary Walls */}
            {Array.from({ length: width }).map((_, i) => (
                <React.Fragment key={`wall_top_${i}`}>
                    <Box args={[1, 2, 1]} position={[i, 1, -1]}><meshStandardMaterial color="#4b5563" /></Box>
                    <Box args={[1, 2, 1]} position={[i, 1, height]}><meshStandardMaterial color="#4b5563" /></Box>
                </React.Fragment>
            ))}
            {Array.from({ length: height + 2 }).map((_, i) => (
                 <React.Fragment key={`wall_side_${i}`}>
                    <Box args={[1, 2, 1]} position={[-1, 1, i - 1]}><meshStandardMaterial color="#4b5563" /></Box>
                    <Box args={[1, 2, 1]} position={[width, 1, i - 1]}><meshStandardMaterial color="#4b5563" /></Box>
                 </React.Fragment>
            ))}


          {/* Game Elements */}
          {game.players.map(p => {
              const state = playersState[p.id];
              if (!state) return null;
              const playerColor = p.team === 'blue' ? '#3b82f6' : '#ef4444';
              return (
                  <PlayerModel
                    key={p.id}
                    player={p}
                    isTurn={p.id === turn}
                    color={playerColor}
                    targetPosition={{ x: state.position.x, y: 0.5, z: state.position.y }}
                  />
              );
          })}

          {walls?.map((wall, i) => (
            <motion.group 
              key={`wall-${i}`} 
              position={[wall.x, 0.5, wall.y]}
              initial={{ scale: 0.5, y: -0.5 }}
              animate={{ scale: 1, y: 0.5 }}
              transition={{ type: 'spring' }}
            >
              <WallModel />
            </motion.group>
          ))}
          
          {traps?.map((trap, i) => {
            const isOwner = trap.ownerId === self.id;
            return (
              <group key={`trap-${i}`} position={[trap.position.x, 0, trap.position.y]}>
                {isOwner && <TrapModel />}
              </group>
            )
          })}

          {bombs?.map((bomb, i) => (
             <group key={`bomb-${i}`} position={[bomb.position.x, 0.5, bomb.position.y]}>
                <BombModel timer={bomb.timer} />
             </group>
          ))}
        </group>

        <OrbitControls enablePan={true} enableZoom={true} minDistance={10} maxDistance={30} />
      </Canvas>
    </div>
  );
}
