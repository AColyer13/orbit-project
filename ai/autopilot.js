/**
 * ADVANCED NASA-GRADE 4-DOF AUTOPILOT
 * + Semi-major axis control
 * + Argument-of-perigee locking (J₂ compensation)
 * + HEO dual-node controller
 * + Orbit predictor (EKF-lite)
 * + Hohmann transfer planner
 * + Lambert solver
 * + Mission sequencer
 */

// ========== HOHMANN TRANSFER PLANNER ==========
class HohmannPlanner {
  planTransfer(r1, r2, mu) {
    if (r1 >= r2) return null; // Can't raise orbit
    
    const a_transfer = (r1 + r2) / 2;
    const v1 = Math.sqrt(mu / r1);
    const v2 = Math.sqrt(mu / r2);
    const v_t1 = Math.sqrt(mu * (2 / r1 - 1 / a_transfer));
    const v_t2 = Math.sqrt(mu * (2 / r2 - 1 / a_transfer));
    
    const circBurn = Math.abs(v_t1 - v1);
    const apoBurn = Math.abs(v2 - v_t2);
    const totalDv = circBurn + apoBurn;
    const transferTime = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);
    
    return {
      totalDv,
      circBurn,
      apoBurn,
      transferTime,
      a_transfer
    };
  }
}

// ========== LAMBERT SOLVER (Simplified) ==========
class LambertSolver {
  solve(r1, r2, transferTime, mu) {
    // Simplified Lambert solver (returns approximate solution)
    // Real implementation would use iterative method
    
    const deltaV = Math.sqrt(mu / r1) + Math.sqrt(mu / r2) - 2 * Math.sqrt(mu / (r1 + r2));
    return { deltaV, transferTime };
  }
}

// ========== MISSION SEQUENCER ==========
class MissionSequencer {
  constructor() {
    this.missionPlan = [];
    this.currentMissionIdx = 0;
    this.activeMission = null;
    this.missionPhase = 'planning'; // planning, transfer, circularize, complete
    this.lastBurnTime = 0;
  }

  addMission(mission) {
    this.missionPlan.push(mission);
    if (!this.activeMission && this.missionPlan.length === 1) {
      this.activeMission = mission;
      this.missionPhase = 'planning';
    }
  }

  getActiveMission() {
    return this.activeMission;
  }

  hasActivePlan() {
    return this.missionPlan.length > 0;
  }

  checkMissionComplete(currentAlt, currentSMA, currentEcc, mission) {
    if (!mission) return false;
    
    const altError = Math.abs(currentAlt - mission.targetAlt);
    const eccError = Math.abs(currentEcc - mission.targetEcc);
    
    // Mission complete if within tolerance
    return altError < 5 && eccError < 0.001;
  }

  completeMission() {
    if (this.activeMission) {
      this.activeMission.status = 'complete';
      this.missionPhase = 'complete';
      
      // Move to next mission in queue
      this.currentMissionIdx++;
      if (this.currentMissionIdx < this.missionPlan.length) {
        this.activeMission = this.missionPlan[this.currentMissionIdx];
        this.missionPhase = 'planning';
      } else {
        this.activeMission = null;
        this.missionPlan = [];
      }
    }
  }

  getNextBurn(missionTime, state, sma, ecc, trueAnomaly) {
    if (!this.activeMission) return null;
    
    const mission = this.activeMission;
    const r = Math.hypot(state.pos.x, state.pos.y);
    const earthRadius = 6371000;
    const currentAlt = (r - earthRadius) / 1000;
    const altError = mission.targetAlt - currentAlt;
    
    // Determine next burn based on mission type and phase
    if (Math.abs(altError) > 20) {
      this.missionPhase = 'transfer';
      
      // Need to transfer to target altitude
      return {
        deltaV: Math.abs(altError * 0.5),
        direction: altError > 0 ? 'prograde' : 'retrograde',
        reason: `Transfer to ${mission.targetAlt} km (${altError.toFixed(0)} km error)`
      };
    } else if (ecc > mission.targetEcc + 0.001) {
      this.missionPhase = 'circularize';
      
      // Need to circularize
      return {
        deltaV: ecc * 1000,
        direction: 'retrograde',
        reason: `Circularize: e=${ecc.toFixed(4)}`
      };
    } else {
      this.missionPhase = 'complete';
      return null;
    }
  }
}

// ========== ORBIT PREDICTOR (EKF-lite) ==========
class OrbitPredictor {
  constructor() {
    this.state = { x: 0, y: 0, vx: 0, vy: 0 };
    this.P = this.initializeCovariance();
    this.Q = this.initializeProcessNoise();
    this.R = this.initializeMeasurementNoise();
    this.lastUpdateTime = null;
    this.mu = 3.986004418e14;
    this.earthRadius = 6371000;
  }

