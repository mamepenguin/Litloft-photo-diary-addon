import { describe, expect, it } from 'vitest';
import { baseLayers, paintFor } from './mapStyle';

type Properties = Record<string, string | number>;
type Layer = {
  id: string;
  type: string;
  'source-layer'?: string;
  filter?: unknown;
  minzoom?: number;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

function evaluate(expression: unknown, properties: Properties): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression;
  const value = (argument: unknown): unknown => evaluate(argument, properties);
  const field = (argument: unknown): unknown => typeof argument === 'string' ? properties[argument] : value(argument);
  switch (operator) {
    case 'literal': return args[0];
    case 'get': return properties[String(args[0])];
    case 'has': return Object.hasOwn(properties, String(args[0]));
    case '!has': return !Object.hasOwn(properties, String(args[0]));
    case 'all': return args.every(argument => Boolean(value(argument)));
    case 'any': return args.some(argument => Boolean(value(argument)));
    case '!': return !value(args[0]);
    case '==': return field(args[0]) === value(args[1]);
    case '!=': return field(args[0]) !== value(args[1]);
    case 'in': {
      const candidates = args.length === 2 && Array.isArray(value(args[1])) ? value(args[1]) as unknown[] : args.slice(1).map(value);
      return candidates.includes(field(args[0]));
    }
    case '!in': return !args.slice(1).map(value).includes(field(args[0]));
    case 'coalesce': return args.map(value).find(item => item !== null && item !== undefined);
    case 'match': {
      const input = value(args[0]);
      for (let index = 1; index < args.length - 1; index += 2) {
        const labels = Array.isArray(args[index]) ? args[index] : [args[index]];
        if (labels.includes(input)) return value(args[index + 1]);
      }
      return value(args.at(-1));
    }
    default: throw new Error(`Unsupported map filter operator: ${String(operator)}`);
  }
}

function matches(layer: Layer, properties: Properties): boolean {
  return layer.filter === undefined || Boolean(evaluate(layer.filter, properties));
}

function visible(layers: Layer[], type: string, properties: Properties, source?: string): Layer[] {
  return layers.filter(layer => layer.type === type && (!source || layer['source-layer'] === source) && matches(layer, properties));
}

function named(kind: string, source?: string): Properties {
  const category: Properties = source === 'pois' ? { [kind === 'park' ? 'leisure' : 'tourism']: kind } : { kind };
  return { ...category, name: 'Sample', admin_level: 0 };
}

const colors = {
  light: { land: '#F7F7F5', water: '#DCECF1', river: '#C5DFE8', park: '#E5EEDF', forest: '#DCE8D8', building: '#EBEBE8', rail: '#B6B6B2', primary: '#676D70', secondary: '#989E9F', parkLabel: '#7C9881', waterLabel: '#7299A7', nature: '#818785', facility: '#777D80' },
  dark: { land: '#231216', water: '#1C2930', river: '#29414B', park: '#293127', forest: '#243023', building: '#32282A', rail: '#7A7373', primary: '#CEC7C8', secondary: '#9F999B', parkLabel: '#9FB39E', waterLabel: '#91AFBB', nature: '#A9B0A9', facility: '#B8B5B7' },
};

