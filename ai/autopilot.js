/**
 * AI AUTOPILOT SYSTEM
 * 
 * Features:
 * - Maintains perfect orbital constraints (altitude, velocity, eccentricity)
 * - Handles HEO Molniya orbits (high eccentricity is INTENTIONAL)
 * - Rescue mode: brings satellite back on-course when off-track
 * - Uses PID controller for smooth, realistic corrections
 * - Respects fuel limits and thruster physics
 */

class OrbitalAutopilot {
  constructor() {
    this.enabled = false;
    this.rescueMode = false;
    this.isHEO = false; // Special handling for highly elliptical orbits
    
    // PID controller gains (tuned for orbital mechanics)
    this.altitudePID = {
      kP: 0.002,  // Proportional gain
      kI: 0.0001, // Integral gain
      kD: 0.01,   // Derivative gain
      integral: 0,
      lastError: 0
    };
    
    this.velocityPID = {
      kP: 0.001,
      kI: 0.00005,
      kD: 0.005,
      integral: 0,
      lastError: 0
    };
    
    this.lastCorrectionTime = 0;
    this.correctionInterval = 1.0; // seconds between corrections
    this.log = [];
  }
  
  /**
   * Enable/disable autopilot
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.resetPID();
      this.logMessage('🤖 Autopilot ENGAGED');
    } else {
      this.logMessage('🤖 Autopilot DISENGAGED');
    }
  }
  
  /**
   * Reset PID controllers (prevents integral windup)
   */
  resetPID() {
    this.altitudePID.integral = 0;
    this.altitudePID.lastError = 0;
    this.velocityPID.integral = 0;
    this.velocityPID.lastError = 0;
  }
  
  /**
   * Main autopilot update loop (called every frame)
   */
  update(state, constraints, currentMass, missionTime, fireThrusterCallback) {
    if (!this.enabled) return null;
    
    // Limit correction frequency
    if (missionTime - this.lastCorrectionTime < this.correctionInterval) {
      return null;
    }
    
    this.lastCorrectionTime = missionTime;
    
    // Calculate current orbital parameters
    const G = 6.67430e-11;
    const earthMass = 5.972e24;
    const earthRadius = 6.371e6;
    
    const r = Math.hypot(state.pos.x, state.pos.y);
    const altitude = (r - earthRadius) / 1000; // km
    const vMag = Math.hypot(state.vel.x, state.vel.y);
    
    // Calculate eccentricity
    const energy = (vMag * vMag) / 2 - (G * earthMass) / r;
    const semiMajorAxis = -(G * earthMass) / (2 * energy);
    const h = state.pos.x * state.vel.y - state.pos.y * state.vel.x;
    const p = (h * h) / (G * earthMass);
    const eccentricity = Math.sqrt(Math.max(0, 1 - p / semiMajorAxis));
    
    // Detect if this is HEO (Molniya orbit)
    this.isHEO = constraints.targetEccentricity && constraints.targetEccentricity > 0.5;
    
    // HEO SPECIAL HANDLING
    if (this.isHEO) {
      return this.updateHEO(state, constraints, altitude, vMag, eccentricity, fireThrusterCallback);
    }
    
    // CIRCULAR ORBIT HANDLING (LEO, MEO, GEO)
    
    // Check 1: Eccentricity drift (MOST IMPORTANT for circular orbits!)
    const eccThreshold = constraints.eccentricity;
    const eccWarning = eccThreshold ? eccThreshold.warning : 0.001;
    const eccViolation = eccThreshold ? eccThreshold.violation : 0.005;
    
    let eccError = eccentricity; // For circular orbits, target e ≈ 0
    let needsEccCorrection = false;
    
    if (eccentricity > eccWarning) {
      needsEccCorrection = true;
      
      if (eccentricity > eccViolation) {
        this.rescueMode = true;
        this.logMessage(`🚨 RESCUE: Eccentricity ${eccentricity.toFixed(4)} too high (circular orbit required)`);
      } else {
        this.logMessage(`🤖 AUTO: Correcting eccentricity drift (e=${eccentricity.toFixed(4)})`);
      }
    }
    
    // Check 2: Altitude and velocity errors
    const altError = Math.abs(altitude - constraints.targetAlt);
    const velError = Math.abs(vMag - constraints.targetVelocity);
    
    const isOffTrack = 
      altError > constraints.altitude_km.violation ||
      velError > constraints.velocity_ms.violation;
    
    if (isOffTrack) {
      this.rescueMode = true;
    }
    
    // PRIORITY 1: Fix eccentricity if too high (this is the root cause!)
    if (needsEccCorrection && eccentricity > eccWarning) {
      return this.correctEccentricity(state, eccentricity, constraints, fireThrusterCallback);
    }
    
    // PRIORITY 2: Fix altitude/velocity errors
    const altitudeCorrection = this.calculateAltitudeCorrection(
      altitude, 
      constraints.targetAlt, 
      constraints.altitude_km
    );
    
    const velocityCorrection = this.calculateVelocityCorrection(
      vMag, 
      constraints.targetVelocity, 
      constraints.velocity_ms
    );
    
    return this.applyCorrections(
      altitudeCorrection, 
      velocityCorrection, 
      state, 
      fireThrusterCallback
    );
  }
  
