# StripBoard Studio

StripBoard Studio is a browser-based planning tool for stripboard / veroboard electronics.

It is built as a model-first, graph-first application:

- the project model is the source of truth
- SVG is the renderer
- electrical continuity is derived from structured board objects, not from freehand drawing primitives

## Current Scope

The application is focused on stabilizing an MVP workflow for planning stripboard builds:

- generate a stripboard from board settings
- render top and bottom views
- place and remove strip cuts
- place solder joints
- place wires
- place components from a library
- place annotations
- inspect simple nets / connectivity overlays
- save and load compact JSON projects
- export SVG
- prepare the board using a dedicated prep view

## Tech Stack

- Vite
- React
- TypeScript
- Zustand
- SVG rendering

## Run Locally

```powershell
npm install
npm run dev
```

Dev URL:

```text
http://127.0.0.1:5173
```

The normal dev script will reclaim port `5173` before starting Vite so the URL stays fixed.

### Raw Vite Startup

```powershell
npm run dev:raw
```

### Production Build

```powershell
npm run build
```

## Scripts

- `npm run dev` - start the local dev server on `127.0.0.1:5173`
- `npm run dev:raw` - run Vite directly without the PowerShell startup wrapper
- `npm run build` - type-check and build the production bundle

## Default Board Preset

The default stripboard preset is:

- width: `100 mm`
- height: `50 mm`
- pitch: `2.54 mm`
- thickness: `1.6 mm`
- strip direction: `vertical`
- strip count: `39`
- holes per strip: `19`

This yields `741` holes total.

## Application Model

The project uses structured board objects such as:

- `ProjectModel`
- `Board`
- `Hole`
- `CopperStrip`
- `CopperSegment`
- `StripCut`
- `ComponentDefinition`
- `ComponentInstance`
- `Wire`
- `SolderJoint`
- `Annotation`

Persistence is compact and model-aware. Saved projects store board settings plus hole-linked references instead of serializing the full generated hole grid.

## Project Structure

```text
stripboard-studio/
  public/
  scripts/
  src/
    app/
    components/
    data/
    model/
    render/
    store/
    utils/
```

## UI Notes

Recent UI work includes:

- improved component and board label readability
- collapsible side-panel sections
- searchable component library
- contextual delete action in the toolbar
- board prep view for cut-focused work

## Status

This project is still in active MVP stabilization. The emphasis is on correctness, predictable interaction, compact serialization, and reliable board rendering rather than advanced routing or production-scale CAD features.
<img width="1287" height="833" alt="image" src="https://github.com/user-attachments/assets/474f0516-e3e9-4d99-9302-49bdd458d2b3" />
<img width="1269" height="813" alt="image" src="https://github.com/user-attachments/assets/84b07ffb-7012-4be6-84e6-eeb3e182e75a" />
