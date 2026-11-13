# PROJECT: MARINA DESIGN & OPTIMIZATION

## 1. YOUR ROLE

Act as a senior software architect, full-stack developer, computational geometry specialist and marina planning engineer.

Your task is to design and build a professional, browser-based marina planning and optimization application.

The application should take inspiration from TestFit, particularly its ability to generate, visualize and compare different planning solutions based on user-defined constraints.

However, this application focuses specifically on floating marina infrastructure, boat berths, pontoons and marina layouts.

Do not build just a visual prototype. Build a functional application with real geometric calculations, automatic layout generation and optimization capabilities.

Take responsibility for the technical architecture and make sensible implementation decisions independently.

Work iteratively. Start by creating a working MVP and then improve it.

---

# 2. CORE CONCEPT

The application allows a user to:

1. Define a water area where a marina could be constructed.
2. Define the shoreline and fixed obstacles.
3. Set marina design parameters.
4. Automatically generate several alternative marina layouts.
5. Calculate the number of boat berths and infrastructure requirements.
6. Compare alternative layouts.
7. Visually edit and refine the generated layouts.
8. Export the final marina plan.

The primary objective is to maximize the number of usable boat berths while respecting geometric, operational and spatial constraints.

The application should be useful for professional marina planning, municipal waterfront development and marina infrastructure feasibility studies.

---

# 3. USER INTERFACE AND DESIGN

Build a modern, professional web application.

The visual style should be inspired by professional engineering software, CAD applications and TestFit.

The interface should be clean, precise and easy to understand.

Use a large central planning canvas.

Suggested interface structure:

LEFT SIDEBAR:
- Project information
- Site boundary tools
- Marina configuration
- Boat dimensions
- Dock dimensions
- Navigation channel settings
- Optimization objectives

CENTER:
- Interactive map and planning canvas
- Site boundary
- Shoreline
- Floating pontoons
- Boat berths
- Navigation areas
- Obstacles
- Measurement tools

RIGHT SIDEBAR:
- Generated alternatives
- Optimization results
- Marina statistics
- Comparison of alternatives

TOP TOOLBAR:
- New project
- Save project
- Undo / redo
- Generate layouts
- Optimize
- Export

Use metric units throughout the application.

All dimensions must be displayed in meters (m), areas in square meters (m²) and quantities as integers.

The application should initially be in English, but the architecture should support Finnish localization later.

---

# 4. SITE DEFINITION

The user must be able to define a marina planning area.

Implement the following tools:

A. Draw water area boundary
- Draw a polygon defining the available water area.
- Edit polygon vertices.
- Move and resize the boundary.

B. Define shoreline
- Draw or import shoreline geometry.
- Allow the user to define the direction in which docks can connect to the shore.

C. Define obstacles
- Existing piers
- Rocks
- Islands
- Navigation restrictions
- Other fixed structures

D. Define restricted areas
- Areas where docks cannot be placed.
- Areas where boats cannot navigate.
- Protected areas.

E. Coordinate system
- Use a metric local coordinate system for all geometric calculations.
- Ensure accurate distances and areas.
- Do not perform engineering calculations directly using latitude/longitude coordinates.

The planning canvas should support zooming, panning and accurate drawing.

---

# 5. MARINA DESIGN PARAMETERS

Allow users to configure the following parameters.

## Boat dimensions

Create editable boat size categories.

Default categories:

Small boats:
- Length: 5 m
- Width: 2 m

Medium boats:
- Length: 7 m
- Width: 2.5 m

Large boats:
- Length: 9 m
- Width: 3 m

Extra large boats:
- Length: 12 m
- Width: 3.5 m

Allow users to define the number or percentage of berths in each category.

The user must also be able to create custom boat categories.

## Floating docks

Configurable parameters:

- Main pier width
- Finger pier width
- Finger pier length
- Floating dock freeboard is optional information
- Minimum distance between docks
- Maximum dock length
- Dock orientation
- Dock connection to shoreline

Initial default values:

- Main pier width: 3 m
- Finger pier width: 0.8 m
- Minimum fairway width: 8 m
- Minimum distance between boats: configurable

These are initial design assumptions, not universal engineering standards.

## Navigation and maneuvering

Allow the user to configure:

- Main navigation channel width
- Secondary fairway width
- Turning basin dimensions
- Minimum distance from obstacles
- Minimum clearance between boat envelopes

Boat maneuvering areas must be represented separately from physical dock structures.

Do not assume that a geometrically fitting boat berth automatically represents a safe or operationally feasible berth.

---

# 6. AUTOMATIC MARINA GENERATION ENGINE

This is the most important component of the application.

Develop a geometric algorithm that automatically generates marina layouts based on the user's parameters.

The algorithm should explore different configurations, including:

1. Parallel finger piers connected to a main pier.
2. Multiple parallel floating piers.
3. Shore-connected dock systems.
4. Different dock orientations.
5. Different numbers of main piers.
6. Different finger pier lengths and spacing.

The system should be capable of generating multiple alternative layouts.

For each generated alternative, calculate:

- Total number of berths.
- Number of berths by boat category.
- Total floating dock length.
- Total main pier length.
- Total finger pier length.
- Estimated floating dock area.
- Water area occupied by the marina.
- Remaining navigable water area.
- Estimated marina utilization efficiency.

The generation engine must check:

- All dock structures remain inside the permitted planning area.
- No dock structures overlap.
- No structures intersect obstacles.
- Required fairway widths are maintained.
- Berth dimensions are respected.
- Boat envelopes do not overlap.
- Boats do not extend into restricted areas.

Use computational geometry libraries where appropriate.

Do not rely on random positioning alone.

Develop a systematic generation and optimization approach.

---

# 7. OPTIMIZATION ENGINE