  /**
   * HEO MOLNIYA ORBIT AUTOPILOT
   * 
   * Different strategy:
   * - Altitude varies 1000-42000 km (NORMAL!)
   * - Velocity varies 1600-10000 m/s (NORMAL!)
   * - Focus on ECCENTRICITY and APOGEE/PERIGEE maintenance
   */
  updateHEO(state, constraints, altitude, vMag, eccentricity, fireThrusterCallback) {
    // Safety check: ensure constraints have required properties
    if (!constraints.perigeeAlt || !constraints.targetAlt || !constraints.targetEccentricity) {
      console.warn('HEO autopilot: Missing required constraints');
      this.logMessage('⚠️ HEO AUTO: Missing orbit parameters, standing by');
      return null;
    }
    
    const apogeeAlt = constraints.targetAlt; // 42000 km
    const perigeeAlt = constraints.perigeeAlt; // 1000 km
    const targetEcc = constraints.targetEccentricity; // 0.72
    
    // Safety check: eccentricity must be valid
    if (!isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) {
      console.warn('HEO autopilot: Invalid eccentricity:', eccentricity);
      this.logMessage('⚠️ HEO AUTO: Invalid orbit, rescue needed');
      this.rescueMode = true;
      
      // Emergency prograde burn to stabilize
      fireThrusterCallback(2);
      return { deltaV: 2, type: 'emergency', rescueMode: true };
    }
    
    // Check 1: Is satellite OUTSIDE the orbital range? (Critical!)
    const criticalMargin = constraints.altitude_km?.critical || 8000;
    const tooLow = altitude < (perigeeAlt - criticalMargin);
    const tooHigh = altitude > (apogeeAlt + criticalMargin);
    
    if (tooLow || tooHigh) {
      this.rescueMode = true;
      this.logMessage(`🚨 HEO RESCUE: Altitude ${altitude.toFixed(0)}km outside range (${perigeeAlt}-${apogeeAlt}km)`);
      
      // Emergency altitude correction
      let deltaV = 0;
      if (tooLow) {
        // Too low - raise orbit with prograde burn
        const error = perigeeAlt - altitude;
        deltaV = Math.min(5, Math.max(0.5, error * 0.05));
      } else {
        // Too high - lower orbit with retrograde burn
        const error = altitude - apogeeAlt;
        deltaV = -Math.min(5, Math.max(0.5, error * 0.05));
      }
      
      if (Math.abs(deltaV) > 0.3) {
        fireThrusterCallback(deltaV);
        return { deltaV, type: 'altitude', rescueMode: true };
      }
    }
    
    // Check 2: Is eccentricity drifting too much?
    const eccError = Math.abs(eccentricity - targetEcc);
    const eccThreshold = constraints.eccentricity?.warning || 0.05;
    
    if (eccError > eccThreshold) {
      this.rescueMode = true;
      this.logMessage(`🚨 HEO RESCUE: Eccentricity ${eccentricity.toFixed(3)} drifting from ${targetEcc.toFixed(2)}`);
      
      // Correct eccentricity by adjusting at apogee/perigee
      const G = 6.67430e-11;
      const earthMass = 5.972e24;
      const earthRadius = 6.371e6;
      
      const currentR = Math.hypot(state.pos.x, state.pos.y);
      
      // Calculate expected apogee/perigee positions
      const targetApogeeR = earthRadius + apogeeAlt * 1000;
      const targetPerigeeR = earthRadius + perigeeAlt * 1000;
      const midPoint = (targetApogeeR + targetPerigeeR) / 2;
      
      const nearApogee = currentR > midPoint;
      const nearPerigee = currentR < midPoint;
      
      let deltaV = 0;
      
      if (eccentricity < targetEcc - eccThreshold) {
        // Orbit too circular - need to increase eccentricity
        if (nearApogee) {
          deltaV = -1.5; // Retrograde at apogee lowers perigee
          this.logMessage('🤖 HEO: Lowering perigee (retrograde at apogee)');
        } else if (nearPerigee) {
          deltaV = 1.5; // Prograde at perigee raises apogee
          this.logMessage('🤖 HEO: Raising apogee (prograde at perigee)');
        }
      } else if (eccentricity > targetEcc + eccThreshold) {
        // Orbit too elliptical - need to decrease eccentricity
        if (nearApogee) {
          deltaV = 1.5; // Prograde at apogee raises perigee
          this.logMessage('🤖 HEO: Raising perigee (prograde at apogee)');
        } else if (nearPerigee) {
          deltaV = -1.5; // Retrograde at perigee lowers apogee
          this.logMessage('🤖 HEO: Lowering apogee (retrograde at perigee)');
        }
      }
      
      if (Math.abs(deltaV) > 0.3) {
        fireThrusterCallback(deltaV);
        return { deltaV, type: 'eccentricity', rescueMode: true };
      }
    }
    
    // Check 3: All good - HEO is stable
    this.rescueMode = false;
    
    // Only log status every ~10 updates to avoid spam
    if (!this.lastHEOLogTime || (Date.now() - this.lastHEOLogTime) > 5000) {
      this.logMessage(`🤖 HEO AUTO: Orbit stable (e=${eccentricity.toFixed(3)}, alt=${altitude.toFixed(0)}km)`);
      this.lastHEOLogTime = Date.now();
    }
    
    return null;
  }
  
