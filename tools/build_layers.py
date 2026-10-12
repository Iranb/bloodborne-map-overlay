"""Build height bands and evidenced ramp crossings from unchanged collision meshes.

Bands are browsing slices, not official floor numbers. A road link must intersect
one original upward triangle; event passages retain only their known anchor.
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
    links = []
    for boundary_index, y in enumerate(edges[1:-1], 1):
        candidates = road[(heights.min(axis=1) < y-.01) & (heights.max(axis=1) > y+.01)]
        segments = []
        owners = {}
        parents = []
        def find(i):
            while parents[i] != i:
                parents[i] = parents[parents[i]]
                i = parents[i]
            return i
        for tri in candidates:
            points = []
            for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
                if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                    points.append(a+(b-a)*((y-a[1])/(b[1]-a[1])))
            if len(points) != 2 or np.linalg.norm(points[0]-points[1]) < .02:
                continue
            i = len(segments)
            segments.append(points)
            parents.append(i)
            for point in points:
                key = tuple(np.round(point[[0, 2]]/.05).astype(int))
                if key in owners:
                    parents[find(i)] = find(owners[key])
                else:
                    owners[key] = i
        components = {}
        for i, segment in enumerate(segments):
            components.setdefault(find(i), []).append(segment)
        anchors = []
        for component in components.values():
            lengths = [float(np.linalg.norm(a-b)) for a, b in component]
            if sum(lengths) < .6:
                continue
            a, b = component[int(np.argmax(lengths))]
            point = (a+b)*.5  # lies on an evidenced crossing, never a guessed bridge
            if any(np.linalg.norm(point-p) < 2 for p in anchors):
                continue
            anchors.append(point)
        for point in sorted(anchors, key=lambda p: (float(p[0]), float(p[2]))):
            links.append({'id': f"{area['id']}:road-link:{boundary_index}:{len(links)}",
                          'kind': 'road', 'from': boundary_index-1, 'to': boundary_index,
                          'p': [round(float(v), 4) for v in point], 'boundary': y})
    for marker in area['markers']:
        if marker['kind'] != 'passage' or not marker.get('p'):
            continue
        index = int(np.clip(np.searchsorted(edges, marker['p'][1], side='right')-1, 0, len(floors)-1))
        links.append({'id': marker['id'], 'kind': marker.get('passageType', 'passage'),
                      'from': index, 'to': None, 'p': marker['p'], 'marker': marker['id']})
    return {'floors': floors, 'links': links}


def main():
    maps = json.loads((DATA/'maps.json').read_text('utf-8'))['maps']
    result = {'version': 1, 'bandMetres': 8, 'maps': {}}
    for area in maps:
        triangles = np.fromfile(DATA/area['mesh'], dtype='<f4').reshape(-1, 3, 3)
        entry = build(area, triangles)
        result['maps'][area['id']] = entry
        print(area['id'], len(entry['floors']), 'bands', sum(x['kind']=='road' for x in entry['links']), 'road crossings', flush=True)
    (DATA/'layers.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), 'utf-8')


if __name__ == '__main__':
    main()