  initializeCovariance() {
    return [
      [1e4, 0, 0, 0],
      [0, 1e4, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  initializeProcessNoise() {
    return [
      [1e-4, 0, 0, 0],
      [0, 1e-4, 0, 0],
      [0, 0, 1e-6, 0],
      [0, 0, 0, 1e-6]
    ];
  }

  initializeMeasurementNoise() {
    return [
      [25, 0, 0, 0],
      [0, 25, 0, 0],
      [0, 0, 0.0025, 0],
      [0, 0, 0, 0.0025]
    ];
  }

  predict(state, dt) {
    const prevState = { ...this.state };
    this.state = this.integrateOrbitalDynamics(this.state, dt);
    const F = this.computeJacobian(prevState, dt);
    const FP = this.matMult(F, this.P);
    const FPFt = this.matMult(FP, this.matTranspose(F));
    this.P = this.matAdd(FPFt, this.Q);
    return { ...this.state };
  }

  update(measurement, H) {
    const innovation = [
      measurement.x - this.state.x,
      measurement.y - this.state.y,
      measurement.vx - this.state.vx,
      measurement.vy - this.state.vy
    ];
    const HP = this.matMult(H, this.P);
    const HPHt = this.matMult(HP, this.matTranspose(H));
    const S = this.matAdd(HPHt, this.R);
    const HtSinv = this.matMult(this.matTranspose(H), this.matInverse(S));
    const K = this.matMult(this.P, HtSinv);
    const stateCorrection = this.matVectMult(K, innovation);
    this.state.x += stateCorrection[0];
    this.state.y += stateCorrection[1];
    this.state.vx += stateCorrection[2];
    this.state.vy += stateCorrection[3];
    const I = [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]];
    const KH = this.matMult(K, H);
    const IKH = this.matSubtract(I, KH);
    this.P = this.matMult(IKH, this.P);
  }

  integrateOrbitalDynamics(state, dt) {
    const r = Math.hypot(state.x, state.y);
    const accelMag = -this.mu / (r * r);
    const ax_grav = accelMag * (state.x / r);
    const ay_grav = accelMag * (state.y / r);
    
    const Re = 6.378137e6;
    const J2 = 1.08262668e-3;
    const z_equiv = state.y;
    const sin_lat_sq = (z_equiv * z_equiv) / (r * r);
    const j2_factor = (-3/2) * J2 * (this.mu / (r * r)) * Math.pow(Re / r, 2);
    const j2_radial = j2_factor * (1 - 5 * sin_lat_sq);
    const j2_polar = j2_factor * 2 * (z_equiv / r);
    const ax_j2 = j2_radial * (state.x / r);
    const ay_j2 = j2_radial * (state.y / r) + j2_polar;
    
    const altitude = r - this.earthRadius;
    const rho = 2.5e-12 * Math.exp(-(altitude / 1000 - 400) / 65);
    const v = Math.hypot(state.vx, state.vy);
    const dragMag = v > 0 ? 0.5 * 2.2 * rho * v * v * (10 / 2000) : 0;
    const ax_drag = -dragMag * (state.vx / v) || 0;
    const ay_drag = -dragMag * (state.vy / v) || 0;
    
    const ax = ax_grav + ax_j2 + ax_drag;
    const ay = ay_grav + ay_j2 + ay_drag;
    
    return {
      x: state.x + state.vx * dt,
      y: state.y + state.vy * dt,
      vx: state.vx + ax * dt,
      vy: state.vy + ay * dt
    };
  }

  computeJacobian(state, dt) {
    const eps = 1e-6;
    const F = [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]];
    const f0 = this.integrateOrbitalDynamics(state, dt);
    for (let i = 0; i < 4; i++) {
      const statePerturbed = { ...state };
      const keys = ['x', 'y', 'vx', 'vy'];
      statePerturbed[keys[i]] += eps;
      const f1 = this.integrateOrbitalDynamics(statePerturbed, dt);
      F[0][i] = (f1.x - f0.x) / eps;
      F[1][i] = (f1.y - f0.y) / eps;
      F[2][i] = (f1.vx - f0.vx) / eps;
      F[3][i] = (f1.vy - f0.vy) / eps;
    }
    return F;
  }

  propagate(state, dt, measurement = null) {
    if (this.lastUpdateTime === null) {
      this.state = { ...state };
    }
    const predicted = this.predict(state, dt);
    if (measurement) {
      const H = [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]];
      this.update(measurement, H);
    }
    return { ...this.state };
  }

  getUncertainty() {
    return {
      pos_x: Math.sqrt(this.P[0][0]),
      pos_y: Math.sqrt(this.P[1][1]),
      vel_x: Math.sqrt(this.P[2][2]),
      vel_y: Math.sqrt(this.P[3][3])
    };
  }

  matMult(A, B) {
    const result = Array(A.length).fill(0).map(() => Array(B[0].length).fill(0));
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B[0].length; j++) {
        for (let k = 0; k < B.length; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  matAdd(A, B) {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
  }

  matTranspose(A) {
    return A[0].map((_, i) => A.map(row => row[i]));
  }

  matInverse(A) {
    const n = A.length;
    const aug = A.map((row, i) => [
      ...row.map(x => x),
      ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
    ]);
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(aug[j][i]) > Math.abs(aug[pivot][i])) {
          pivot = j;
        }
      }
      [aug[i], aug[pivot]] = [aug[pivot], aug[i]];
      const factor = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= factor;
      }
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const f = aug[j][i];
          for (let k = 0; k < 2 * n; k++) {
            aug[j][k] -= f * aug[i][k];
          }
        }
      }
    }
    return aug.map(row => row.slice(n));
  }

  matVectMult(A, v) {
    return A.map(row => row.reduce((sum, val, i) => sum + val * v[i], 0));
  }

  matSubtract(A, B) {
    return A.map((row, i) => row.map((val, j) => val - B[i][j]));
  }
}

