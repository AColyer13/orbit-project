# 🛰️ Satellite Orbit Sandbox

An interactive **realistic satellite orbit simulator** with real-world physics, propulsion systems, and orbital constraints.

## 🚀 Features

### **Realistic Orbital Mechanics**
- **Newtonian gravity simulation** using actual physical constants
- **Orbital elements tracking**: altitude, velocity, eccentricity
- **Escape velocity monitoring** - prevents accidental interplanetary trajectories
- **Collision detection** - satellite crashes if altitude drops to Earth's surface

### **Six Orbital Regimes**
1. **LEO 400 km** - Low Earth Orbit (ISS-style)
2. **SSO 550 km** - Sun-Synchronous Orbit (imaging satellites)
3. **LEO 1200 km** - High LEO (scientific satellites)
4. **MEO 20,200 km** - Medium Earth Orbit (GPS constellation)
5. **GEO 35,786 km** - Geostationary Orbit (communications satellites)
6. **HEO 42,000 km** - Highly Elliptical Orbit (Molniya, e=0.72)

### **Realistic Propulsion Systems**

#### **Chemical Thrusters** 🔥
- **Monopropellant (Hydrazine)**: Isp 235s, 22N thrust
- **Bipropellant (MMH/NTO)**: Isp 320s, 100-400N thrust
- **Fast burns** (seconds to complete)
- **Higher fuel consumption**

#### **Electric Thrusters** ⚡
- **Hall Thrusters**: Isp 1700-1800s, 0.04-0.15N thrust
- **Ion Thrusters**: Isp 3000s, 0.05-0.08N thrust
- **Slow burns** (minutes to hours to complete)
- **Very fuel efficient** (uses xenon + battery power)

### **Power Systems**
- **Solar arrays** generate power in sunlight
- **Battery storage** for eclipse periods
- **Orbital eclipse simulation** - shadow cast by Earth
- **Electric thrusters require battery power**

### **Orbital Constraints**

#### **Real World Mode** (Strict)
Based on actual satellite operational requirements:

| Orbit | Altitude Tolerance | Velocity Tolerance | Eccentricity Limit |
|-------|-------------------|-------------------|-------------------|
| LEO 400 km | ±5 km (warning) | ±20 m/s | < 0.0005 |
| SSO 550 km | ±5 km | ±20 m/s | < 0.0005 |
| MEO 20,200 km | ±3 km | ±15 m/s | < 0.002 |
| GEO 35,786 km | ±15 km | ±10 m/s | < 0.0002 |
| HEO Molniya | 1000-42000 km | Variable | ~0.72 |

#### **Easy Mode** (Relaxed)
- **5-10x more tolerant** constraints
- Good for learning orbital mechanics

### **Safety Features**

#### **Escape Velocity Warning** ⚠️
**Applied to ALL satellites** - prevents loss of spacecraft!

| Altitude | Escape Velocity | Warning Threshold |
|----------|----------------|-------------------|
| 400 km LEO | ~10,800 m/s | >10,260 m/s (95%) |
| 20,200 km MEO | ~5,300 m/s | >5,035 m/s (95%) |
| 35,786 km GEO | ~4,300 m/s | >4,085 m/s (95%) |

**If velocity exceeds 95% of escape velocity:**
- Status: **CRITICAL**
- Warning: `⚠️ ESCAPE VELOCITY! Satellite will leave Earth orbit!`

---

## 🎮 Controls

### **RCS Thrusters** (Arrow Keys)
- **Purpose**: Attitude control, small corrections
- **Propellant**: Hydrazine (chemical)
- **Thrust**: Continuous while held
- **Use**: Quick adjustments, emergency maneuvers

### **Orbital Maneuver Thrusters** (Buttons)
- **Purpose**: Orbit changes, station-keeping
- **Types**: Chemical (fast) or Electric (slow but efficient)
- **Thrust**: Impulsive burns (instant delta-V)
- **Use**: Major orbit adjustments

---

## 📊 Physics & Math

### **Gravity**
```
F = G * M * m / r²
```
- `G = 6.674 × 10⁻¹¹ m³/kg·s²`
- `M = 5.972 × 10²⁴ kg` (Earth mass)

### **Escape Velocity**
```
v_escape = √(2 * G * M / r)
```
**Why it matters:**
- If `velocity ≥ v_escape`, satellite leaves Earth's gravity well
- Simulator warns at **95% of escape velocity**
- Prevents accidental "launches to Mars"

### **Rocket Equation** (Tsiolkovsky)
```
ΔV = Isp * g₀ * ln(m₀ / m_f)
```
- `Isp`: Specific impulse (efficiency)
- `g₀ = 9.80665 m/s²`
- Higher Isp = less fuel used

