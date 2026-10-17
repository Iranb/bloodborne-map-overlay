"""Build browsing height bands and known interaction anchors.

Slice-plane intersections are not entrances. Actual route crossings are derived
at runtime from a continuous path through the full-area walkable geometry.
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web/data'


def build(area, triangles):
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    length = np.linalg.norm(cross, axis=1)
    road = triangles[(length > 1e-8) & (cross[:, 1] >= length * .58)]
    normals = np.cross(road[:, 1] - road[:, 0], road[:, 2] - road[:, 0])
    heights = road[:, :, 1]
    centers = heights.mean(axis=1)
    horizontal = np.ptp(heights, axis=1) < .4
    # Choose an eight-metre grid offset that avoids slicing major flat floors.
    offsets = np.arange(0, 8, .5)
    weights = normals[:, 1] * .5
    offset = float(min(offsets, key=lambda x: weights[horizontal & (np.abs((centers-x+4) % 8-4) < .6)].sum()))
    marker_y = [m['p'][1] for m in area['markers'] if m.get('p')]
    low = min(float(heights.min()), *marker_y) if marker_y else float(heights.min())
    high = max(float(heights.max()), *marker_y) if marker_y else float(heights.max())
    first = np.floor((low-offset)/8)*8+offset
    edges = np.arange(first, high+8.01, 8).tolist()
    floors = [{'index': i, 'low': round(a, 3), 'high': round(b, 3)} for i, (a, b) in enumerate(zip(edges, edges[1:]))]
    # Empty altitude gaps stay visible in the selector so boundaries and links
    # retain a simple, stable order even between distant pieces of the same map.
    for floor in floors:
        in_floor = (heights.min(axis=1) < floor['high']) & (heights.max(axis=1) >= floor['low'])
        floor['triangles'] = int(np.count_nonzero(in_floor))
        if floor['triangles']:
            indices = np.flatnonzero(in_floor)
            point = road[indices[int(np.argmax(weights[indices]))]].mean(axis=0)
            floor['focus'] = [round(float(v), 4) for v in point]
        floor['markers'] = sum(floor['low'] <= y < floor['high'] for y in marker_y)
    # Floor slices are a viewing aid, not a navigation graph. Generate only
    # exact interaction anchors; route crossings are computed from the actual
    # full-area path in the browser after merged content floors are known.
    links = []
    for marker in area['markers']:
        if marker['kind'] != 'passage' or not marker.get('p'):
            continue
        index = int(np.clip(np.searchsorted(edges, marker['p'][1], side='right')-1, 0, len(floors)-1))
        links.append({'id': marker['id'], 'kind': marker.get('passageType', 'passage'),
                      'from': index, 'to': None, 'p': marker['p'], 'marker': marker['id']})
    return {'floors': floors, 'links': links}


def main():
    maps = json.loads((DATA/'maps.json').read_text('utf-8'))['maps']
    result = {'version': 2, 'bandMetres': 8, 'maps': {}}
    for area in maps:
        triangles = np.fromfile(DATA/area['mesh'], dtype='<f4').reshape(-1, 3, 3)
        entry = build(area, triangles)
        result['maps'][area['id']] = entry
        print(area['id'], len(entry['floors']), 'bands', len(entry['links']), 'interaction anchors', flush=True)
    (DATA/'layers.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), 'utf-8')


if __name__ == '__main__':
    main()