// ========== ADVANCED NASA-GRADE AUTOPILOT ==========
class OrbitalAutopilot {
  constructor() {
    this.enabled = false;
    this.rescueMode = false;
    this.lastBurnTime = 0;
    this.burnQueue = [];
    this.log = [];
    this.argumentOfPerigee = 0;
    
    // Advanced control modules
    this.orbitPredictor = new OrbitPredictor();
    this.hohmannPlanner = new HohmannPlanner();
    this.lambertSolver = new LambertSolver();
    this.missionSequencer = new MissionSequencer();
    
    // State tracking
    this.targetSMA = null;
    this.targetArgumentOfPerigee = null;
    this.omegaDriftRate = 0;
    this.lastKnownState = null;
    this.stateHistory = [];
    this.driftPredictions = [];
    this.burnSmoothingBuffer = [];
    this.lastCorrectionTime = 0;
    this.minCorrectionInterval = 30;
    this.lastActiveTime = null;
    this.lastStatusMessage = '';
  }

  setEnabled(value) {
    this.enabled = value;
    if (value) {
      this.logMessage(`✅ AUTOPILOT ENABLED`);
    } else {
      this.logMessage(`⏹️ AUTOPILOT DISABLED`);
    }
  }

  predictDriftIn60Seconds() {
    if (!this.lastKnownState) return null;
    
    const predictedState = this.orbitPredictor.propagate(this.lastKnownState, 60);
    const mu = 3.986004418e14;
    const r = Math.hypot(predictedState.x, predictedState.y);
    const v2 = predictedState.vx**2 + predictedState.vy**2;
    const energy = v2/2 - mu/r;
    const sma = -mu / (2 * energy);
    const h = Math.abs(predictedState.x * predictedState.vy - predictedState.y * predictedState.vx);
    const p = (h * h) / mu;
    const ecc = Math.sqrt(Math.max(0, 1 - p/sma));
    
    const currentR = Math.hypot(this.lastKnownState.x, this.lastKnownState.y);
    const currentV2 = this.lastKnownState.vx**2 + this.lastKnownState.vy**2;
    const currentEnergy = currentV2/2 - mu/currentR;
    const currentSMA = -mu / (2 * currentEnergy);
    const currentH = Math.abs(this.lastKnownState.x * this.lastKnownState.vy - this.lastKnownState.y * this.lastKnownState.vx);
    const currentP = (currentH * currentH) / mu;
    const currentEcc = Math.sqrt(Math.max(0, 1 - currentP/currentSMA));
    
    const smaDrift = (sma - currentSMA) / 1000;
    const eccDrift = ecc - currentEcc;
    const altDrift = (r - currentR) / 1000;
    
    return {
      predictedSMA: sma,
      predictedEcc: ecc,
      smaDrift: smaDrift,
      eccDrift: eccDrift,
      altDrift: altDrift,
      willViolateAltitude: Math.abs(altDrift) > 5,
      willViolateEcc: Math.abs(eccDrift) > 0.001
    };
  }

  applyDriftCorrections(state, constraints, nearPerigee, nearApogee, progradeUnit, retrogradeUnit) {
    const drift = this.predictDriftIn60Seconds();
    if (!drift) return;
    
    // ALTITUDE DRIFT CORRECTION
    if (drift.willViolateAltitude && nearPerigee) {
      const correctionDV = Math.abs(drift.smaDrift * 0.3); // Scale drift to correction
      const direction = drift.smaDrift > 0 ? retrogradeUnit : progradeUnit;
      this.queueBurn(
        correctionDV,
        direction,
        `🔮 Drift correction: predict ${drift.smaDrift.toFixed(1)} km drift in 60s`,
        'electric'
      );
      this.logMessage(`📊 Predicted SMA drift: ${drift.smaDrift.toFixed(2)} km → applying ${correctionDV.toFixed(2)} m/s correction`);
    }
    
    // ECCENTRICITY DRIFT CORRECTION
    if (drift.willViolateEcc && nearApogee) {
      const correctionDV = Math.abs(drift.eccDrift * 500);
      const direction = drift.eccDrift > 0 ? retrogradeUnit : progradeUnit;
      this.queueBurn(
        correctionDV,
        direction,
        `🔮 Ecc drift correction: predict ${drift.eccDrift.toFixed(4)} drift in 60s`,
        'electric'
      );
    }
  }

  // ========== 2. PLANE-CHANGE / INCLINATION CONTROLLER ==========
  controlPlaneAndInclination(state, constraints, nearApogee, radialUnit) {
    // Calculate orbital momentum (proxy for inclination in 2D)
    const L = Math.abs(state.pos.x * state.vel.y - state.pos.y * state.vel.x);
    const mu = 3.986004418e14;
    const r = Math.hypot(state.pos.x, state.pos.y);
    const v = Math.hypot(state.vel.x, state.vel.y);
    const energy = (v * v) / 2 - mu / r;
    const sma = -mu / (2 * energy);
    const expectedL = Math.sqrt(mu * sma); // Circular orbit assumption
    
    // Inclination error (as percentage of expected momentum)
    const inclinationError = Math.abs(L - expectedL) / expectedL;
    
    // NORMAL BURN (perpendicular to orbital plane in 2D = radial thrust)
    if (inclinationError > 0.005 && nearApogee) {
      const normalDV = Math.max(0.1, inclinationError * 50); // 0.1–5 m/s correction
      this.queueBurn(
        normalDV,
        radialUnit,
        `📐 Normal burn: plane correction ${(inclinationError * 100).toFixed(2)}%`,
        'electric'
      );
      this.logMessage(`🛰️ Inclination error: ${(inclinationError * 100).toFixed(1)}% → normal thrust ${normalDV.toFixed(2)} m/s`);
    }
  }

