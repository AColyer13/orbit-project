const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');
const speedEl = document.getElementById('speed');
const altEl = document.getElementById('altitude');
const timeScaleInput = document.getElementById('timeScale');
const timeScaleVal = document.getElementById('timeScaleVal');

const G = 6.67430e-11;
const earthMass = 5.972e24;
const earthRadius = 6.371e6;
const g0 = 9.80665;
let metersPerPixel = 3e4;
const center = { x: canvas.width / 2, y: canvas.height / 2 };
let currentAltKm = 400;
let gameMode = 'real'; // 'real' or 'easy'

let state = {
  pos: { x: earthRadius + 400e3, y: 0 },
  vel: { x: 0, y: 0 },
};

let thrust = { x: 0, y: 0 };
let thrustAccel = 0.5; // Will be adjusted per satellite
let timeScale = 1;
let projectionPoints = [];
let keysHeld = new Set();
let projectionCooldown = 0;
let isRunning = true;
let missionElapsedSeconds = 0;
let frameCount = 0;
let burnHistory = [];
let activeBurnIndicator = null;
let activeRCSIndicator = null; // New: for arrow key thrust
let hasCrashed = false;
let electricThrusterPower = 1.0;
let batteryCapacityWh = 100;
let isInSunlight = true;
let adaptiveTimeScale = false;

// AI AUTOPILOT SYSTEM
let autopilot = null;
if (typeof OrbitalAutopilot !== 'undefined') {
  autopilot = new OrbitalAutopilot();
}

// NOTE: Sunlight/eclipse is based ONLY on orbital position
// Sun is FIXED at +X direction (infinite distance)
// Battery charges when satellite is NOT in Earth's shadow

// Sun position rotates based on mission elapsed time (Earth's rotation)
// 1 Earth rotation = 86400 seconds (simulated)
let sunAngle = 0; // Angle of sun in radians (0 = +X direction)

// Real-time clock system (starts at 12:00 noon)
let missionTimeOfDay = 12 * 3600; // Start at 12:00 (noon) in seconds
const SECONDS_PER_DAY = 86400;

// Propulsion presets indexed by altitude - matching detailed spec
const propulsionPresets = {
  400: {
    name: 'LEO 400 km',
    dryMass: 200,
    thrustAccel: 0.085,
    propellant: { hydrazine: 60, xenon: 5, biprop: 0 }, // LEO: Hydrazine for RCS + small xenon for station-keeping
    propellantRemaining: { hydrazine: 60, xenon: 5, biprop: 0 },
    tankCapacity: { hydrazine: 96, xenon: 10, biprop: 0 },
    solarArrayPower: 0.5, // kW
    batteryCapacityWh: 100,
    electricThrusterPower: 0.04,
    thrusters: [
      { type: 'chemical_monoprop', Isp: 235, thrust: 22.0, annualDeltaV: 120 },
      { type: 'hall_thruster', Isp: 1700, thrust: 0.04, hoursPerWeek: 3, powerKW: 0.04 }
    ]
  },
  550: {
    name: 'SSO 550 km',
    dryMass: 250,
    thrustAccel: 0.071,
    propellant: { hydrazine: 40, xenon: 6, biprop: 0 }, // SSO: Moderate hydrazine, more xenon for precise orbit control
    propellantRemaining: { hydrazine: 40, xenon: 6, biprop: 0 },
    tankCapacity: { hydrazine: 96, xenon: 12, biprop: 0 },
    solarArrayPower: 0.6,
    batteryCapacityWh: 120,
    electricThrusterPower: 0.06,
    thrusters: [
      { type: 'chemical_monoprop', Isp: 235, thrust: 22.0, annualDeltaV: 80 },
      { type: 'hall_thruster', Isp: 1700, thrust: 0.06, hoursPerWeek: 3, powerKW: 0.06 }
    ]
  },
  1200: {
    name: 'LEO 1200 km',
    dryMass: 300,
    thrustAccel: 0.071,
    propellant: { hydrazine: 12, xenon: 0, biprop: 0 }, // High LEO: Minimal drag, only hydrazine for emergencies
    propellantRemaining: { hydrazine: 12, xenon: 0, biprop: 0 },
    tankCapacity: { hydrazine: 40, xenon: 0, biprop: 0 },
    solarArrayPower: 0, // No electric thrusters
    batteryCapacityWh: 0,
    electricThrusterPower: 0,
    thrusters: [
      { type: 'chemical_monoprop', Isp: 235, thrust: 22.0, annualDeltaV: 20 }
    ]
  },
  20200: {
    name: 'MEO 20,200 km',
    dryMass: 1500,
    thrustAccel: 0.014,
    propellant: { hydrazine: 30, xenon: 18, biprop: 0 }, // GPS: More xenon for long mission (10-15 years)
    propellantRemaining: { hydrazine: 30, xenon: 18, biprop: 0 },
    tankCapacity: { hydrazine: 80, xenon: 35, biprop: 0 },
    solarArrayPower: 1.5,
    batteryCapacityWh: 300,
    electricThrusterPower: 0.08,
    thrusters: [
      { type: 'ion_thruster', Isp: 3000, thrust: 0.08, hoursPerYear: 100, powerKW: 0.08 },
      { type: 'chemical_monoprop', Isp: 235, thrust: 22.0, contingencyDeltaV: 20 }
    ]
  },
  35786: {
    name: 'GEO 35,786 km',
    dryMass: 4000,
    thrustAccel: 0.083,
    propellant: { hydrazine: 0, xenon: 100, biprop: 800 }, // GEO: Massive xenon (15-year mission), biprop for orbit insertion
    propellantRemaining: { hydrazine: 0, xenon: 100, biprop: 800 },
    tankCapacity: { hydrazine: 0, xenon: 180, biprop: 1200 },
    solarArrayPower: 5.0,
    batteryCapacityWh: 1000,
    electricThrusterPower: 0.15,
    thrusters: [
      { type: 'hall_thruster', Isp: 1800, thrust: 0.15, hoursPerWeek: 4, powerKW: 0.15 },
      { type: 'biprop_MMHMHN', Isp: 320, thrust: 400.0, annualDeltaV: 50 }
    ]
  },
  42000: {
    name: 'HEO 42,000 km (Molniya)',
    dryMass: 1800,
    thrustAccel: 0.052,
    propellant: { hydrazine: 0, xenon: 30, biprop: 120 }, // Molniya: Biprop for apogee adjustments, xenon for fine-tuning
    propellantRemaining: { hydrazine: 0, xenon: 30, biprop: 120 },
    tankCapacity: { hydrazine: 0, xenon: 60, biprop: 350 },
    solarArrayPower: 2.0,
    batteryCapacityWh: 400,
    electricThrusterPower: 0.05,
    perigeeAltKm: 1000,
    apogeeAltKm: 42000,
    eccentricity: 0.72,
    thrusters: [
      { type: 'biprop_MMHMHN', Isp: 320, thrust: 100.0, annualDeltaV: 30 },
      { type: 'ion_thruster', Isp: 3000, thrust: 0.05, hoursPerQuarter: 20, powerKW: 0.05 }
    ]
  }
};