Create a multi-objective optimization system.

The user should be able to select the primary optimization objective.

Available objectives:

A. MAXIMUM CAPACITY
Maximize the total number of boat berths.

B. MAXIMUM SPACE EFFICIENCY
Maximize the number of berths relative to the available water area.

C. MINIMUM INFRASTRUCTURE
Minimize total floating dock length while maintaining a specified berth capacity.

D. BALANCED SOLUTION
Find a balance between berth capacity, infrastructure length and navigability.

The system should generate multiple solutions and rank them according to the selected objective.

Use an appropriate optimization method, such as:
- Constraint-based search
- Heuristic optimization
- Genetic algorithms
- Simulated annealing
- Mixed-integer optimization where appropriate

Choose a technically appropriate method.

The optimization engine should be modular so that better algorithms can be introduced later.

Always distinguish between:
- Geometrically feasible solutions.
- Solutions that meet the configured operational constraints.
- Solutions requiring further engineering verification.

---

# 8. VISUALIZATION

Represent the generated marina clearly on the planning canvas.

Use different visual elements for:

- Water area
- Shoreline
- Main floating piers
- Finger piers
- Boat berths
- Boats
- Navigation channels
- Restricted areas
- Obstacles

Display boats as simplified top-view rectangles.

Boats should be positioned inside their respective berths.

Use different visual styles for different boat size categories.

The user should be able to select individual docks and inspect their properties.

The visualization must update immediately when parameters change or a new layout is generated.

---

# 9. ALTERNATIVE COMPARISON

Generate at least three alternative marina layouts whenever possible.

Present the alternatives in a comparison panel.

Compare:

- Total berth count
- Berth count by boat category
- Total dock length
- Infrastructure area
- Water area utilization
- Remaining navigation area
- Estimated infrastructure requirements

Allow the user to switch between alternatives.

Allow the user to save a preferred alternative.

The comparison should make it easy to understand why one solution performs better than another.

---

# 10. MANUAL EDITING

After automatic generation, users must be able to refine the layouts.

Allow users to:

- Move docks.
- Rotate docks.
- Change dock dimensions.
- Add or remove finger piers.
- Change boat berth dimensions.
- Remove individual berths.
- Lock selected structures in place.

When a user modifies the layout, recalculate the relevant statistics.

Clearly indicate any constraint violations.

The system must distinguish between automatically generated and manually modified layouts.

---

# 11. EXPORT AND REPORTING

Allow users to export:

1. PDF marina layout.
2. PNG image.
3. DXF drawing if technically feasible.
4. CSV berth inventory.

The PDF report should include:

- Project name
- Planning area
- Selected marina layout
- Total berth count
- Berth distribution by boat size
- Dock lengths
- Area calculations
- Key design parameters
- Important warnings and limitations

The output should look professional enough to be used in preliminary planning presentations.

---

# 12. TECHNICAL ARCHITECTURE

Use a modern, maintainable architecture.

Suggested technology stack:

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS

Visualization:
- Konva.js or Fabric.js
- Turf.js for suitable geometric operations

Backend:
- Python
- FastAPI

Geometry and optimization:
- Shapely
- OR-Tools or another appropriate optimization library
- NumPy

Database:
- PostgreSQL with PostGIS for future scalability.

For the initial MVP, a simpler local project storage system is acceptable.

Choose the architecture that allows rapid development without sacrificing future scalability.

Keep the geometric calculations separate from the user interface.

Create modular components.

---

# 13. DEVELOPMENT PROCESS

Do not attempt to implement everything in one step.

Follow this development sequence.

PHASE 1: WORKING MVP

Build:
- Application shell
- Interactive planning canvas
- Site boundary drawing
- Obstacle drawing
- Parameter configuration
- Boat categories
- Basic floating dock generation
- Automatic berth placement
- Geometric constraint checking
- Basic marina statistics

At the end of Phase 1, the application must be usable.

PHASE 2: GENERATION AND OPTIMIZATION

Implement:
- Multiple layout configurations
- Alternative comparison
- Improved geometric optimization
- Different optimization objectives
- Better constraint handling

PHASE 3: PROFESSIONAL FEATURES

Implement:
- Manual editing
- Saving projects
- PDF export
- CSV export
- DXF export
- Advanced visualization
- Finnish localization

PHASE 4: ADVANCED PLANNING

Prepare the architecture for:
- Bathymetric data
- Real geographic coordinates
- Wind and wave exposure
- Environmental restrictions
- Marina construction cost estimation
- Different pontoon systems and manufacturers

---

# 14. QUALITY REQUIREMENTS

Important:

1. The application must actually calculate layouts, not merely display predefined examples.
2. Geometric calculations must be based on real coordinates and dimensions.
3. Invalid layouts must be rejected or clearly flagged.
4. The system must provide meaningful feedback when no feasible layout can be generated.
5. All calculations must be repeatable and testable.
6. Keep the code modular and well documented.
7. Include automated tests for the geometry and optimization engine.
8. Avoid unnecessary complexity in the initial MVP.
9. Prioritize functionality over visual decoration.
10. Never claim engineering compliance or safety certification based solely on geometric optimization.

---

# 15. FIRST TASK

Start by:

1. Reviewing the project directory.
2. Creating a technical architecture.
3. Defining the data structures for marina geometry.
4. Creating the initial application.
5. Implementing the planning canvas.
6. Implementing the first working automatic marina generator.

Do not stop after writing a plan.

Actually create the files, implement the application and run it.

Test the application and fix errors.

If a feature is too complex for the first implementation, create a simplified but functional version and document the limitation.

At the end, provide:
- Instructions for running the application.
- Description of implemented features.
- Known limitations.
- Recommended next development steps.

Your goal is to deliver a working first version of a professional marina design and optimization tool.