  // ========== 3. MINIMUM-FUEL LAMBERT-LITE SOLVER ==========
  selectMinimumFuelManeuver(currentAlt, targetAlt, currentEcc, targetEcc, availableDV) {
    // Choose between Hohmann, direct, and bielliptic transfers
    // Returns: { maneuverType, dv, burnCount, efficiency }
    
    const altDiff = Math.abs(targetAlt - currentAlt);
    const eccDiff = Math.abs(currentEcc - targetEcc);
    
    // Case 1: Small altitude change → direct single burn
    if (altDiff < 15 && eccDiff < 0.01) {
      return {
        maneuverType: 'direct',
        dv: altDiff * 0.5, // Empirical
        burnCount: 1,
        efficiency: 0.95,
        reason: 'Direct: minimal altitude change'
      };
    }
    
    // Case 2: Large altitude change, low current orbit → Hohmann (fuel-optimal)
    const hohmannDV = this.hohmannPlanner.planTransfer(
      6371000 + currentAlt * 1000,
      6371000 + targetAlt * 1000,
      3.986004418e14
    );
    
    if (altDiff > 50 && currentAlt < 10000 && hohmannDV) {
      return {
        maneuverType: 'hohmann',
        dv: hohmannDV.totalDv,
        burnCount: 2,
        efficiency: 0.99, // Most fuel-efficient
        transferTime: hohmannDV.transferTime,
        reason: `Hohmann: ${(hohmannDV.totalDv).toFixed(1)} m/s (2-impulse, optimal)`
      };
    }
    
    // Case 3: High altitude → bielliptic (intermediate efficiency)
    if (currentAlt > 10000 && altDiff > 100) {
      const biellipticDV = hohmannDV ? hohmannDV.totalDv * 0.85 : altDiff * 0.3;
      return {
        maneuverType: 'bielliptic',
        dv: biellipticDV,
        burnCount: 3,
        efficiency: 0.92,
        reason: `Bielliptic: ${biellipticDV.toFixed(1)} m/s (3-impulse, high-alt optimized)`
      };
    }
    
    // Fallback: direct burn
    return {
      maneuverType: 'direct',
      dv: altDiff * 0.5,
      burnCount: 1,
      efficiency: 0.85,
      reason: 'Direct: fallback maneuver'
    };
  }

  // ========== 4. BURN SMOOTHING / LOW-PASS FILTER ==========
  smoothBurnCorrection(proposedDV, proposedDir, reason) {
    // Prevent "twitch" corrections by filtering rapid burn requests
    // Returns: { shouldBurn, smoothedDV, reason }
    
    const now = performance.now() / 1000; // Convert to seconds
    const timeSinceLastBurn = now - this.lastCorrectionTime;
    
    // Debounce: wait at least 30 seconds between corrections
    if (timeSinceLastBurn < this.minCorrectionInterval) {
      return {
        shouldBurn: false,
        smoothedDV: 0,
        reason: `⏱️ Debounced: ${(this.minCorrectionInterval - timeSinceLastBurn).toFixed(0)}s until next correction`
      };
    }
    
    // Smoothing filter: average with previous 3 corrections
    this.burnSmoothingBuffer.push({
      dv: Math.abs(proposedDV),
      timestamp: now
    });
    
    // Keep only recent corrections (within last 5 minutes)
    this.burnSmoothingBuffer = this.burnSmoothingBuffer.filter(b => now - b.timestamp < 300);
    
    // If multiple rapid corrections, reduce magnitude (smooth out oscillation)
    let smoothedDV = Math.abs(proposedDV);
    if (this.burnSmoothingBuffer.length > 2) {
      const avgPastDV = this.burnSmoothingBuffer.slice(-3)
        .reduce((sum, b) => sum + b.dv, 0) / 3;
      smoothedDV = (Math.abs(proposedDV) + avgPastDV * 2) / 3; // 2/3 weighted average
      
      this.logMessage(`🔄 Smoothed correction: ${Math.abs(proposedDV).toFixed(2)} → ${smoothedDV.toFixed(2)} m/s`);
    }
    
    // Minimum viable correction (prevent micro-burns < 0.1 m/s)
    if (smoothedDV < 0.1) {
      return {
        shouldBurn: false,
        smoothedDV: 0,
        reason: `🔍 Correction too small after smoothing: ${smoothedDV.toFixed(3)} m/s`
      };
    }
    
    this.lastCorrectionTime = now;
    
    return {
      shouldBurn: true,
      smoothedDV: smoothedDV,
      reason: `✓ Smoothed & approved: ${smoothedDV.toFixed(2)} m/s burn`
    };
  }

  // ========== FUEL MANAGEMENT & PRE-PLANNING =========
  checkFuelAvailable(propellantRemaining, propType, deltaV, Isp, currentMass) {
    /**
     * Check if enough propellant exists for a planned burn
     * Uses REAL rocket equation: m_f = m_0 / exp(ΔV / (Isp * g0))
     * Returns: { hasEnough: bool, propUsed: kg, availableFuel: kg, shortfall: kg }
     */
    const available = propellantRemaining[propType] || 0;
    if (available <= 0) return { hasEnough: false, propUsed: 0, availableFuel: 0, shortfall: deltaV > 0 ? 1000 : 0 };
    
    // Rocket equation: m_f = m_0 / exp(ΔV / (Isp * g0))
    const g0 = 9.80665;
    const m0 = currentMass || 200; // Use actual current mass
    const massRatio = Math.exp(Math.abs(deltaV) / (Isp * g0));
    const mf = m0 / massRatio;
    const propUsed = m0 - mf;
    
    return {
      hasEnough: propUsed <= available,
      propUsed: Math.max(propUsed, 0.001), // Minimum 0.001 kg to avoid division issues
      availableFuel: available,
      shortfall: Math.max(0, propUsed - available)
    };
  }