for (const theme of ['light', 'dark'] as const) {
  describe(`SPEC-PD-013 memory map in ${theme} theme`, () => {
    const layers = baseLayers(theme) as Layer[];
    const palette = colors[theme];

    it('distinguishes rivers, forest and park land with the specified colors', () => {
      for (const [kind, color] of [['forest', palette.forest], ['wood', palette.forest], ...['park', 'grass', 'meadow', 'village_green', 'golf_course', 'scrub', 'recreation_ground'].map(kind => [kind, palette.park])] as const) {
        const fills = visible(layers, 'fill', named(kind));
        expect(fills.some(layer => String(layer.paint?.['fill-color']).toLowerCase() === color.toLowerCase()), kind).toBe(true);
      }
      const rivers = visible(layers, 'line', named('river'), 'water_lines');
      expect(rivers.length).toBeGreaterThan(0);
      for (const river of rivers) {
        expect(String(river.paint?.['line-color']).toLowerCase()).toBe(palette.river.toLowerCase());
        expect(river.paint?.['line-width']).toBe(1.2);
      }
      expect(palette.river).not.toBe(palette.water);
      expect(palette.park).not.toBe(palette.forest);
    });

    it('keeps rail a one pixel solid line', () => {
      const rails = visible(layers, 'line', named('rail'), 'streets');
      expect(rails.length).toBeGreaterThan(0);
      for (const rail of rails) {
        expect(String(rail.paint?.['line-color']).toLowerCase()).toBe(palette.rail.toLowerCase());
        expect(rail.paint?.['line-width']).toBe(1);
        expect(rail.paint?.['line-dasharray']).toBeUndefined();
        expect(rail.paint?.['line-pattern']).toBeUndefined();
      }
    });

    it('gates buildings and small streets until their specified zoom levels', () => {
      const buildings = layers.filter(layer => layer['source-layer'] === 'buildings');
      expect(buildings.length).toBeGreaterThan(0);
      for (const building of buildings) {
        expect(building.minzoom).toBe(14);
        expect(building.type).toBe('fill');
        expect(String(building.paint?.['fill-color']).toLowerCase()).toBe(palette.building.toLowerCase());
        expect(building.paint?.['fill-outline-color']).toBeUndefined();
      }
      for (const kind of ['service', 'pedestrian', 'footway', 'path']) {
        const streets = visible(layers, 'line', named(kind), 'streets');
        expect(streets.length, kind).toBeGreaterThan(0);
        for (const street of streets) expect(street.minzoom, kind).toBe(16);
      }
    });

    it.each([
      ['place_labels', 'suburb', 14, 'secondary'],
      ['place_labels', 'quarter', 14, 'secondary'],
      ['place_labels', 'neighbourhood', 14, 'secondary'],
      ['place_labels', 'island', 10, 'nature'],
      ['public_transport', 'station', 13, 'primary'],
      ['pois', 'park', 13, 'parkLabel'],
      ['pois', 'attraction', 13, 'facility'],
      ['pois', 'zoo', 13, 'facility'],
      ['pois', 'aquarium', 13, 'facility'],
      ['pois', 'museum', 13, 'facility'],
      ['water_lines_labels', 'river', 12, 'waterLabel'],
    ] as const)('shows named %s/%s at zoom %s', (source, kind, zoom, color) => {
      const labels = visible(layers, 'symbol', named(kind, source), source);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.minzoom).toBe(zoom);
        expect(label.layout?.['text-size']).toBe(12);
        expect(String(label.paint?.['text-color']).toLowerCase()).toBe(palette[color].toLowerCase());
        const field = label.layout?.['text-field'];
        expect(field === '{name}' ? 'Sample' : evaluate(field, named(kind, source))).toBe('Sample');
        expect(String(label.paint?.['text-halo-color']).toLowerCase()).toBe(palette.land.toLowerCase());
        expect(label.paint?.['text-halo-width']).toBe(1.4);
      }
    });

    it('excludes unnamed features and everyday facilities from labels at every zoom', () => {
      const symbols = layers.filter(layer => layer.type === 'symbol');
      for (const layer of symbols) {
        for (const kind of ['station', 'park', 'museum', 'island', 'city']) {
          const feature = named(kind, layer['source-layer']);
          delete feature.name;
          for (const unnamed of [feature, { ...feature, name: '' }]) {
            const field = layer.layout?.['text-field'];
            const text = field === '{name}' ? unnamed.name : evaluate(field, unnamed);
            expect(matches(layer, unnamed) && Boolean(text), `${layer.id}: ${kind} without a name`).toBe(false);
          }
        }
        expect(layer.layout?.['text-allow-overlap']).not.toBe(true);
        expect(layer.layout?.['text-ignore-placement']).not.toBe(true);
      }
      for (const kind of ['hotel', 'mall', 'hospital', 'school', 'bank', 'supermarket', 'restaurant', 'cafe', 'shop', 'unknown']) {
        expect(visible(layers, 'symbol', named(kind, 'pois'), 'pois'), kind).toEqual([]);
      }
      expect(symbols.filter(layer => ['streets', 'street_labels', 'streets_labels', 'addresses', 'address_labels', 'railway_labels'].includes(layer['source-layer'] ?? ''))).toEqual([]);
    });

    it('recolors every painted property through the theme update interface', () => {
      const updates = paintFor(theme);
      for (const layer of layers) {
        for (const [property, value] of Object.entries(layer.paint ?? {})) {
          if (!property.endsWith('-color')) continue;
          expect(updates.find(update => update[0] === layer.id && update[1] === property)?.[2], `${layer.id}/${property}`).toEqual(value);
        }
      }
    });
  });
}