// Orbit constraints for each preset
const orbitConstraints = {
  400: {
    name: "LEO_400km",
    targetAlt: 400,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 400000)), // Calculated, not hardcoded
    altitude_km: { warning: 5, violation: 15, critical: 30 },
    velocity_ms: { warning: 20, violation: 50, critical: 100 },
    inclination_deg: { warning: 0.05, violation: 0.10, critical: 0.20 },
    eccentricity: { warning: 0.0005, violation: 0.002, critical: 0.005 } // ISS: e ≈ 0.0001
  },
  550: {
    name: "SSO_550km",
    targetAlt: 550,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 550000)),
    altitude_km: { warning: 5, violation: 10, critical: 20 }, // SSO imaging sats: ±5 km typical
    velocity_ms: { warning: 20, violation: 40, critical: 80 }, // Tight for sun-sync orbit maintenance
    inclination_deg: { warning: 0.01, violation: 0.05, critical: 0.10 }, // Sun-sync requires precise inclination
    eccentricity: { warning: 0.0005, violation: 0.001, critical: 0.003 } // Imaging requires circular
  },
  1200: {
    name: "LEO_1200km",
    targetAlt: 1200,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 1200000)),
    altitude_km: { warning: 15, violation: 40, critical: 80 }, // Low-drag regime, more tolerance
    velocity_ms: { warning: 50, violation: 100, critical: 200 }, // Limited fuel, loose tolerance
    inclination_deg: { warning: 0.05, violation: 0.10, critical: 0.20 },
    eccentricity: { warning: 0.001, violation: 0.005, critical: 0.010 } // Can tolerate more eccentricity
  },
  20200: {
    name: "MEO_20200km",
    targetAlt: 20200,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 20200000)),
    semiMajorAxis_km: { warning: 3, violation: 8, critical: 15 }, // GPS sats: ±2-3 km typical
    velocity_ms: { warning: 15, violation: 30, critical: 60 }, // Tight velocity for constellation
    inclination_deg: { warning: 0.02, violation: 0.05, critical: 0.10 },
    eccentricity: { warning: 0.002, violation: 0.005, critical: 0.010 } // GPS: e ≈ 0.00 (circular)
  },
  35786: {
    name: "GEO_35786km",
    targetAlt: 35786,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 35786000)),
    altitude_km: { warning: 15, violation: 35, critical: 75 }, // GEO station-keeping: ±35 km box
    velocity_ms: { warning: 10, violation: 20, critical: 40 }, // Extremely tight velocity control
    inclination_deg: { warning: 0.05, violation: 0.10, critical: 0.20 },
    eccentricity: { warning: 0.0002, violation: 0.0005, critical: 0.001 } // GEO: e < 0.0002 (nearly perfect circle)
  },
  42000: {
    name: "HEO_42000km_Molniya",
    targetAlt: 42000, // Apogee altitude
    perigeeAlt: 1000, // Perigee altitude (very low!)
    targetEccentricity: 0.72, // Highly elliptical
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 42000000)), // At apogee
    altitude_km: { warning: 2000, violation: 4000, critical: 8000 }, // VERY relaxed - orbit ranges from 1000km to 42000km!
    velocity_ms: { warning: 1000, violation: 2000, critical: 4000 }, // Velocity varies from ~1600 m/s (apogee) to ~10000 m/s (perigee)
    inclination_deg: { warning: 1.0, violation: 2.0, critical: 5.0 }, // Molniya: 63.4° inclination, but relaxed for sandbox
    eccentricity: { warning: 0.05, violation: 0.10, critical: 0.20 } // e should be ~0.72, but allow some deviation
  }
};

// Easy mode constraints (relaxed)
const easyConstraints = {
  400: {
    name: "LEO_400km",
    targetAlt: 400,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 400000)),
    altitude_km: { warning: 30, violation: 75, critical: 150 },
    velocity_ms: { warning: 100, violation: 200, critical: 400 },
    inclination_deg: { warning: 0.2, violation: 0.5, critical: 1.0 },
    eccentricity: { warning: 0.005, violation: 0.015, critical: 0.030 }
  },
  550: {
    name: "SSO_550km",
    targetAlt: 550,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 550000)),
    altitude_km: { warning: 30, violation: 60, critical: 120 },
    velocity_ms: { warning: 100, violation: 200, critical: 400 },
    inclination_deg: { warning: 0.1, violation: 0.3, critical: 0.6 },
    eccentricity: { warning: 0.005, violation: 0.015, critical: 0.030 }
  },
  1200: {
    name: "LEO_1200km",
    targetAlt: 1200,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 1200000)),
    altitude_km: { warning: 50, violation: 150, critical: 300 },
    velocity_ms: { warning: 200, violation: 500, critical: 1000 },
    inclination_deg: { warning: 0.2, violation: 0.5, critical: 1.0 },
    eccentricity: { warning: 0.01, violation: 0.03, critical: 0.060 }
  },
  20200: {
    name: "MEO_20200km",
    targetAlt: 20200,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 20200000)),
    semiMajorAxis_km: { warning: 20, violation: 50, critical: 100 },
    velocity_ms: { warning: 100, violation: 200, critical: 400 },
    inclination_deg: { warning: 0.1, violation: 0.3, critical: 0.6 },
    eccentricity: { warning: 0.01, violation: 0.03, critical: 0.060 }
  },
  35786: {
    name: "GEO_35786km",
    targetAlt: 35786,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 35786000)),
    altitude_km: { warning: 100, violation: 250, critical: 500 },
    velocity_ms: { warning: 50, violation: 100, critical: 200 },
    inclination_deg: { warning: 0.2, violation: 0.5, critical: 1.0 },
    eccentricity: { warning: 0.002, violation: 0.005, critical: 0.010 }
  },
  42000: {
    name: "HEO_42000km_Molniya",
    targetAlt: 42000,
    perigeeAlt: 1000,
    targetEccentricity: 0.72,
    targetVelocity: Math.sqrt(G * earthMass / (earthRadius + 42000000)),
    altitude_km: { warning: 5000, violation: 10000, critical: 20000 }, // Extremely relaxed for easy mode
    velocity_ms: { warning: 2000, violation: 4000, critical: 8000 }, // Very relaxed velocity checks
    inclination_deg: { warning: 2.0, violation: 5.0, critical: 10.0 },
    eccentricity: { warning: 0.15, violation: 0.30, critical: 0.50 } // Very relaxed eccentricity
  }
};

let currentPreset = propulsionPresets[400];
let currentConstraints = orbitConstraints[400];

function circularSpeed(radius) {
  return Math.sqrt(G * earthMass / radius);
}

function updateTimeScaleFromSlider() {
  const sliderValue = Number(timeScaleInput.value);
  
  // Logarithmic mapping: 0-100 slider -> 1x to 10,000x
  // Split into ranges for smoother control
  if (sliderValue <= 25) {
    // 0-25: 1x to 10x (linear for fine control at low speeds)
    timeScale = 1 + (sliderValue / 25) * 9;
  } else if (sliderValue <= 50) {
    // 25-50: 10x to 100x
    const t = (sliderValue - 25) / 25;
    timeScale = 10 * Math.pow(10, t);
  } else if (sliderValue <= 75) {
    // 50-75: 100x to 1,000x
    const t = (sliderValue - 50) / 25;
    timeScale = 100 * Math.pow(10, t);
  } else {
    // 75-100: 1,000x to 10,000x
    const t = (sliderValue - 75) / 25;
    timeScale = 1000 * Math.pow(10, t);
  }
  
  // Format display based on magnitude
  if (timeScale < 100) {
    timeScaleVal.textContent = `${timeScale.toFixed(1)}x`;
  } else if (timeScale < 1000) {
    timeScaleVal.textContent = `${Math.round(timeScale)}x`;
  } else {
    timeScaleVal.textContent = `${(timeScale / 1000).toFixed(1)}kx`;
  }
}

// Initialize time scale on page load
updateTimeScaleFromSlider();