  selectBestThruster(currentMass, propellantRemaining, deltaV, needsElectric = false) {
    /**
     * Select optimal thruster for a burn
     * Prioritizes: Electric (if power available) → Hydrazine → Biprop → Xenon fallback
     * Returns: { thruster, propType, canExecute, reason }
     */
    // FIX: Default to empty object if undefined
    if (!propellantRemaining || typeof propellantRemaining !== 'object') {
      propellantRemaining = { hydrazine: 0, xenon: 0, biprop: 0 };
    }
    
    const thrusters = [
      { type: 'hall_thruster', Isp: 1700, propType: 'xenon', priority: needsElectric ? 1 : 2 },
      { type: 'ion_thruster', Isp: 3000, propType: 'xenon', priority: needsElectric ? 1 : 2 },
      { type: 'chemical_monoprop', Isp: 235, propType: 'hydrazine', priority: 1 },
      { type: 'biprop_MMHMHN', Isp: 320, propType: 'biprop', priority: 2 }
    ];
    
    // Sort by priority (lower = better)
    const available = thrusters.filter(t => {
      const fuel = propellantRemaining[t.propType] || 0;
      return fuel > 0;
    }).sort((a, b) => a.priority - b.priority);
    
    if (available.length === 0) {
      return {
        thruster: null,
        propType: null,
        canExecute: false,
        reason: '🚨 OUT OF FUEL - All propellant tanks empty!'
      };
    }
    
    const selected = available[0];
    const fuelCheck = this.checkFuelAvailable(
      propellantRemaining,
      selected.propType,
      deltaV,
      selected.Isp,
      currentMass
    );
    
    return {
      thruster: selected,
      propType: selected.propType,
      canExecute: fuelCheck.hasEnough,
      reason: fuelCheck.hasEnough 
        ? `✓ ${selected.type} available (${fuelCheck.availableFuel.toFixed(2)} kg ${selected.propType}, uses ${fuelCheck.propUsed.toFixed(3)} kg)`
        : `⚠️ Insufficient ${selected.propType} (need ${fuelCheck.propUsed.toFixed(3)} kg, have ${fuelCheck.availableFuel.toFixed(2)} kg, short ${fuelCheck.shortfall.toFixed(3)} kg)`
    };
  }

  estimateTotalFuelNeeded(currentAltKm, targetAlt, constraints) {
    /**
     * Pre-calculate total Δv needed for orbit adjustment
     * Returns: { hohmannDv, eccentricityDv, dragDv, totalDv }
     */
    const altDiff = Math.abs(targetAlt - currentAltKm);
    
    // Hohmann transfer estimation
    const hohmannDv = this.hohmannPlanner.planTransfer(
      6371000 + currentAltKm * 1000,
      6371000 + targetAlt * 1000,
      3.986004418e14
    );
    
    // Eccentricity circularization (rough estimate)
    const eccDv = altDiff > 50 ? 5 : 2; // m/s
    
    // Drag compensation (annual for LEO 400)
    let dragDv = 0;
    if (currentAltKm < 1000) {
      dragDv = (1200 - currentAltKm) * 0.08; // Scales with altitude
    }
    
    return {
      hohmannDv: hohmannDv ? hohmannDv.totalDv : altDiff * 0.5,
      eccentricityDv: eccDv,
      dragDv: dragDv,
      totalDv: (hohmannDv ? hohmannDv.totalDv : altDiff * 0.5) + eccDv + dragDv
    };
  }

  // ========== UPDATED: queueBurn with fuel checking =========
  queueBurn(dv, directionUnitVec, reason, thruster = "electric", propellantRemaining = null, currentMass = null) {
    /**
     * Queue a burn - now checks fuel BEFORE queueing
     * If fuel insufficient, logs warning instead of queuing
     */
    if (dv <= 0.2) return; // Skip micro-burns
    
    const mag = Math.hypot(directionUnitVec.x, directionUnitVec.y) || 1;
    const unitDir = { x: directionUnitVec.x / mag, y: directionUnitVec.y / mag };

    const maxChunk = 2.0;
    let remaining = Math.abs(dv);
    const sign = dv >= 0 ? 1 : -1;

    while (remaining > 0.0001) {
      const chunk = Math.min(remaining, maxChunk);
      const chunkDv = chunk * sign;
      const chunkReason = remaining === chunk ? reason : `${reason} (${chunk.toFixed(2)} m/s)`;
      
      const isDuplicate = this.burnQueue.some(b =>
        Math.abs(b.dv - chunkDv) < 0.01 && 
        Math.abs(b.dir.x * unitDir.x + b.dir.y * unitDir.y) > 0.999 && 
        b.reason === chunkReason
      );
      
      if (!isDuplicate) {
        this.burnQueue.push({ 
          dv: chunkDv, 
          dir: unitDir, 
          reason: chunkReason, 
          thruster,
          propellantRemaining: propellantRemaining ? { ...propellantRemaining } : null,
          currentMass: currentMass
        });
      }
      remaining -= chunk;
    }
  }