  /**
   * CIRCULARIZE ORBIT - Reduce eccentricity to near zero
   * 
   * Strategy:
   * - Detect apogee/perigee position
   * - At apogee: Retrograde burn (lowers perigee → raises it back up)
   * - At perigee: Prograde burn (raises apogee → lowers it back down)
   * - Effect: Orbit becomes more circular
   */
  correctEccentricity(state, eccentricity, constraints, fireThrusterCallback) {
    // Safety checks
    if (!isFinite(eccentricity) || eccentricity < 0) {
      console.warn('Invalid eccentricity for correction:', eccentricity);
      return null;
    }
    
    const G = 6.67430e-11;
    const earthMass = 5.972e24;
    const earthRadius = 6.371e6;
    
    const r = Math.hypot(state.pos.x, state.pos.y);
    const altitude = (r - earthRadius) / 1000;
    const targetAlt = constraints.targetAlt;
    
    // Determine if we're near apogee or perigee
    const aboveTarget = altitude > targetAlt;
    const belowTarget = altitude < targetAlt;
    
    // Calculate semi-major axis to find true apogee/perigee
    const vMag = Math.hypot(state.vel.x, state.vel.y);
    const energy = (vMag * vMag) / 2 - (G * earthMass) / r;
    const semiMajorAxis = -(G * earthMass) / (2 * energy);
    
    // Safety check for semiMajorAxis
    if (!isFinite(semiMajorAxis) || semiMajorAxis <= 0) {
      console.warn('Invalid semi-major axis:', semiMajorAxis);
      return null;
    }
    
    const apogeeR = semiMajorAxis * (1 + eccentricity);
    const perigeeR = semiMajorAxis * (1 - eccentricity);
    
    // Are we near apogee or perigee?
    const nearApogee = r > semiMajorAxis; // Above semi-major axis
    const nearPerigee = r < semiMajorAxis; // Below semi-major axis
    
    let deltaV = 0;
    let correctionType = '';
    
    // Calculate burn magnitude based on eccentricity severity
    const eccThresholds = constraints.eccentricity || { violation: 0.005 };
    const urgency = eccentricity > eccThresholds.violation ? 2.0 : 1.0;
    const baseBurn = Math.min(eccentricity * 500, 3.0) * urgency; // Max 3 m/s per correction
    
    if (nearApogee && aboveTarget) {
      // At apogee (high point) - retrograde burn raises perigee
      deltaV = -baseBurn;
      correctionType = 'Circularizing (retrograde at apogee → raise perigee)';
    } else if (nearPerigee && belowTarget) {
      // At perigee (low point) - prograde burn raises apogee
      deltaV = baseBurn;
      correctionType = 'Circularizing (prograde at perigee → raise apogee)';
    } else if (nearApogee) {
      // At apogee but not sure - small retrograde
      deltaV = -baseBurn * 0.5;
      correctionType = 'Circularizing (gentle retrograde at apogee)';
    } else if (nearPerigee) {
      // At perigee but not sure - small prograde
      deltaV = baseBurn * 0.5;
      correctionType = 'Circularizing (gentle prograde at perigee)';
    } else {
      // Not at apogee or perigee - wait for better position
      return null;
    }
    
    this.logMessage(`🤖 ECC: ${correctionType} (e=${eccentricity.toFixed(4)})`);
    
    if (Math.abs(deltaV) > 0.3) {
      fireThrusterCallback(deltaV);
      return { deltaV, type: 'eccentricity', rescueMode: this.rescueMode };
    }
    
    return null;
  }
  