### **Burn Duration**
```
t = ΔV / (Thrust / Mass)
```
**Examples:**
- **Chemical (22N, 265kg sat, 20 m/s)**: ~2.4 seconds
- **Hall thruster (0.04N, 265kg sat, 2 m/s)**: ~13,250 seconds (~3.7 hours!)

### **Orbital Elements**
- **Semi-major axis**: `a = -G*M / (2*E)` where `E = v²/2 - G*M/r`
- **Eccentricity**: `e = √(1 - p/a)` where `p = h²/(G*M)`
- **Circular orbit**: `e ≈ 0`
- **Elliptical orbit**: `0 < e < 1`

---

## 🛠️ Realistic Fuel Loads

| Satellite | Hydrazine | Xenon | Bipropellant | Mission Duration |
|-----------|-----------|-------|--------------|------------------|
| LEO 400 km | 60 kg | 5 kg | - | 2-3 years |
| SSO 550 km | 40 kg | 6 kg | - | 3-5 years |
| LEO 1200 km | 12 kg | - | - | 5+ years |
| MEO GPS | 30 kg | 18 kg | - | 10-15 years |
| GEO Comsat | - | 100 kg | 800 kg | 15 years |
| HEO Molniya | - | 30 kg | 120 kg | 3-5 years |

---

## 🎯 Mission Scenarios

### **1. Station-Keeping (GEO)**
- **Challenge**: Maintain exact 35,786 km altitude
- **Constraints**: ±15 km altitude, ±10 m/s velocity
- **Strategy**: Use Hall thrusters (efficient) for N-S corrections

### **2. Drag Makeup (LEO 400 km)**
- **Challenge**: Atmospheric drag lowers orbit over time
- **Constraints**: ±5 km altitude (very tight!)
- **Strategy**: Frequent small chemical burns or continuous electric thrust

### **3. HEO Molniya**
- **Challenge**: Maintain highly elliptical orbit
- **Altitude range**: 1,000 km (perigee) to 42,000 km (apogee)
- **Velocity range**: ~10,000 m/s (perigee) to ~1,600 m/s (apogee)
- **Strategy**: Adjust apogee/perigee using biprop engine

---

## ⚠️ Common Mistakes

### **1. Running Out of Battery (Electric Thrusters)**
- **Problem**: Electric burns require battery + xenon
- **Solution**: Wait for sunlight to recharge (☀️ icon)

### **2. Approaching Escape Velocity**
- **Problem**: Too many prograde burns at LEO
- **Warning**: `⚠️ ESCAPE VELOCITY!`
- **Solution**: Use retrograde burns to slow down

### **3. Crashing into Earth**
- **Problem**: Retrograde burns lower perigee below surface
- **Warning**: Altitude < 0 km
- **Solution**: Use prograde burns to raise orbit

### **4. Fuel Depletion**
- **Problem**: No more hydrazine/xenon/biprop
- **Solution**: Mission over - must reset satellite

---

## ⚠️ Why Eccentricity Matters

### **What is Eccentricity?**
**Eccentricity (e)** measures how "elliptical" an orbit is:
- **e = 0**: Perfect circle
- **0 < e < 1**: Ellipse (oval shape)
- **e = 1**: Parabola (escape trajectory)

### **Why Circular Orbits (Low e) Are Critical**

#### **1. LEO 400 km - Atmospheric Drag** 🔥
**Problem:** High eccentricity creates varying altitude
```
Circular (e=0.0001): Uniform 400 km altitude ✅
Elliptical (e=0.01): Perigee ~340 km, Apogee ~460 km ❌
```
**At 340 km:** Atmospheric density is **10x higher** than 400 km!
- **Result**: Massive drag at perigee → orbit decays rapidly → satellite burns up
- **ISS docking**: Requires precise circular orbit for safety

#### **2. SSO 550 km - Imaging Quality** 📷
**Problem:** Varying altitude ruins photos
```
At perigee (500 km): Ground objects appear LARGE (high resolution)
At apogee (600 km): Ground objects appear SMALL (low resolution)
```
**Result**: 
- Cannot create accurate maps (resolution varies across image)
- Loses sun-synchronous characteristics (orbit precession changes)
- Mission failure for Earth observation

#### **3. MEO 20,200 km - GPS Timing** 🛰️
**Problem:** Eccentricity causes velocity variations
```
Circular orbit: Constant velocity → predictable timing ✅
Elliptical orbit: Fast at perigee, slow at apogee ❌
```
**Einstein's Relativity:**
- GPS requires **nanosecond precision**
- Velocity changes → time dilation varies → **timing errors**
- **Your phone's GPS becomes inaccurate!**

**Coverage gaps:** Satellites move at different speeds → uneven constellation spacing