function setOrbit(altKm) {
  currentAltKm = altKm;
  currentPreset = propulsionPresets[altKm] || propulsionPresets[400];
  
  // Select constraints based on game mode
  const constraintSet = gameMode === 'real' ? orbitConstraints : easyConstraints;
  currentConstraints = constraintSet[altKm] || constraintSet[400];
  
  // Set thrust acceleration based on satellite
  thrustAccel = currentPreset.thrustAccel;
  
  // Deep copy propellant to avoid reference issues
  currentPreset.propellantRemaining = { 
    hydrazine: currentPreset.propellant.hydrazine,
    xenon: currentPreset.propellant.xenon,
    biprop: currentPreset.propellant.biprop
  };
  
  // Reset electric thruster power to full and battery capacity
  electricThrusterPower = 1.0;
  batteryCapacityWh = currentPreset.batteryCapacityWh || 100;
  
  // Initialize orbit based on type
  if (altKm === 42000 && currentPreset.eccentricity) {
    // HEO Molniya orbit - highly elliptical
    // Start at apogee (42,000 km)
    const rApogee = earthRadius + currentPreset.apogeeAltKm * 1000;
    const rPerigee = earthRadius + currentPreset.perigeeAltKm * 1000;
    
    // Semi-major axis: a = (r_apogee + r_perigee) / 2
    const semiMajorAxis = (rApogee + rPerigee) / 2;
    
    // Velocity at apogee: v_a = sqrt(GM * (2/r_a - 1/a))
    const vApogee = Math.sqrt(G * earthMass * (2 / rApogee - 1 / semiMajorAxis));
    
    state.pos = { x: rApogee, y: 0 };
    state.vel = { x: 0, y: vApogee }; // Velocity perpendicular at apogee
    
    console.log(`HEO Molniya orbit initialized: e=${currentPreset.eccentricity}, apogee=${currentPreset.apogeeAltKm}km, perigee=${currentPreset.perigeeAltKm}km, v_apogee=${vApogee.toFixed(1)}m/s`);
  } else {
    // Circular orbit for all other altitudes
    const r = earthRadius + altKm * 1000;
    state.pos = { x: r, y: 0 };
    state.vel = { x: 0, y: circularSpeed(r) };
  }
  
  thrust.x = thrust.y = 0;
  projectionPoints = [];
  missionElapsedSeconds = 0;
  burnHistory = [];
  hasCrashed = false;
  updateBurnLog();
  updateProjection();
  createThrusterButtons();
}

setOrbit(400);

function applyThrust(dir) {
  if (dir === 'up') thrust.y = -thrustAccel;
  if (dir === 'down') thrust.y = thrustAccel;
  if (dir === 'left') thrust.x = -thrustAccel;
  if (dir === 'right') thrust.x = thrustAccel;
  setTimeout(() => { thrust.x = 0; thrust.y = 0; }, 200);
  updateProjection();
}

function getCurrentMass() {
  return currentPreset.dryMass + 
    currentPreset.propellantRemaining.hydrazine + 
    currentPreset.propellantRemaining.xenon +
    currentPreset.propellantRemaining.biprop;
}

function updateThrustFromKeys() {
  if (hasCrashed) return; // Can't thrust if crashed
  
  thrust.x = 0; thrust.y = 0;
  let thrustActive = false;
  
  // Handle individual and diagonal directions
  if (keysHeld.has('upleft')) { 
    thrust.x -= thrustAccel * 0.707; 
    thrust.y -= thrustAccel * 0.707; 
    thrustActive = true; 
  } else if (keysHeld.has('upright')) { 
    thrust.x += thrustAccel * 0.707; 
    thrust.y -= thrustAccel * 0.707; 
    thrustActive = true; 
  } else if (keysHeld.has('downleft')) { 
    thrust.x -= thrustAccel * 0.707; 
    thrust.y += thrustAccel * 0.707; 
    thrustActive = true; 
  } else if (keysHeld.has('downright')) { 
    thrust.x += thrustAccel * 0.707; 
    thrust.y += thrustAccel * 0.707; 
    thrustActive = true; 
  } else {
    // Single directions or keyboard combinations
    if (keysHeld.has('up')) { thrust.y -= thrustAccel; thrustActive = true; }
    if (keysHeld.has('down')) { thrust.y += thrustAccel; thrustActive = true; }
    if (keysHeld.has('left')) { thrust.x -= thrustAccel; thrustActive = true; }
    if (keysHeld.has('right')) { thrust.x += thrustAccel; thrustActive = true; }
  }
  
  // Show RCS indicator when thrust is active
  if (thrustActive && !activeRCSIndicator) {
    showRCSIndicator();
  } else if (!thrustActive && activeRCSIndicator) {
    activeRCSIndicator = null; // Clear when released
  }
  
  updateProjection();
}

window.addEventListener('keydown', e => {
  const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
  if (keyMap[e.key]) { keysHeld.add(keyMap[e.key]); updateThrustFromKeys(); }
});
window.addEventListener('keyup', e => {
  const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
  if (keyMap[e.key]) { keysHeld.delete(keyMap[e.key]); updateThrustFromKeys(); }
});

document.querySelectorAll('[data-thrust]').forEach(btn => {
  const dir = btn.dataset.thrust;
  btn.addEventListener('pointerdown', () => { keysHeld.add(dir); updateThrustFromKeys(); });
  btn.addEventListener('pointerup', () => { keysHeld.delete(dir); updateThrustFromKeys(); });
  btn.addEventListener('pointerleave', () => { keysHeld.delete(dir); updateThrustFromKeys(); });
});

document.querySelectorAll('#alt-buttons [data-alt]').forEach(btn => {
  btn.addEventListener('click', () => setOrbit(Number(btn.dataset.alt)));
});

function consumePropellant(deltaV, Isp, thrusterType) {
  const m0 = getCurrentMass();
  // Correct rocket equation: m_f = m_0 / exp(dv / (Isp * g0))
  const massRatio = Math.exp(deltaV / (Isp * g0));
  const mf = m0 / massRatio;
  const propUsed = m0 - mf;
  
  // Check if enough propellant exists
  const available = currentPreset.propellantRemaining[thrusterType] || 0;
  if (propUsed > available) {
    return false; // Not enough fuel
  }
  
  // Deduct from specified thruster type
  currentPreset.propellantRemaining[thrusterType] -= propUsed;
  return true;
}

function consumeContinuousThrust(dt) {
  // Only consume if thrust is active and we have chemical propellant
  if (!thrust.x && !thrust.y) return;
  
  // Use first available chemical thruster
  let thruster = null;
  let propType = null;
  
  if (currentPreset.propellantRemaining.hydrazine > 0) {
    thruster = currentPreset.thrusters.find(t => t.type === 'chemical_monoprop');
    propType = 'hydrazine';
  } else if (currentPreset.propellantRemaining.biprop > 0) {
    thruster = currentPreset.thrusters.find(t => t.type === 'biprop_MMHMHN');
    propType = 'biprop';
  }
  
  if (!thruster || !propType) {
    // No fuel - disable thrust
    thrust.x = thrust.y = 0;
    keysHeld.clear();
    return;
  }
  
  // Mass flow rate: ṁ = T / (Isp * g0)
  const thrustMag = Math.hypot(thrust.x, thrust.y) * getCurrentMass(); // Convert accel to force
  const massFlowRate = thrustMag / (thruster.Isp * g0);
  const propUsed = massFlowRate * dt;
  
  const newAmount = currentPreset.propellantRemaining[propType] - propUsed;
  if (newAmount <= 0) {
    // Out of fuel for this type
    currentPreset.propellantRemaining[propType] = 0;
    thrust.x = thrust.y = 0;
    keysHeld.clear();
  } else {
    currentPreset.propellantRemaining[propType] = newAmount;
  }
}

document.getElementById('resetBtn').addEventListener('click', () => {
  // Reset applies current game mode constraints
  setOrbit(currentAltKm);
});