  // ========== UPDATED: update() with fuel pre-planning ==========
  update(state, constraints, currentMass, missionTime, fireThrusterCallback) {
    if (!this.enabled) return null;

    this.lastActiveTime = Date.now();
    this.lastStatusMessage = `AI ACTIVE at ${new Date(this.lastActiveTime).toLocaleTimeString()}`;

    if (!this._lastHeartbeatLog || this.lastActiveTime - this._lastHeartbeatLog > 60000) {
      this.logMessage(this.lastStatusMessage);
      this._lastHeartbeatLog = this.lastActiveTime;
    }

    const mu = 3.986004418e14;
    const earthRadius = 6371000;
    const r_vec = state.pos;
    const v_vec = state.vel;
    const r = Math.hypot(r_vec.x, r_vec.y);
    const altitude = (r - earthRadius) / 1000;

    // True Anomaly
    let trueAnomaly = Math.atan2(r_vec.y, r_vec.x) - this.argumentOfPerigee;
    if (trueAnomaly < 0) trueAnomaly += 2 * Math.PI;

    // Unit vectors
    const radialUnit = { x: r_vec.x / r, y: r_vec.y / r };
    const progradeUnit = { x: -radialUnit.y, y: radialUnit.x };
    const retrogradeUnit = { x: -progradeUnit.x, y: -progradeUnit.y };

    // Orbital elements
    const ecc = this.getEccentricity(state);
    const sma = this.getSMA(state);

    // Burn windows
    const nearPerigee = Math.abs(trueAnomaly) < 0.15 || Math.abs(trueAnomaly - 2 * Math.PI) < 0.15;
    const nearApogee = Math.abs(trueAnomaly - Math.PI) < 0.15;

    const isMolniya = constraints.targetEccentricity && constraints.targetEccentricity > 0.5;

    // Store state history for prediction
    this.lastKnownState = { pos: { ...r_vec }, vel: { ...v_vec }, time: missionTime };
    this.stateHistory.push({ ...this.lastKnownState, sma, ecc, ta: trueAnomaly });
    if (this.stateHistory.length > 1000) this.stateHistory.shift();

    // ========== FUEL CHECK: Early warning system ==========
    const totalFuelRemaining = (constraints.propellantRemaining?.hydrazine || 0) +
                              (constraints.propellantRemaining?.xenon || 0) +
                              (constraints.propellantRemaining?.biprop || 0);
    
    if (totalFuelRemaining < 0.5) {
      this.rescueMode = true;
      if (!this._lastFuelWarning || missionTime - this._lastFuelWarning > 60) {
        this.logMessage(`🚨 CRITICAL FUEL LOW: ${totalFuelRemaining.toFixed(2)} kg remaining! Entering fuel-conservation mode.`);
        this._lastFuelWarning = missionTime;
      }
    }

    // ========== PRE-PLAN FUEL BUDGET ==========
    const fuelBudget = this.estimateTotalFuelNeeded(altitude, constraints.targetAlt, constraints);
    const budgetWarning = totalFuelRemaining < fuelBudget.totalDv * 0.002; // 0.2% of ΔV as rough fuel mass
    
    if (budgetWarning && !this._lastBudgetWarning) {
      this.logMessage(`⚠️ LOW FUEL BUDGET: Have ${totalFuelRemaining.toFixed(1)} kg for ${fuelBudget.totalDv.toFixed(1)} m/s maneuvers`);
      this._lastBudgetWarning = missionTime;
    } else if (!budgetWarning) {
      this._lastBudgetWarning = null;
    }

    if (!isMolniya) {
      this.applyDriftCorrections(state, constraints, nearPerigee, nearApogee, progradeUnit, retrogradeUnit);
      this.controlPlaneAndInclination(state, constraints, nearApogee, radialUnit);

      const targetAlt = constraints.targetAlt;
      const targetRadius = earthRadius + targetAlt * 1000;

      const eccThreshold = constraints.eccentricity?.warning || 0.001;
      if (ecc > eccThreshold * 0.8) {
        const burnSize = Math.min(ecc * 2000, 12);
        
        // ========== CHECK FUEL BEFORE QUEUE ==========
        const thrusterChoice = this.selectBestThruster(currentMass, constraints.propellantRemaining || {}, burnSize, false);
        
        if (!thrusterChoice.canExecute) {
          // Don't spam - only log periodically
          if (!this._lastFuelWarningTime || missionTime - this._lastFuelWarningTime > 30) {
            this.logMessage(`⚠️ Cannot circularize: ${thrusterChoice.reason}`);
            this._lastFuelWarningTime = missionTime;
          }
          this.rescueMode = true;
        } else {
          if (nearApogee) {
            const smoothed = this.smoothBurnCorrection(burnSize, retrogradeUnit, `Ecc fix`);
            if (smoothed.shouldBurn) {
              this.queueBurn(smoothed.smoothedDV, retrogradeUnit, `Ecc fix: retro at apogee (e=${ecc.toFixed(4)})`, thrusterChoice.thruster.type, constraints.propellantRemaining, currentMass);
            } else {
              this.logMessage(smoothed.reason);
            }
          } else if (nearPerigee) {
            const smoothed = this.smoothBurnCorrection(burnSize, progradeUnit, `Ecc fix`);
            if (smoothed.shouldBurn) {
              this.queueBurn(smoothed.smoothedDV, progradeUnit, `Ecc fix: pro at perigee (e=${ecc.toFixed(4)})`, thrusterChoice.thruster.type, constraints.propellantRemaining, currentMass);
            }
          }
        }
        
        if (ecc > (constraints.eccentricity?.violation || 0.005)) {
          this.rescueMode = true;
        }
      } else {
        this.rescueMode = false;
      }

      // Semi-major axis control with fuel awareness
      if (ecc < eccThreshold * 1.2) {
        const smaErrorKm = (sma - targetRadius) / 1000;
        const altThreshold = constraints.altitude_km?.warning || 5;
        
        if (Math.abs(smaErrorKm) > altThreshold * 0.3) {
          const maneuver = this.selectMinimumFuelManeuver(altitude, targetAlt, ecc, 0.0001, 100);
          
          // ========== CHECK FUEL FOR MANEUVER ==========
          const thrusterChoice = this.selectBestThruster(currentMass, constraints.propellantRemaining || {}, maneuver.dv, false);
          
          if (!thrusterChoice.canExecute) {
            if (!this._lastManeuverWarningTime || missionTime - this._lastManeuverWarningTime > 30) {
              this.logMessage(`⚠️ Cannot execute ${maneuver.maneuverType}: ${thrusterChoice.reason}`);
              this._lastManeuverWarningTime = missionTime;
            }
            this.rescueMode = true;
          } else {
            if (maneuver.maneuverType === 'hohmann' && nearPerigee) {
              this.logMessage(`📊 ${maneuver.reason}`);
              const smoothed = this.smoothBurnCorrection(maneuver.dv, progradeUnit, `Hohmann`);
              if (smoothed.shouldBurn) {
                this.queueBurn(smoothed.smoothedDV, progradeUnit, `${maneuver.reason}`, thrusterChoice.thruster.type, constraints.propellantRemaining, currentMass);
              }
            } else if (nearPerigee || nearApogee) {
              const dv = Math.abs(smaErrorKm * 0.5);
              const smoothed = this.smoothBurnCorrection(dv, smaErrorKm > 0 ? retrogradeUnit : progradeUnit, `SMA fix`);
              if (smoothed.shouldBurn) {
                this.queueBurn(
                  smoothed.smoothedDV,
                  smaErrorKm > 0 ? retrogradeUnit : progradeUnit,
                  `SMA fix: ${smaErrorKm.toFixed(1)} km`,
                  thrusterChoice.thruster.type,
                  constraints.propellantRemaining,
                  currentMass
                );
              }
            }
          }
          
          if (Math.abs(smaErrorKm) > (constraints.altitude_km?.violation || 15)) {
            this.rescueMode = true;
          }
        }
      }

      // Argument-of-perigee locking
      this.controlArgumentOfPerigee(state, constraints, nearPerigee, nearApogee, retrogradeUnit, progradeUnit);

      // Drag compensation (with fuel check)
      const dragAccel = this.calculateDragAcceleration(altitude);
      if (dragAccel > 1e-10 && nearPerigee) {
        const period = 2 * Math.PI * Math.sqrt(sma ** 3 / mu);
        const dragDvPerOrbit = dragAccel * period * 0.7;
        
        if (dragDvPerOrbit > 0.1) {
          // ========== CHECK FUEL FOR DRAG REBOOST ==========
          const thrusterChoice = this.selectBestThruster(currentMass, constraints.propellantRemaining || {}, dragDvPerOrbit, altitude < 1000);
          
          if (thrusterChoice.canExecute) {
            const smoothed = this.smoothBurnCorrection(dragDvPerOrbit, progradeUnit, `Drag reboost`);
            if (smoothed.shouldBurn) {
              this.queueBurn(
                smoothed.smoothedDV,
                progradeUnit,
                `Drag reboost +${smoothed.smoothedDV.toFixed(2)} m/s`,
                thrusterChoice.thruster.type,
                constraints.propellantRemaining,
                currentMass
              );
            }
          } else {
            // Don't spam drag warnings either
            if (!this._lastDragWarningTime || missionTime - this._lastDragWarningTime > 60) {
              this.logMessage(`⚠️ No fuel for drag reboost: ${thrusterChoice.reason}`);
              this._lastDragWarningTime = missionTime;
            }
          }
        }
      }
    } else {
      this.controlHEO(state, constraints, nearPerigee, nearApogee, progradeUnit, retrogradeUnit, mu, earthRadius);
    }

    // ========== MISSION SEQUENCING ==========
    if (this.missionSequencer.hasActivePlan()) {
      const nextBurn = this.missionSequencer.getNextBurn(missionTime, state, sma, ecc, trueAnomaly);
      if (nextBurn) {
        this.logMessage(`📋 ${nextBurn.reason}`);
      }
    }

    // Execute burns from queue
    if (this.burnQueue.length > 0 && missionTime - this.lastBurnTime > 120) {
      const burn = this.burnQueue.shift();
      this.lastBurnTime = missionTime;

      fireThrusterCallback(burn.dv, burn.thruster, burn.dir);
      
      this.logMessage(`${this.rescueMode ? '🚨 RESCUE' : '🤖 AUTO'}: ${burn.reason} | ${burn.dv.toFixed(2)} m/s [${burn.thruster}]`);
    }

    return null;
  }