#### **4. GEO 35,786 km - "Fixed" in Sky** 📡
**Problem:** Eccentricity makes satellite drift
```
Circular (e=0.0002): Appears FIXED in sky (true geostationary) ✅
Elliptical (e>0.001): Drifts north-south and east-west ❌
```
**Result**:
- Ground antennas must **track satellite** (expensive dishes required!)
- **Signal dropouts** as satellite moves out of beam
- **Not geostationary** = mission failure for TV/internet

### **Why HEO Molniya Has HIGH Eccentricity**

**Molniya: e = 0.72** (highly elliptical) - **This is intentional!** ✅

**Purpose:**
- **Apogee** (42,000 km): Satellite moves **slowly** → 8+ hour dwell time over target
- **Perigee** (1,000 km): Fast pass through Southern hemisphere
- **Use case**: Russia, Canada, Alaska coverage (high latitudes where GEO doesn't work)

**Advantages:**
- Long dwell time at high latitudes
- 3 satellites in Molniya constellation = 24/7 coverage
- Alternative to GEO for polar regions

---

## 🔬 Orbital Mechanics Deep Dive

### **Eccentricity Formula**
```
e = √(1 - p/a)
```
Where:
- `p = h² / (G*M)` (semi-latus rectum)
- `a = -G*M / (2*E)` (semi-major axis)
- `h = angular momentum`

### **Altitude Variation with Eccentricity**

| Orbit (400 km) | e | Perigee | Apogee | Δ Altitude |
|----------------|---|---------|--------|------------|
| ISS (ideal) | 0.0001 | 399.8 km | 400.2 km | 0.4 km ✅ |
| Degraded | 0.005 | 392 km | 408 km | 16 km ⚠️ |
| Critical | 0.01 | 384 km | 416 km | 32 km ❌ |

**At 384 km:** Atmospheric drag is **~3x higher** than 400 km → rapid orbit decay!

### **Real-World Consequences**

#### **ISS (LEO 400 km)**
- **Actual eccentricity**: ~0.0005
- **Reboost frequency**: Every 30-60 days (due to drag)
- **If e > 0.002**: Reboost needed every week → unsustainable fuel usage

#### **GPS Satellites (MEO 20,200 km)**
- **Actual eccentricity**: < 0.02 (design spec)
- **Typical in practice**: < 0.005
- **Position accuracy**: ±1 meter (requires e < 0.01)

#### **GEO Communications**
- **Actual eccentricity**: < 0.0002
- **Station-keeping**: N-S and E-W corrections weekly
- **Fuel budget**: 15-year lifespan depends on low eccentricity

---

## 🎓 Educational Examples

### **Experiment: Break Your Orbit!**

**Try this in the simulator:**

1. **Start**: LEO 400 km (e ≈ 0.0001) ✅ NOMINAL
2. **Fire radial burns**: Use arrow keys perpendicular to velocity
3. **Watch eccentricity rise**: e → 0.002 → 0.005 → 0.010
4. **Observe**:
   - Altitude varies wildly (340-460 km)
   - Status: WARNING → VIOLATION → CRITICAL
   - Orbit becomes unstable

**Real satellites would:**
- Experience **heavy drag** at perigee (340 km)
- Burn up in atmosphere within **days to weeks**
- Require **immediate correction burns** (costly fuel!)

### **Compare: Molniya vs LEO**

| Parameter | LEO 400 km | HEO Molniya |
|-----------|------------|-------------|
| Eccentricity | < 0.0005 ✅ | 0.72 ✅ |
| Altitude range | 400 ± 0.2 km | 1,000 - 42,000 km |
| Purpose | Circular stability | High-latitude dwell |
| Drag concern | Critical! | Minimal (high apogee) |
| Mission type | Crewed, imaging | Communications |

---

## 📚 References

- NASA JPL Basics of Space Flight
- SMAD (Space Mission Analysis and Design)
- Fundamentals of Astrodynamics (Bate, Mueller, White)
- Real satellite TLEs (Two-Line Elements)

---

**Built with realistic physics and love for orbital mechanics!** 🛰️✨

## 🤖 AI Autopilot Modes

### **1. STANDBY Mode** (Default)
- **Purpose**: Save battery, maintain attitude
- **Action**: No propulsion, just monitoring
- **When to use**: During long coast phases

### **2. AUTO-MAINTAIN Mode** 🤖
**For:** LEO, MEO, GEO (circular orbits)

**What it does:**
- **Priority 1:** Corrects eccentricity drift (keeps orbit circular)
- **Priority 2:** Maintains altitude and velocity
- Uses **PID controller** for smooth, gentle adjustments
- Prefers **electric thrusters** (fuel efficient)
- Status display shows: `Mode: 🤖 AUTO-MAINTAIN`

**Why eccentricity correction comes first:**

Eccentricity is the **root cause** of altitude/velocity errors in circular orbits:

```
Example: LEO 400 km with eccentricity drift

1. Eccentricity increases: e = 0.0001 → 0.005
2. Orbit becomes elliptical:
   - Apogee: 410 km (too high!)
   - Perigee: 390 km (too low!)
3. Symptoms appear:
   - Altitude varies: 390-410 km (20 km swing!)
   - Velocity varies: ±50 m/s
   - Status: VIOLATION ⚠️
```

**Bad strategy (symptom treatment):**
```
Autopilot: "Altitude is 410 km, target is 400 km"
Action: Retrograde burn to lower altitude
Result: Lowers apogee but doesn't fix root cause
Next orbit: Altitude swings back to 410 km again!
Fuel wasted: Constant correction burns every orbit 🔥💸
```

**Good strategy (root cause treatment):**
```
Autopilot: "Eccentricity is 0.005, should be ~0.0001"
Action: Circularize orbit (burn at apogee/perigee)
Result: e → 0.0001 (circular orbit restored)
Next orbit: Altitude stable at 400 km ✅
Fuel saved: One correction fixes it permanently! 💰
```

**Circularization technique:**

| Position | Current Alt | Burn Direction | Effect |
|----------|-------------|----------------|--------|
| **Apogee** (high point) | 410 km | Retrograde (-) | Lowers perigee → raises perigee → circularizes |
| **Perigee** (low point) | 390 km | Prograde (+) | Raises apogee → lowers apogee → circularizes |

**Eccentricity thresholds:**

```javascript
LEO 400 km:
  e < 0.0005  → NOMINAL ✅ (gentle corrections)
  e > 0.002   → VIOLATION ⚠️ (aggressive corrections)
  e > 0.005   → CRITICAL 🚨 (emergency circularization)

GEO 35,786 km:
  e < 0.0002  → NOMINAL ✅ (true geostationary)
  e > 0.0005  → VIOLATION ⚠️ (satellite drifts)
  e > 0.001   → CRITICAL 🚨 (not geostationary anymore!)
```

**Example autopilot log (eccentricity correction):**
```
12:00:05: 🤖 AUTO: Orbit stable (e=0.0003, alt=400.1km) ✅
12:15:30: 🤖 AUTO: Correcting eccentricity drift (e=0.0008)
12:15:30: 🤖 ECC: Circularizing (retrograde at apogee → raise perigee) (e=0.0008)
12:15:31: 🤖 AUTO: -1.2 m/s (eccentricity)
12:20:00: 🤖 AUTO: Orbit stable (e=0.0002, alt=400.0km) ✅ FIXED!
```

---

### **Autopilot Correction Priority**

**For circular orbits (LEO/MEO/GEO):**

1. **Eccentricity > warning threshold** → Circularize orbit (root cause)
2. **Altitude/Velocity errors** → Adjust velocity (symptoms)
3. **All nominal** → Monitor only (no burns)

**Why this order matters:**

```
Wrong order (fix symptoms first):
  ❌ Burn to fix altitude → Eccentricity still bad → Altitude drifts again
  ❌ Burn to fix velocity → Eccentricity still bad → Velocity varies again
  ❌ Result: Wasted fuel, never stable

Correct order (fix root cause first):
  ✅ Burn to fix eccentricity → Orbit circularizes → Altitude/velocity stabilize
  ✅ Then fine-tune altitude/velocity if needed
  ✅ Result: Stable orbit, minimal fuel usage
```

---

## 🎓 Real Satellite Operations

### **ISS Reboost (LEO 400 km)**

**Typical eccentricity:** e ≈ 0.0005 (nearly circular)

**If eccentricity drifts to e = 0.003:**
- Apogee: ~402 km
- Perigee: ~398 km
- **Problem:** Varying atmospheric drag (10x difference in drag force!)
- **Solution:** Circularization burn at apogee (retrograde) or perigee (prograde)

**Real ISS reboost frequency:**
- Normal: Every 30-60 days (drag makeup + circularization)
- High solar activity: Every 10-20 days (more drag)

### **GPS Satellites (MEO 20,200 km)**

**Typical eccentricity:** e < 0.005 (design spec)

**If eccentricity drifts to e = 0.015:**
- Altitude varies: ±300 km swing!
- Velocity varies: ±150 m/s
- **Problem:** GPS timing errors (relativity effects), coverage gaps
- **Solution:** Station-keeping burns to circularize orbit

**Real GPS operations:**
- Circularization burns: 2-4 times per year
- Fuel budget: Designed for 10-15 year mission

### **GEO Communications (35,786 km)**

**Typical eccentricity:** e < 0.0002 (very circular)

**If eccentricity drifts to e = 0.001:**
- Satellite appears to drift ±36 km north-south
- **Problem:** Ground antennas can't track (fixed dish required!)
- **Solution:** Emergency circularization burn

**Real GEO operations:**
- N-S station-keeping: Weekly burns
- E-W station-keeping: Monthly burns
- Eccentricity control: Critical for geostationary appearance