document.getElementById('stopBtn').addEventListener('click', () => {
  isRunning = !isRunning;
  document.getElementById('stopBtn').textContent = isRunning ? 'Stop' : 'Resume';
  
  if (isRunning) {
    startPhysicsSimulation();
  } else {
    stopPhysicsSimulation();
  }
});

timeScaleInput.addEventListener('input', () => {
  updateTimeScaleFromSlider();
});

// Drag constants
const dragCoeff = 2.2; // Drag coefficient (typical for satellites)
const crossSectionalArea = 10; // Cross-sectional area in m² (assumed for small satellite)
const rho0 = 1.225; // Sea-level atmospheric density in kg/m³
const scaleHeight = 8500; // Atmospheric scale height in meters

function step(dt) {
  const r = Math.hypot(state.pos.x, state.pos.y);
  
  // COLLISION DETECTION
  if (r <= earthRadius) {
    hasCrashed = true;
    isRunning = false;
    state.vel.x = 0;
    state.vel.y = 0;
    // Snap to surface
    const angle = Math.atan2(state.pos.y, state.pos.x);
    state.pos.x = earthRadius * Math.cos(angle);
    state.pos.y = earthRadius * Math.sin(angle);
    return;
  }
  
  const accelGrav = -G * earthMass / (r * r);
  
  // Calculate atmospheric drag
  const altitude = r - earthRadius; // Altitude in meters
  const rho = rho0 * Math.exp(-altitude / scaleHeight); // Exponential atmosphere density
  const vMag = Math.hypot(state.vel.x, state.vel.y); // Velocity magnitude
  const mass = getCurrentMass(); // Current satellite mass
  
  let dragAx = 0;
  let dragAy = 0;
  if (vMag > 0) {
    const dragMagnitude = 0.5 * dragCoeff * rho * vMag * vMag * (crossSectionalArea / mass);
    const vHatX = state.vel.x / vMag; // Unit vector x-component
    const vHatY = state.vel.y / vMag; // Unit vector y-component
    dragAx = -dragMagnitude * vHatX; // Drag acceleration opposes velocity
    dragAy = -dragMagnitude * vHatY;
  }
  
  const ax = accelGrav * (state.pos.x / r) + thrust.x + dragAx;
  const ay = accelGrav * (state.pos.y / r) + thrust.y + dragAy;
  state.vel.x += ax * dt;
  state.vel.y += ay * dt;
  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  
  consumeContinuousThrust(dt);
  updateSunlightStatus();
  rechargePower(dt);
}