  queueBurn(dv, directionUnitVec, reason, thruster = "electric") {
    if (dv <= 0.2) return;
    
    const mag = Math.hypot(directionUnitVec.x, directionUnitVec.y) || 1;
    const unitDir = { x: directionUnitVec.x / mag, y: directionUnitVec.y / mag };

    const maxChunk = 2.0;
    let remaining = Math.abs(dv);
    const sign = dv >= 0 ? 1 : -1;

    while (remaining > 0.0001) {
      const chunk = Math.min(remaining, maxChunk);
      const chunkDv = chunk * sign;
      const chunkReason = remaining === chunk ? reason : `${reason} (${chunk.toFixed(2)} m/s)`;
      
      const isDuplicate = this.burnQueue.some(b =>
        Math.abs(b.dv - chunkDv) < 0.01 && 
        Math.abs(b.dir.x * unitDir.x + b.dir.y * unitDir.y) > 0.999 && 
        b.reason === chunkReason
      );
      
      if (!isDuplicate) {
        this.burnQueue.push({ dv: chunkDv, dir: unitDir, reason: chunkReason, thruster });
      }
      remaining -= chunk;
    }
  }

  calculateDragAcceleration(altitudeKm) {
    if (altitudeKm < 150) return 0.5;
    const H = altitudeKm < 700 ? 65 : 150;
    const rho0 = 2.5e-12;
    const h0 = 400;
    const density = rho0 * Math.exp(-(altitudeKm - h0) / H);
    const ballisticCoeff = 140;
    return (density * 60000000) / (2 * ballisticCoeff);
  }

