import { TableBounds } from '../types';

export const TABLE_BOUNDS: TableBounds = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  netHeight: 0.1525,
  netWidth: 1.83,
  halfLength: 1.37,
  halfWidth: 0.7625,
  tableTopY: 0.76
};

export const PHYSICS_CONSTANTS = {
  // Gravity (m/s^2)
  GRAVITY: 9.81,

  // Ball properties
  BALL_RADIUS: 0.02, // 20mm radius
  BALL_MASS: 0.0027, // 2.7g

  // Aerodynamics
  AIR_DRAG: 0.12,
  MAGNUS_LIFT: 0.0007,
  MAGNUS_SPIN_DECAY: 0.985,

  // Collisions
  TABLE_RESTITUTION_Y: 0.88,
  TABLE_FRICTION_XZ: 0.82,
  NET_RESTITUTION: 0.22,
  FLOOR_RESTITUTION_Y: 0.65,

  // Substepping
  FIXED_TIMESTEP: 1 / 120, // 120 Hz
  MAX_SUB_STEPS: 8,

  // Table bounds check
  PLAYER_Z_MIN: 0.0,
  PLAYER_Z_MAX: 1.37,
  CPU_Z_MIN: -1.37,
  CPU_Z_MAX: 0.0,
  TABLE_X_MIN: -0.7625,
  TABLE_X_MAX: 0.7625
};

export const PADDLE_SPECS = {
  HEAD_RADIUS: 0.085, // 17cm blade diameter
  THICKNESS: 0.018,
  HANDLE_LENGTH: 0.1,
  
  // Gameplay reach & baseline positions
  PLAYER_DEFAULT_POS: { x: 0, y: 0.88, z: 1.95 },
  CPU_DEFAULT_POS: { x: 0, y: 0.88, z: -1.95 },
  
  // Assisted movement bounds
  MAX_REACH_X: 1.15,
  MIN_Y: 0.72,
  MAX_Y: 1.35
};