// AI AUTOPILOT CONTROLS
if (autopilot) {
  const autopilotToggle = document.getElementById('autopilotToggle');
  const apStatus = document.getElementById('apStatus');
  const apMode = document.getElementById('apMode');
  const autopilotLogEl = document.getElementById('autopilotLog');
  const aiLogEl = document.getElementById('aiLog');
  
  autopilotToggle.addEventListener('change', (e) => {
    autopilot.setEnabled(e.target.checked);
    
    if (e.target.checked) {
      apStatus.textContent = 'ACTIVE';
      apStatus.style.color = '#4caf50';
      autopilotLogEl.style.display = 'block';
    } else {
      apStatus.textContent = 'STANDBY';
      apStatus.style.color = '#9fb4d6';
      autopilotLogEl.style.display = 'none';
    }
  });
  
  // Update autopilot status display
  function updateAutopilotDisplay() {
    const status = autopilot.getStatus();
    
    if (status.enabled) {
      apMode.textContent = status.rescueMode ? '🚨 RESCUE MODE' : '🤖 AUTO-MAINTAIN';
      apMode.style.color = status.rescueMode ? '#ff9800' : '#00bcd4';
      
      // Update log
      const logHtml = status.recentLog.map(entry => 
        `<div style="margin:2px 0; padding:2px; background:#0f1929;">${entry.time}: ${entry.message}</div>`
      ).join('');
      aiLogEl.innerHTML = logHtml || '<div style="color:#7a8fa8;">No activity yet...</div>';
    }
  }
  
  // Call autopilot in simulation loop
  function runAutopilot() {
    if (!autopilot || !autopilot.enabled || hasCrashed) return;
    
    // Create callback for autopilot to fire thrusters
    const autopilotFireThruster = (deltaV) => {
      // Find best available thruster (prefer electric for efficiency, chemical for rescue)
      const useElectric = !autopilot.rescueMode && currentPreset.thrusters.some(t => 
        t.type.includes('hall') || t.type.includes('ion')
      );
      
      let thrusterIdx = 0;
      let thruster = currentPreset.thrusters[0];
      let propType = 'hydrazine';
      
      if (useElectric) {
        thrusterIdx = currentPreset.thrusters.findIndex(t => 
          t.type.includes('hall') || t.type.includes('ion')
        );
        if (thrusterIdx !== -1) {
          thruster = currentPreset.thrusters[thrusterIdx];
          propType = 'xenon';
        }
      } else {
        // Use chemical for rescue mode
        if (currentPreset.propellantRemaining.hydrazine > 0) {
          propType = 'hydrazine';
        } else if (currentPreset.propellantRemaining.biprop > 0) {
          thrusterIdx = currentPreset.thrusters.findIndex(t => t.type === 'biprop_MMHMHN');
          if (thrusterIdx !== -1) {
            thruster = currentPreset.thrusters[thrusterIdx];
            propType = 'biprop';
          }
        }
      }
      
      // Fire the thruster
      fireThruster(thrusterIdx, deltaV, thruster, propType);
    };
    
    // Run autopilot update
    autopilot.update(
      state, 
      currentConstraints, 
      getCurrentMass(), 
      missionElapsedSeconds,
      autopilotFireThruster
    );
    
    updateAutopilotDisplay();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawProjection();
  ctx.fillStyle = '#123c73';
  ctx.beginPath();
  const earthPx = earthRadius / metersPerPixel;
  ctx.arc(center.x, center.y, earthPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6d32d';
  const sx = center.x + state.pos.x / metersPerPixel;
  const sy = center.y + state.pos.y / metersPerPixel;
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  drawThrustArrow();
  drawBurnIndicator();
}

let last = performance.now();
let lastRealTime = Date.now();
let physicsInterval = null; // Separate interval for physics

// PHYSICS LOOP - Runs independently of tab visibility
function physicsLoop() {
  if (!isRunning || hasCrashed) return;
  
  const currentRealTime = Date.now();
  const realDt = (currentRealTime - lastRealTime) / 1000;
  lastRealTime = currentRealTime;
  
  // Clamp dt to prevent huge jumps
  const clampedDt = Math.min(realDt, 0.1);
  
  // Adaptive time scaling for HEO
  let effectiveTimeScale = timeScale;
  
  if (currentAltKm === 42000 && currentPreset.eccentricity) {
    const altitude = (Math.hypot(state.pos.x, state.pos.y) - earthRadius) / 1000;
    const apogeeAlt = currentPreset.apogeeAltKm;
    const perigeeAlt = currentPreset.perigeeAltKm;
    const altRatio = (altitude - perigeeAlt) / (apogeeAlt - perigeeAlt);
    effectiveTimeScale = timeScale * (0.3 + altRatio * 0.7);
  }
  
  const dt = clampedDt * effectiveTimeScale;
  const subSteps = 4;
  const frameDt = dt / subSteps;
  for (let i = 0; i < subSteps; i++) step(frameDt);
  missionElapsedSeconds += dt;
  
  // Run autopilot
  if (autopilot && frameCount % 30 === 0) {
    runAutopilot();
  }
  
  projectionCooldown -= dt;
  if (projectionCooldown <= 0) { 
    updateProjection(); 
    projectionCooldown = 0.3; 
  }
}

// Start physics simulation with setInterval (runs even when tab inactive)
function startPhysicsSimulation() {
  if (physicsInterval) {
    clearInterval(physicsInterval);
  }
  lastRealTime = Date.now();
  // Run physics at ~60Hz (16.67ms per frame)
  physicsInterval = setInterval(physicsLoop, 16);
}

// Stop physics simulation
function stopPhysicsSimulation() {
  if (physicsInterval) {
    clearInterval(physicsInterval);
    physicsInterval = null;
  }
}

// RENDER LOOP - Only for drawing (can be throttled, doesn't affect physics)
function renderLoop(now) {
  frameCount++;
  
  updateScale();
  draw();
  
  // Constraint checking
  const constraintCheck = checkOrbitConstraints();
  const speed = constraintCheck.velocity;
  const altitude = constraintCheck.altitude;
  
  speedEl.textContent = speed.toFixed(1);
  altEl.textContent = altitude.toFixed(1);
  
  // Update propellant display
  const hydTotal = currentPreset.propellantRemaining.hydrazine;
  const xenonTotal = currentPreset.propellantRemaining.xenon;
  const bipropTotal = currentPreset.propellantRemaining.biprop;
  let propText = '';
  if (currentPreset.propellant.hydrazine > 0) propText += `Hyd: ${hydTotal.toFixed(1)} kg `;
  if (currentPreset.propellant.xenon > 0) propText += `Xe: ${xenonTotal.toFixed(1)} kg `;
  if (currentPreset.propellant.biprop > 0) propText += `Biprop: ${bipropTotal.toFixed(1)} kg`;
  
  if (currentPreset.solarArrayPower > 0) {
    const chargingIcon = isInSunlight ? '☀️' : '🌑';
    propText += ` | ${chargingIcon}⚡${(electricThrusterPower * 100).toFixed(0)}%`;
  }
  
  document.getElementById('propStatus').textContent = propText.trim() || 'No propellant';
  
  // Calculate fuel percentage
  const totalStart = currentPreset.propellant.hydrazine + currentPreset.propellant.xenon + currentPreset.propellant.biprop;
  const totalRemaining = hydTotal + xenonTotal + bipropTotal;
  const fuelPercent = totalStart > 0 ? (totalRemaining / totalStart) * 100 : 0;
  const fuelLevelEl = document.getElementById('fuelLevel');
  fuelLevelEl.textContent = `Fuel: ${fuelPercent.toFixed(1)}%`;
  
  if (fuelPercent > 50) {
    fuelLevelEl.style.color = '#4caf50';
  } else if (fuelPercent > 20) {
    fuelLevelEl.style.color = '#ffb347';
  } else {
    fuelLevelEl.style.color = '#f44336';
  }
  
  // Update mission time
  const days = Math.floor(missionElapsedSeconds / 86400);
  const hours = Math.floor((missionElapsedSeconds % 86400) / 3600);
  const minutes = Math.floor((missionElapsedSeconds % 3600) / 60);
  document.getElementById('missionTime').textContent = `Mission: Day ${days}, ${hours}h ${minutes}m`;
  
  // Update constraint status
  const altStatusEl = document.getElementById('altStatus');
  const velStatusEl = document.getElementById('velStatus');
  
  if (hasCrashed) {
    altStatusEl.textContent = 'CRASHED';
    altStatusEl.style.color = '#ff0000';
    altStatusEl.style.fontWeight = 'bold';
    velStatusEl.textContent = 'CRASHED';
    velStatusEl.style.color = '#ff0000';
    velStatusEl.style.fontWeight = 'bold';
    
    const violationsEl = document.getElementById('violations');
    violationsEl.textContent = '💥 SATELLITE DESTROYED - Impact with Earth surface!';
    violationsEl.style.display = 'block';
    violationsEl.style.color = '#ff0000';
    violationsEl.style.fontWeight = 'bold';
  } else {
    altStatusEl.textContent = constraintCheck.altStatus;
    if (constraintCheck.altStatus === 'CRITICAL') {
      altStatusEl.style.color = '#f44336';
      altStatusEl.style.fontWeight = 'bold';
    } else if (constraintCheck.altStatus === 'VIOLATION') {
      altStatusEl.style.color = '#ff9800';
      altStatusEl.style.fontWeight = 'bold';
    } else if (constraintCheck.altStatus === 'WARNING') {
      altStatusEl.style.color = '#ffb347';
      altStatusEl.style.fontWeight = 'normal';
    } else {
      altStatusEl.style.color = '#4caf50';
      altStatusEl.style.fontWeight = 'normal';
    }
    
    velStatusEl.textContent = constraintCheck.velStatus;
    if (constraintCheck.velStatus === 'CRITICAL') {
      velStatusEl.style.color = '#f44336';
      velStatusEl.style.fontWeight = 'bold';
    } else if (constraintCheck.velStatus === 'VIOLATION') {
      velStatusEl.style.color = '#ff9800';
      velStatusEl.style.fontWeight = 'bold';
    } else if (constraintCheck.velStatus === 'WARNING') {
      velStatusEl.style.color = '#ffb347';
      velStatusEl.style.fontWeight = 'normal';
    } else {
      velStatusEl.style.color = '#4caf50';
      velStatusEl.style.fontWeight = 'normal';
    }
    
    const violationsEl = document.getElementById('violations');
    if (constraintCheck.violations.length > 0) {
      violationsEl.textContent = constraintCheck.violations.join(' | ');
      violationsEl.style.display = 'block';
      violationsEl.style.color = '#ff9800';
      violationsEl.style.fontWeight = 'normal';
    } else {
      violationsEl.style.display = 'none';
    }
  }
  
  requestAnimationFrame(renderLoop);
}

// Initialize and start both loops
lastRealTime = Date.now();
startPhysicsSimulation();
requestAnimationFrame(renderLoop);

// === Projection, scaling, and thrust visuals ===
function updateScale() {
  const viewRadius = Math.max(earthRadius, Math.hypot(state.pos.x, state.pos.y));
  
  // Adaptive margin for HEO - zoom in more at perigee, zoom out at apogee
  let margin = 0.8;
  
  if (currentAltKm === 42000 && currentPreset.eccentricity) {
    // For HEO Molniya orbit, adjust margin based on altitude
    const altitude = (viewRadius - earthRadius) / 1000;
    const apogeeAlt = currentPreset.apogeeAltKm;
    const perigeeAlt = currentPreset.perigeeAltKm;
    
    // Interpolate margin: tighter at perigee (0.7), wider at apogee (0.9)
    const altRatio = (altitude - perigeeAlt) / (apogeeAlt - perigeeAlt);
    margin = 0.7 + altRatio * 0.2; // Ranges from 0.7 to 0.9
  }
  
  metersPerPixel = Math.max(1, viewRadius / ((Math.min(canvas.width, canvas.height) / 2) * margin));
}

function updateProjection() {
  const simDt = 0.5;
  const steps = 400;
  const thrustDuration = 1.0;
  const pulseSteps = Math.max(1, Math.round(thrustDuration / simDt));
  const sim = { pos: { ...state.pos }, vel: { ...state.vel } };
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const r = Math.hypot(sim.pos.x, sim.pos.y);
    const accelGrav = -G * earthMass / (r * r);
    const ax = accelGrav * (sim.pos.x / r) + (i < pulseSteps ? thrust.x : 0);
    const ay = accelGrav * (sim.pos.y / r) + (i < pulseSteps ? thrust.y : 0);
    sim.vel.x += ax * simDt;
    sim.vel.y += ay * simDt;
    sim.pos.x += sim.vel.x * simDt;
    sim.pos.y += sim.vel.y * simDt;
    if (i % 4 === 0) pts.push({ x: sim.pos.x, y: sim.pos.y });
  }
  projectionPoints = pts;
}

function drawProjection() {
  if (projectionPoints.length < 2) return;
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  const toScreen = p => ({
    x: center.x + p.x / metersPerPixel,
    y: center.y + p.y / metersPerPixel
  });
  const start = toScreen(projectionPoints[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < projectionPoints.length; i++) {
    const s = toScreen(projectionPoints[i]);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawThrustArrow() {
  if (!thrust.x && !thrust.y) return;
  const sx = center.x + state.pos.x / metersPerPixel;
  const sy = center.y + state.pos.y / metersPerPixel;
  const scale = 400; // Shortened from 1200 to 400
  const tx = sx + thrust.x * scale;
  const ty = sy + thrust.y * scale;
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  const angle = Math.atan2(ty - sy, tx - sx);
  const headLen = 8;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
  
  // Add RCS direction labels and thrust magnitude
  if (activeRCSIndicator) {
    ctx.save();
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    
    const directions = [];
    if (keysHeld.has('upleft')) directions.push('↖');
    else if (keysHeld.has('upright')) directions.push('↗');
    else if (keysHeld.has('downleft')) directions.push('↙');
    else if (keysHeld.has('downright')) directions.push('↘');
    else {
      // Keyboard combinations or single keys
      if (keysHeld.has('up')) directions.push('↑');
      if (keysHeld.has('down')) directions.push('↓');
      if (keysHeld.has('left')) directions.push('←');
      if (keysHeld.has('right')) directions.push('→');
    }
    
    // Calculate thrust magnitude in m/s²
    const thrustMagnitude = Math.hypot(thrust.x, thrust.y);
    
    ctx.fillText(`${directions.join(' ')} ${thrustMagnitude.toFixed(2)} m/s²`, sx, sy + 25);
    ctx.restore();
  }
}

function logBurn(burn) {
  const days = Math.floor(burn.time / 86400);
  const hours = Math.floor((burn.time % 86400) / 3600);
  
  burnHistory.unshift({
    ...burn,
    timestamp: `D${days} ${hours}h`
  });
  
  if (burnHistory.length > 10) burnHistory.pop();
  
  updateBurnLog();
}

function createThrusterButtons() {
  const container = document.getElementById('thruster-controls');
  if (!container) return;
  
  container.innerHTML = `
    <div style="font-size:0.75rem; color:#9fb4d6; margin-bottom:4px;">
      Orbital Maneuver Thrusters:
    </div>
    <div style="font-size:0.65rem; color:#7a8fa8; margin-bottom:6px; line-height:1.2;">
      (Impulsive burns - instant delta-V change)
    </div>
  `;
  
  currentPreset.thrusters.forEach((thruster, idx) => {
    const isChemical = thruster.type.includes('chemical') || thruster.type.includes('biprop');
    const isElectric = thruster.type.includes('hall') || thruster.type.includes('ion');
    
    // Get propellant type for this thruster
    let propType = 'hydrazine';
    if (thruster.type === 'biprop_MMHMHN') propType = 'biprop';
    if (thruster.type === 'hall_thruster' || thruster.type === 'ion_thruster') propType = 'xenon';
    
    // REALISTIC delta-V per burn based on thruster power
    let deltaVPerBurn = 20; // Default for chemical
    if (isElectric) {
      const thrustN = thruster.thrust;
      if (thrustN < 0.06) {
        deltaVPerBurn = 2; // Weak electric thrusters (Hall 0.04N)
      } else if (thrustN < 0.10) {
        deltaVPerBurn = 3; // Medium electric thrusters (Hall 0.06N, Ion 0.08N)
      } else {
        deltaVPerBurn = 5; // Strong electric thrusters (Hall 0.15N GEO)
      }
    }
    
    // Add icons and labels for thruster type
    const thrusterIcon = isElectric ? '⚡' : '🔥';
    
    // Human-readable names with propulsion method
    let displayName = '';
    let propulsionMethod = '';
    
    if (thruster.type === 'chemical_monoprop') {
      displayName = 'Monoprop Engine';
      propulsionMethod = 'Combustion';
    } else if (thruster.type === 'hall_thruster') {
      displayName = 'Hall Thruster';
      propulsionMethod = 'Electric (Ion Acceleration)';
    } else if (thruster.type === 'ion_thruster') {
      displayName = 'Ion Thruster';
      propulsionMethod = 'Electric (Ion Acceleration)';
    } else if (thruster.type === 'biprop_MMHMHN') {
      displayName = 'Biprop Engine';
      propulsionMethod = 'Combustion';
    } else {
      displayName = thruster.type.replace(/_/g, ' ');
      propulsionMethod = isElectric ? 'Electric' : 'Combustion';
    }
    
    // Create prograde and retrograde buttons
    const progradeBtn = document.createElement('button');
    progradeBtn.className = `thruster-btn ${isChemical ? 'chemical' : 'electric'}`;
    progradeBtn.innerHTML = `
      <div style="display:flex; align-items:center; gap:4px; justify-content:space-between;">
        <span>${thrusterIcon}</span>
        <span style="flex:1; text-align:left; font-size:0.7rem;">${displayName}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:2px;">
        <span class="burn-cost">+${deltaVPerBurn} m/s | Isp: ${thruster.Isp}s</span>
      </div>
      <div style="font-size:0.6rem; color:#7a8fa8; margin-top:2px; font-style:italic;">
        ${propulsionMethod}
      </div>
    `;
    progradeBtn.onclick = () => fireThruster(idx, deltaVPerBurn, thruster, propType);
    
    const retrogradeBtn = document.createElement('button');
    retrogradeBtn.className = `thruster-btn ${isChemical ? 'chemical' : 'electric'}`;
    retrogradeBtn.innerHTML = `
      <div style="display:flex; align-items:center; gap:4px; justify-content:space-between;">
        <span>${thrusterIcon}</span>
        <span style="flex:1; text-align:left; font-size:0.7rem;">${displayName}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:2px;">
        <span class="burn-cost">-${deltaVPerBurn} m/s | Isp: ${thruster.Isp}s</span>
      </div>
      <div style="font-size:0.6rem; color:#7a8fa8; margin-top:2px; font-style:italic;">
        ${propulsionMethod}
      </div>
    `;
    retrogradeBtn.onclick = () => fireThruster(idx, -deltaVPerBurn, thruster, propType);
    
    container.appendChild(progradeBtn);
    container.appendChild(retrogradeBtn);
  });
}

function fireThruster(thrusterIdx, dv, thruster, propType) {
  // Prevent burns if crashed
  if (hasCrashed) {
    console.warn('Cannot fire thrusters - satellite has crashed!');
    return;
  }
  
  const speed = Math.hypot(state.vel.x, state.vel.y) || 1;
  
  // Check if this is an electric thruster
  const isElectric = thruster.type.includes('hall') || thruster.type.includes('ion');
  
  // CALCULATE REALISTIC BURN DURATION
  // F = ma → a = F/m
  const currentMass = getCurrentMass();
  const thrustNewtons = thruster.thrust; // Thrust in Newtons
  const accelFromThruster = thrustNewtons / currentMass; // m/s²
  
  // Time to achieve deltaV: t = ΔV / a
  const burnDurationSeconds = Math.abs(dv) / accelFromThruster;
  
  // Format burn duration for display
  let burnDurationText = '';
  if (burnDurationSeconds < 60) {
    burnDurationText = `${burnDurationSeconds.toFixed(1)}s`;
  } else if (burnDurationSeconds < 3600) {
    const minutes = Math.floor(burnDurationSeconds / 60);
    const seconds = Math.floor(burnDurationSeconds % 60);
    burnDurationText = `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(burnDurationSeconds / 3600);
    const minutes = Math.floor((burnDurationSeconds % 3600) / 60);
    burnDurationText = `${hours}h ${minutes}m`;
  }
  
  if (isElectric) {
    // REALISTIC electric thruster power consumption
    const powerNeeded = Math.abs(dv) * 0.015; // 5 m/s = 7.5% battery
    
    if (electricThrusterPower < powerNeeded) {
      console.warn('Insufficient power for electric thruster - solar arrays recharging');
      const violationsEl = document.getElementById('violations');
      violationsEl.textContent = `⚡ Insufficient battery! Need ${(powerNeeded * 100).toFixed(0)}% (${(electricThrusterPower * 100).toFixed(0)}% available) | Burn: ${burnDurationText}`;
      violationsEl.style.display = 'block';
      violationsEl.style.color = '#ffb347';
      setTimeout(() => {
        if (!hasCrashed && violationsEl.textContent.includes('Insufficient battery')) {
          violationsEl.style.display = 'none';
        }
      }, 3000);
      return;
    }
    
    // Check if we have xenon fuel
    const available = currentPreset.propellantRemaining[propType] || 0;
    if (available <= 0) {
      console.warn(`No ${propType} available for this thruster`);
      const violationsEl = document.getElementById('violations');
      violationsEl.textContent = `⚠️ No xenon fuel remaining!`;
      violationsEl.style.display = 'block';
      violationsEl.style.color = '#ffb347';
      setTimeout(() => {
        if (!hasCrashed && violationsEl.textContent.includes('No xenon')) {
          violationsEl.style.display = 'none';
        }
      }, 3000);
      return;
    }
    
    // REALISTIC xenon consumption for electric thrusters
    const m0 = getCurrentMass();
    const massRatio = Math.exp(Math.abs(dv) / (thruster.Isp * g0));
    const mf = m0 / massRatio;
    const propUsedRocket = m0 - mf;
    const propUsedRealistic = propUsedRocket * 0.05;
    
    if (propUsedRealistic > available) {
      console.warn('Insufficient xenon propellant for burn');
      return;
    }
    
    // Consume xenon
    currentPreset.propellantRemaining[propType] -= propUsedRealistic;
    
    // Consume battery power
    electricThrusterPower = Math.max(0, electricThrusterPower - powerNeeded);
    
    // Show burn duration notification for electric burns
    const violationsEl = document.getElementById('violations');
    violationsEl.textContent = `⚡ Electric burn complete! Duration: ${burnDurationText} | Used ${propUsedRealistic.toFixed(3)} kg Xe, ${(powerNeeded * 100).toFixed(1)}% battery`;
    violationsEl.style.display = 'block';
    violationsEl.style.color = '#00bcd4';
    setTimeout(() => {
      if (!hasCrashed && violationsEl.textContent.includes('Electric burn complete')) {
        violationsEl.style.display = 'none';
      }
    }, 4000);
    
  } else {
    // Chemical thruster - normal rocket equation
    const available = currentPreset.propellantRemaining[propType] || 0;
    if (available <= 0) {
      console.warn(`No ${propType} available for this thruster`);
      return;
    }
    
    if (!consumePropellant(Math.abs(dv), thruster.Isp, propType)) {
      console.warn('Insufficient propellant for burn');
      return;
    }
    
    // Show burn duration for chemical burns (much shorter)
    const violationsEl = document.getElementById('violations');
    violationsEl.textContent = `🔥 Chemical burn complete! Duration: ${burnDurationText}`;
    violationsEl.style.display = 'block';
    violationsEl.style.color = '#4caf50';
    setTimeout(() => {
      if (!hasCrashed && violationsEl.textContent.includes('Chemical burn complete')) {
        violationsEl.style.display = 'none';
      }
    }, 3000);
  }
  
  // Apply delta-v along velocity vector
  state.vel.x += (state.vel.x / speed) * dv;
  state.vel.y += (state.vel.y / speed) * dv;
  
  // Log the burn
  const burnAmount = Math.abs(dv);
  const burnType = isElectric ? 'electric' : 'chemical';
  logBurn({ amount: burnAmount, type: burnType, time: missionElapsedSeconds });
}

// ...existing code for sunlight and power management...
function updateSunlightStatus() {
  // FIXED sun position at +X direction (infinite distance)
  // Sun does NOT rotate - it's fixed in space
  
  const satX = state.pos.x;
  const satY = state.pos.y;
  
  // If satellite is on the -X side (behind Earth from sun's perspective)
  if (satX < 0) {
    const distanceFromCenter = Math.hypot(satX, satY);
    
    // Shadow radius at satellite distance (simplified umbra)
    // This creates a cone-shaped shadow extending from Earth
    const shadowRadius = earthRadius;
    
    // Check if satellite is within shadow cone
    // perpDistance = distance from the X-axis
    const perpDistance = Math.abs(satY);
    
    // In eclipse if close enough to X-axis on the -X side
    isInSunlight = perpDistance > shadowRadius;
  } else {
    // Satellite is on the +X side (sunlit side) - always in sunlight
    isInSunlight = true;
  }
}

function rechargePower(dt) {
  // Only recharge if satellite has solar arrays
  if (currentPreset.solarArrayPower <= 0) return;
  
  // Power generation based ONLY on eclipse (orbital position)
  let powerGenerated = 0;
  
  if (isInSunlight) {
    // In sunlight: full solar array power
    powerGenerated = currentPreset.solarArrayPower;
  } else {
    // In eclipse (Earth's shadow): no power generation
    powerGenerated = 0;
  }
  
  // Convert power to battery charge rate
  const maxBatteryWh = currentPreset.batteryCapacityWh || 100;
  const currentBatteryWh = electricThrusterPower * maxBatteryWh;
  
  // Charge battery: P (kW) * dt (s) / 3600 (s/h) = Wh
  const energyGenerated = (powerGenerated * dt) / 3600; // Wh
  const newBatteryWh = Math.min(maxBatteryWh, currentBatteryWh + energyGenerated);
  
  // Update power level (0.0 to 1.0)
  electricThrusterPower = newBatteryWh / maxBatteryWh;
}

function updateBurnLog() {
  const logEl = document.getElementById('burnLog');
  if (!logEl) return;
  
  if (burnHistory.length === 0) {
    logEl.innerHTML = '<div style="color:#9fb4d6; font-style:italic;">No burns yet</div>';
    return;
  }
  
  logEl.innerHTML = burnHistory.map(b => `
    <div class="burn-entry ${b.type}">
      <strong>${b.amount ? '+' + b.amount : ''} m/s</strong> ${b.type} @ ${b.timestamp}
    </div>
  `).join('');
}

function showBurnIndicator(dv) {
  activeBurnIndicator = { dv, frame: 0, maxFrames: 60 };
}

function showRCSIndicator() {
  activeRCSIndicator = { frame: 0 };
}

function drawBurnIndicator() {
  // Draw impulsive burn indicator (from thruster buttons)
  if (activeBurnIndicator) {
    activeBurnIndicator.frame++;
    if (activeBurnIndicator.frame > activeBurnIndicator.maxFrames) {
      activeBurnIndicator = null;
      return;
    }
    
    const alpha = 1 - (activeBurnIndicator.frame / activeBurnIndicator.maxFrames);
    const sx = center.x + state.pos.x / metersPerPixel;
    const sy = center.y + state.pos.y / metersPerPixel;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = activeBurnIndicator.dv > 0 ? '#4caf50' : '#f44336';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${activeBurnIndicator.dv > 0 ? '+' : ''}${activeBurnIndicator.dv} m/s`, sx, sy - 30);
    ctx.restore();
  }
  
  // Draw RCS thrust indicator (from arrow keys)
  if (activeRCSIndicator) {
    activeRCSIndicator.frame++;
    const sx = center.x + state.pos.x / metersPerPixel;
    const sy = center.y + state.pos.y / metersPerPixel;
    
    const pulseAlpha = 0.6 + 0.4 * Math.sin(activeRCSIndicator.frame * 0.2);
    
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('RCS THRUST', sx, sy - 45);
    ctx.restore();
  }
}

function checkOrbitConstraints() {
  const r = Math.hypot(state.pos.x, state.pos.y);
  const altitude = (r - earthRadius) / 1000;
  const targetAlt = currentConstraints.targetAlt;
  const altDev = Math.abs(altitude - targetAlt);
  
  const vMag = Math.hypot(state.vel.x, state.vel.y);
  const targetVel = currentConstraints.targetVelocity;
  const velDev = Math.abs(vMag - targetVel);
  
  const energy = (vMag * vMag) / 2 - (G * earthMass) / r;
  const semiMajorAxis = -(G * earthMass) / (2 * energy);
  const h = state.pos.x * state.vel.y - state.pos.y * state.vel.x;
  const p = (h * h) / (G * earthMass);
  const eccentricity = Math.sqrt(Math.max(0, 1 - p / semiMajorAxis));
  
  // UNIVERSAL ESCAPE VELOCITY CHECK (applies to ALL satellites)
  const escapeVelocity = Math.sqrt(2 * G * earthMass / r);
  
  let altStatus = 'NOMINAL';
  let velStatus = 'NOMINAL';
  let violations = [];
  
  // For HEO, check if we're near apogee or perigee
  const isHEO = currentConstraints.targetEccentricity && currentConstraints.targetEccentricity > 0.5;
  
  if (currentConstraints.altitude_km) {
    const thresholds = currentConstraints.altitude_km;
    
    if (isHEO) {
      // For HEO Molniya: altitude varies from 1000km (perigee) to 42000km (apogee)
      const apogeeAlt = currentConstraints.targetAlt; // 42000 km
      const perigeeAlt = currentConstraints.perigeAlt; // 1000 km
      
      const marginLow = perigeeAlt - thresholds.critical;
      const marginHigh = apogeeAlt + thresholds.critical;
      
      if (altitude < marginLow) {
        altStatus = 'CRITICAL';
        violations.push(`Alt: ${altitude.toFixed(0)}km BELOW Molniya perigee (${perigeeAlt}km)`);
      } else if (altitude > marginHigh) {
        altStatus = 'CRITICAL';
        violations.push(`Alt: ${altitude.toFixed(0)}km ABOVE Molniya apogee (${apogeeAlt}km)`);
      } else if (altitude < perigeeAlt - thresholds.violation) {
        altStatus = 'VIOLATION';
        violations.push(`Alt: ${altitude.toFixed(0)}km approaching limits`);
      } else if (altitude > apogeeAlt + thresholds.violation) {
        altStatus = 'VIOLATION';
        violations.push(`Alt: ${altitude.toFixed(0)}km approaching limits`);
      } else {
        altStatus = 'NOMINAL';
      }
    } else {
      // Circular orbit - standard deviation check
      if (altDev > thresholds.critical) {
        altStatus = 'CRITICAL';
        violations.push(`Alt: ${altDev.toFixed(1)}km off`);
      } else if (altDev > thresholds.violation) {
        altStatus = 'VIOLATION';
        violations.push(`Alt: ${altDev.toFixed(1)}km off`);
      } else if (altDev > thresholds.warning) {
        altStatus = 'WARNING';
        violations.push(`Alt: ${altDev.toFixed(1)}km off`);
      }
    }
  }
  
  if (currentConstraints.velocity_ms) {
    const thresholds = currentConstraints.velocity_ms;
    
    // CRITICAL: Check escape velocity for ALL satellite types
    if (vMag > escapeVelocity * 0.95) {
      // Approaching escape velocity - CRITICAL for all satellites!
      velStatus = 'CRITICAL';
      violations.push(`⚠️ ESCAPE VELOCITY! ${vMag.toFixed(0)}m/s (${(escapeVelocity * 0.95).toFixed(0)}m/s limit)`);
    } else if (isHEO) {
      // HEO-specific checks (in addition to escape velocity)
      if (vMag < 1000) {
        velStatus = 'WARNING';
        violations.push(`Vel: ${vMag.toFixed(0)}m/s very low`);
      } else {
        // Normal HEO velocity range - NOMINAL
        velStatus = 'NOMINAL';
      }
    } else {
      // Circular orbits - check deviation from target velocity
      if (velDev > thresholds.critical) {
        velStatus = 'CRITICAL';
        violations.push(`Vel: ${velDev.toFixed(1)}m/s off`);
      } else if (velDev > thresholds.violation) {
        velStatus = 'VIOLATION';
        violations.push(`Vel: ${velDev.toFixed(1)}m/s off`);
      } else if (velDev > thresholds.warning) {
        velStatus = 'WARNING';
        violations.push(`Vel: ${velDev.toFixed(1)}m/s off`);
      }
    }
  }
  
  // Eccentricity check (especially important for HEO)
  if (currentConstraints.eccentricity && isFinite(eccentricity)) {
    const thresholds = currentConstraints.eccentricity;
    
    if (isHEO) {
      const targetEcc = currentConstraints.targetEccentricity || 0.72;
      const eccDev = Math.abs(eccentricity - targetEcc);
      
      if (eccDev > thresholds.critical) {
        violations.push(`Ecc: ${eccentricity.toFixed(3)} (target: ${targetEcc.toFixed(2)}) - orbit shape changed!`);
      } else if (eccDev > thresholds.warning) {
        violations.push(`Ecc: ${eccentricity.toFixed(3)} (drifting from ${targetEcc.toFixed(2)})`);
      }
    } else {
      // Circular orbits - check if too elliptical
      if (eccentricity > thresholds.critical) {
        violations.push(`Ecc: ${eccentricity.toFixed(4)} (high)`);
      } else if (eccentricity > thresholds.violation) {
        violations.push(`Ecc: ${eccentricity.toFixed(4)}`);
      } else if (eccentricity > thresholds.warning) {
        violations.push(`Ecc: ${eccentricity.toFixed(4)}`);
      }
    }
  }
  
  return { altStatus, velStatus, violations, eccentricity, altitude, velocity: vMag };
}

// Setup game mode buttons
document.getElementById('modeRealBtn').addEventListener('click', () => {
  gameMode = 'real';
  document.getElementById('modeRealBtn').classList.add('active');
  document.getElementById('modeEasyBtn').classList.remove('active');
  updateGameModeDisplay();
  updateConstraints();
});

document.getElementById('modeEasyBtn').addEventListener('click', () => {
  gameMode = 'easy';
  document.getElementById('modeEasyBtn').classList.add('active');
  document.getElementById('modeRealBtn').classList.remove('active');
  updateGameModeDisplay();
  updateConstraints();
});

function updateGameModeDisplay() {
  const modeEl = document.getElementById('constraintMode');
  if (gameMode === 'real') {
    modeEl.textContent = 'Real World Constraints';
    modeEl.style.color = '#4caf50';
  } else {
    modeEl.textContent = 'Easy Constraints';
    modeEl.style.color = '#00bcd4';
  }
}

function updateConstraints() {
  const constraintSet = gameMode === 'real' ? orbitConstraints : easyConstraints;
  currentConstraints = constraintSet[currentAltKm] || constraintSet[400];
}

// Initialize game mode display on load
updateGameModeDisplay();
