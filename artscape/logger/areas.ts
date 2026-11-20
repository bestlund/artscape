// Named areas: name -> rectangle (+ floor), read from artscape/areas.json.
// The logger uses names instead of coordinates in location events and snapshots.

import fs from 'fs';

export interface Area {
    name: string;
    label: string;
    x: [number, number];
    z: [number, number];
    level: number;
}

export function loadAreas(file: string): Area[] {
    if (!fs.existsSync(file)) return [];
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const areas: Area[] = [];
    for (const [name, a] of Object.entries<any>(json.areas ?? {})) {
        const ok = Array.isArray(a.x) && Array.isArray(a.z) && a.x.length === 2 && a.z.length === 2;
        if (!ok) throw new Error(`Area "${name}" in ${file} needs x: [min, max] and z: [min, max]`);
        areas.push({
            name,
            label: a.label ?? name,
            x: [Math.min(...a.x), Math.max(...a.x)],
            z: [Math.min(...a.z), Math.max(...a.z)],
            level: a.level ?? 0,
        });
    }
    return areas;
}

/** The first area containing this tile, or null. */
export function areaAt(areas: Area[], x: number, z: number, level = 0): Area | null {
    return areas.find(a => a.level === level && x >= a.x[0] && x <= a.x[1] && z >= a.z[0] && z <= a.z[1]) ?? null;
}