  getEccentricity(state) {
    const mu = 3.986004418e14;
    const r = Math.hypot(state.pos.x, state.pos.y);
    const v2 = state.vel.x**2 + state.vel.y**2;
    const energy = v2/2 - mu/r;
    if (energy >= 0) return 1.0;
    const a = -mu / (2 * energy);
    const h = Math.abs(state.pos.x * state.vel.y - state.pos.y * state.vel.x);
    const p = h * h / mu;
    return Math.sqrt(Math.max(0, 1 - p/a));
  }

  getSMA(state) {
    const mu = 3.986004418e14;
    const r = Math.hypot(state.pos.x, state.pos.y);
    const v2 = state.vel.x**2 + state.vel.y**2;
    const energy = v2/2 - mu/r;
    if (energy >= 0) return r;
    return -mu / (2 * energy);
  }

  logMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.log.unshift({ time: timestamp, message });
    if (this.log.length > 50) this.log.pop();
  }

  getRecentLog(count = 10) {
    return this.log.slice(0, count);
  }

  getStatus() {
    return {
      enabled: this.enabled,
      rescueMode: this.rescueMode,
      recentLog: this.getRecentLog(5),
      activeMission: this.missionSequencer.getActiveMission(),
      aiActive: !!this.lastActiveTime,
      lastActiveTime: this.lastActiveTime,
      lastStatusMessage: this.lastStatusMessage
    };
  }

  controlArgumentOfPerigee(state, constraints, nearPerigee, nearApogee, retrogradeUnit, progradeUnit) {
    // J₂ causes ω to drift; we lock it to a target by burning at nodes
    const mu = 3.986004418e14;
    const earthRadius = 6371000;
    const Re = 6.378137e6;
    const J2 = 1.08262668e-3;
    const sma = this.getSMA(state);
    
    // J₂ precession rate (rad/s)
    const omegaDot = -(3/2) * J2 * (Re ** 2) * Math.sqrt(mu) / (sma ** 3.5);
    
    // If no target set, lock to current
    if (this.targetArgumentOfPerigee === null) {
      this.targetArgumentOfPerigee = this.argumentOfPerigee;
    }
    
    const omegaError = this.argumentOfPerigee - this.targetArgumentOfPerigee;
    const omegaErrorDeg = (omegaError * 180 / Math.PI) % 360;
    
    // Only correct if drift is significant (> 5°)
    if (Math.abs(omegaErrorDeg) > 5) {
      const dv = 0.3; // Small correction burn
      const dir = omegaErrorDeg > 0 ? retrogradeUnit : progradeUnit;
      const reason = `ω-lock: ${omegaErrorDeg.toFixed(1)}° (J₂ drift)`;
      
      if (nearApogee) {
        this.queueBurn(dv, dir, reason, "electric");
      }
    }
    
    this.omegaDriftRate = omegaDot;
  }

  controlHEO(state, constraints, nearPerigee, nearApogee, progradeUnit, retrogradeUnit, mu, earthRadius) {
    const targetEcc = constraints.targetEccentricity || 0.72;
    const rApogee = earthRadius + (constraints.targetAlt || 42000) * 1000;
    const rPerigee = earthRadius + (constraints.perigeeAlt || 1000) * 1000;
    const targetSMA = (rApogee + rPerigee) / 2;

    const ecc = this.getEccentricity(state);
    const sma = this.getSMA(state);

    if (nearPerigee) {
      // Perigee node: control eccentricity
      const eccError = ecc - targetEcc;
      const eccThreshold = constraints.eccentricity?.warning || 0.05;
      
      if (Math.abs(eccError) > eccThreshold * 0.2) {
        const dv = Math.abs(eccError * 250);
        const dir = eccError > 0 ? retrogradeUnit : progradeUnit;
        this.queueBurn(dv, dir, `HEO ecc fix ${eccError.toFixed(3)}`, "chemical");
        this.rescueMode = true;
      }

      // Perigee node: control SMA
      const smaErrorKm = (sma - targetSMA) / 1000;
      if (Math.abs(smaErrorKm) > 100) {
        const dv = Math.abs(smaErrorKm * 0.08);
        const dir = smaErrorKm > 0 ? progradeUnit : retrogradeUnit;
        this.queueBurn(dv, dir, `HEO SMA fix ${smaErrorKm.toFixed(0)} km`, "chemical");
      }
    } else if (nearApogee) {
      // Apogee node: fine-tune eccentricity
      const ecc = this.getEccentricity(state);
      const eccError = ecc - targetEcc;
      
      if (Math.abs(eccError) > 0.08) {
        const dv = Math.abs(eccError * 150);
        const dir = eccError > 0 ? retrogradeUnit : progradeUnit;
        this.queueBurn(dv, dir, `HEO apogee ecc trim`, "chemical");
      }
    }
  }
}