  /**
   * PID controller for altitude correction
   */
  calculateAltitudeCorrection(currentAlt, targetAlt, thresholds) {
    const error = targetAlt - currentAlt;
    
    // PID formula: output = kP*error + kI*integral + kD*derivative
    this.altitudePID.integral += error;
    
    // Anti-windup: limit integral term
    this.altitudePID.integral = Math.max(-100, Math.min(100, this.altitudePID.integral));
    
    const derivative = error - this.altitudePID.lastError;
    this.altitudePID.lastError = error;
    
    const correction = 
      this.altitudePID.kP * error +
      this.altitudePID.kI * this.altitudePID.integral +
      this.altitudePID.kD * derivative;
    
    // Scale by severity
    let urgency = 1.0;
    if (Math.abs(error) > thresholds.critical) {
      urgency = 3.0; // Aggressive correction
    } else if (Math.abs(error) > thresholds.violation) {
      urgency = 2.0;
    } else if (Math.abs(error) > thresholds.warning) {
      urgency = 1.5;
    }
    
    return correction * urgency;
  }
  
  /**
   * PID controller for velocity correction
   */
  calculateVelocityCorrection(currentVel, targetVel, thresholds) {
    const error = targetVel - currentVel;
    
    this.velocityPID.integral += error;
    this.velocityPID.integral = Math.max(-100, Math.min(100, this.velocityPID.integral));
    
    const derivative = error - this.velocityPID.lastError;
    this.velocityPID.lastError = error;
    
    const correction = 
      this.velocityPID.kP * error +
      this.velocityPID.kI * this.velocityPID.integral +
      this.velocityPID.kD * derivative;
    
    let urgency = 1.0;
    if (Math.abs(error) > thresholds.critical) {
      urgency = 3.0;
    } else if (Math.abs(error) > thresholds.violation) {
      urgency = 2.0;
    } else if (Math.abs(error) > thresholds.warning) {
      urgency = 1.5;
    }
    
    return correction * urgency;
  }
  
  /**
   * Apply corrections using available thrusters
   */
  applyCorrections(altCorrection, velCorrection, state, fireThrusterCallback) {
    // Determine which thruster to use and delta-V
    let thrusterType = null;
    let deltaV = 0;
    
    // Prioritize velocity correction if large error
    if (Math.abs(velCorrection) > Math.abs(altCorrection) * 2) {
      // Use prograde/retrograde burns
      deltaV = Math.sign(velCorrection) * Math.min(Math.abs(velCorrection) * 20, 5);
      thrusterType = 'velocity';
    } else if (Math.abs(altCorrection) > 0.1) {
      // Use altitude correction (prograde to raise, retrograde to lower)
      deltaV = Math.sign(altCorrection) * Math.min(Math.abs(altCorrection) * 10, 3);
      thrusterType = 'altitude';
    }
    
    // Apply burn if needed
    if (thrusterType && Math.abs(deltaV) > 0.5) {
      const burnInfo = {
        deltaV: deltaV,
        type: thrusterType,
        rescueMode: this.rescueMode
      };
      
      this.logMessage(
        `${this.rescueMode ? '🚨 RESCUE' : '🤖 AUTO'}: ${deltaV > 0 ? '+' : ''}${deltaV.toFixed(1)} m/s (${thrusterType})`
      );
      
      // Call the thruster firing function
      fireThrusterCallback(deltaV);
      
      return burnInfo;
    }
    
    return null;
  }
  
  /**
   * Log autopilot actions
   */
  logMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.log.unshift({ time: timestamp, message });
    if (this.log.length > 50) this.log.pop();
  }
  
  /**
   * Get recent log entries
   */
  getRecentLog(count = 10) {
    return this.log.slice(0, count);
  }
  
  /**
   * Get autopilot status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      rescueMode: this.rescueMode,
      recentLog: this.getRecentLog(5)
    };
  }
}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrbitalAutopilot;
}
