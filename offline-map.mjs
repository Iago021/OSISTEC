const base = new URL('./', import.meta.url);
let bundlePromise;

async function readJson(file) {
  const response = await fetch(new URL(file, base));
  if (!response.ok) throw new Error(`Arquivo offline ausente: ${file}`);
  return response.json();
}

export function loadOfflineBundle() {
  if (!bundlePromise) {
    bundlePromise = Promise.all([
      readJson('offline/style.json'),
      readJson('offline/units.json'),
      readJson('offline/roads.json'),
    ]).then(([style, units, roads]) => {
      style.glyphs = new URL('offline/fonts/{fontstack}/{range}.pbf', base).href
        .replaceAll('%7B', '{').replaceAll('%7D', '}');
      style.sources.openmaptiles.tiles = [new URL('offline/tiles/{z}/{x}/{y}.pbf', base).href
        .replaceAll('%7B', '{').replaceAll('%7D', '}')];
      return {style, units, roads};
    }).catch((error) => { bundlePromise = null; throw error; });
  }
  return bundlePromise;
}

export function distanceMeters(first, second) {
  const rad = Math.PI / 180;
  const a = Math.sin((second[1] - first[1]) * rad / 2) ** 2
    + Math.cos(first[1] * rad) * Math.cos(second[1] * rad)
    * Math.sin((second[0] - first[0]) * rad / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class MinHeap {
  items = [];
  push(value) {
    let i = this.items.length;
    this.items.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent][0] <= value[0]) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = value;
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1][0] < this.items[child][0]) child++;
        if (this.items[child][0] >= last[0]) break;
        this.items[i] = this.items[child];
        i = child;
      }
      this.items[i] = last;
    }
    return top;
  }
}

export function createRouter(data) {
  const {nodes, ways} = data;
  const edges = nodes.map(() => []);
  for (const [indices, direction, speed] of ways) {
    for (let i = 1; i < indices.length; i++) {
      const a = indices[i - 1], b = indices[i];
      const meters = distanceMeters(nodes[a], nodes[b]);
      const seconds = meters / (speed / 3.6);
      if (direction !== -1) edges[a].push([b, meters, seconds]);
      if (direction !== 1) edges[b].push([a, meters, seconds]);
    }
  }

  function nearest(point) {
    let best = -1, bestDistance = 300;
    for (let i = 0; i < nodes.length; i++) {
      if (!edges[i].length) continue;
      const distance = distanceMeters(point, nodes[i]);
      if (distance < bestDistance) {best = i; bestDistance = distance;}
    }
    return best;
  }

  return function route(origin, destination) {
    const start = nearest(origin), end = nearest(destination);
    if (start < 0 || end < 0) return null;
    const costs = new Float64Array(nodes.length).fill(Infinity);
    const previous = new Int32Array(nodes.length).fill(-1);
    const distances = new Float64Array(nodes.length);
    const heap = new MinHeap();
    costs[start] = 0;
    heap.push([0, start]);
    while (heap.items.length) {
      const [cost, node] = heap.pop();
      if (cost > costs[node]) continue;
      if (node === end) break;
      for (const [next, meters, seconds] of edges[node]) {
        if (cost + seconds >= costs[next]) continue;
        costs[next] = cost + seconds;
        previous[next] = node;
        distances[next] = distances[node] + meters;
        heap.push([costs[next], next]);
      }
    }
    if (!Number.isFinite(costs[end])) return null;
    const indices = [];
    for (let current = end; current !== -1; current = previous[current]) indices.push(current);
    indices.reverse();
    return {coordinates: indices.map((index) => nodes[index]), distance: distances[end], duration: costs[end]};
  };
}
