import './panel.css';
import {
  HILLSHADE_PRESETS,
  type BasemapStyle,
  type HillshadeMethod,
  type QuakeFeed,
  type SourceMode,
  type ViewerState,
} from '../config';
import { POPULATION_LEGEND } from '../population';

const SOURCE_OPTIONS: { value: SourceMode; label: string }[] = [
  { value: 'tilejson', label: 'TileJSON' },
  { value: 'zxy', label: 'zxy' },
  { value: 'pmtiles', label: 'PMTiles' },
];

const BASEMAP_OPTIONS: { value: BasemapStyle; label: string }[] = [
  { value: 'liberty', label: 'Liberty' },
  { value: 'bright', label: 'Bright' },
  { value: 'positron', label: 'Positron' },
];

const HILLSHADE_METHODS: HillshadeMethod[] = [
  'igor',
  'multidirectional',
  'standard',
  'basic',
  'combined',
];

const QUAKE_FEED_OPTIONS: { value: QuakeFeed; label: string }[] = [
  { value: 'significant_month', label: 'Significant · 30d' },
  { value: '4.5_month', label: 'M4.5+ · 30d' },
  { value: '2.5_week', label: 'M2.5+ · 7d' },
  { value: 'all_day', label: 'All · 24h' },
];

export class ControlPanel {
  private state: ViewerState;
  private readonly onChange: (state: ViewerState) => void;
  private readonly onLoadEvent: (idOrUrl: string) => void;
  private readonly el: HTMLElement;
  private hillshadeExEl!: HTMLInputElement;

  constructor(
    mount: HTMLElement,
    initial: ViewerState,
    onChange: (state: ViewerState) => void,
    onLoadEvent: (idOrUrl: string) => void,
  ) {
    this.state = { ...initial };
    this.onChange = onChange;
    this.onLoadEvent = onLoadEvent;
    this.el = mount;
    this.el.classList.add('mh-panel');
    this.render();
  }

  private update(patch: Partial<ViewerState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private render(): void {
    this.el.innerHTML = '';
    this.el.appendChild(this.header());

    const body = document.createElement('div');
    body.className = 'mh-body';
    body.append(
      this.sourceSection(),
      this.basemapSection(),
      this.hillshadeSection(),
      this.terrainSection(),
      this.contourSection(),
      this.populationSection(),
      this.earthquakeSection(),
    );
    this.el.appendChild(body);
  }

  // --- Building blocks -------------------------------------------------------

  private header(): HTMLElement {
    const h = document.createElement('header');
    h.className = 'mh-head';

    const brand = document.createElement('div');
    brand.className = 'mh-brand';
    brand.innerHTML = `
      <span class="mh-mark"></span>
      <span class="mh-brand-text">
        <strong>Mapterhorn</strong>
        <small>terrain viewer</small>
      </span>`;

    const collapse = document.createElement('button');
    collapse.className = 'mh-collapse';
    collapse.type = 'button';
    collapse.setAttribute('aria-label', 'Toggle panel');
    collapse.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    collapse.addEventListener('click', () => this.el.classList.toggle('mh-collapsed'));

    h.append(brand, collapse);
    return h;
  }

  private section(title: string): HTMLElement {
    const s = document.createElement('section');
    s.className = 'mh-section';
    const t = document.createElement('div');
    t.className = 'mh-section-title';
    t.textContent = title;
    s.appendChild(t);
    return s;
  }

  /** Section whose header carries the on/off toggle on the right of the title. */
  private toggleSection(title: string, checked: boolean, on: (v: boolean) => void): HTMLElement {
    const s = document.createElement('section');
    s.className = 'mh-section';
    const head = document.createElement('div');
    head.className = 'mh-section-head';
    const t = document.createElement('div');
    t.className = 'mh-section-title';
    t.textContent = title;
    head.append(t, this.toggle(checked, on));
    s.appendChild(head);
    return s;
  }

  /** Compact label-less on/off toggle, used in section headers. */
  private toggle(checked: boolean, on: (v: boolean) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'mh-toggle';
    label.setAttribute('aria-label', 'Toggle');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => on(input.checked));
    const track = document.createElement('span');
    track.className = 'mh-track';
    track.innerHTML = '<span class="mh-thumb"></span>';
    label.append(input, track);
    return label;
  }

  /** iOS-style toggle switch row (label left, switch right). */
  private switchRow(label: string, checked: boolean, on: (v: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    row.className = 'mh-switch';
    const text = document.createElement('span');
    text.className = 'mh-switch-text';
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => on(input.checked));
    const track = document.createElement('span');
    track.className = 'mh-track';
    track.innerHTML = '<span class="mh-thumb"></span>';
    row.append(text, input, track);
    return row;
  }

  /** Segmented control (mutually-exclusive buttons). */
  private segmented<T extends string>(
    options: { value: T; label: string }[],
    value: T,
    on: (v: T) => void,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'mh-segmented';
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mh-seg';
      b.textContent = opt.label;
      b.dataset.value = opt.value;
      if (opt.value === value) b.classList.add('is-active');
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.mh-seg').forEach((el) => el.classList.remove('is-active'));
        b.classList.add('is-active');
        on(opt.value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  private selectRow<T extends string>(
    options: T[],
    value: T,
    on: (v: T) => void,
  ): { row: HTMLElement; select: HTMLSelectElement } {
    const row = document.createElement('div');
    row.className = 'mh-select';
    const select = document.createElement('select');
    options.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      opt.selected = o === value;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => on(select.value as T));
    row.appendChild(select);
    return { row, select };
  }

  private sliderField(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    on: (v: number) => void,
  ): { field: HTMLElement; input: HTMLInputElement } {
    const field = document.createElement('div');
    field.className = 'mh-field';
    const head = document.createElement('div');
    head.className = 'mh-field-head';
    const cap = document.createElement('span');
    cap.textContent = label;
    const out = document.createElement('span');
    out.className = 'mh-badge';
    out.textContent = value.toFixed(2);
    head.append(cap, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mh-range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = v.toFixed(2);
      on(v);
    });
    field.append(head, input);
    return { field, input };
  }

  private caption(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'mh-caption';
    p.textContent = text;
    return p;
  }

  // --- Sections --------------------------------------------------------------

  private sourceSection(): HTMLElement {
    const s = this.section('Data source');
    s.appendChild(
      this.segmented(SOURCE_OPTIONS, this.state.source, (v) => this.update({ source: v })),
    );
    s.appendChild(this.caption('DEM transport for hillshade & 3D terrain. Contours use the zxy endpoint.'));
    return s;
  }

  private basemapSection(): HTMLElement {
    const s = this.toggleSection('Base map', this.state.basemap, (v) => this.update({ basemap: v }));
    s.appendChild(
      this.segmented(BASEMAP_OPTIONS, this.state.basemapStyle, (v) => this.update({ basemapStyle: v })),
    );
    s.appendChild(this.caption('OpenFreeMap vector base map.'));
    return s;
  }

  private hillshadeSection(): HTMLElement {
    const s = this.toggleSection('Hillshade', this.state.hillshade, (v) => this.update({ hillshade: v }));

    const { row, select } = this.selectRow(HILLSHADE_METHODS, this.state.hillshadeMethod, () => {});
    select.addEventListener('change', () => {
      const method = select.value as HillshadeMethod;
      const exaggeration = HILLSHADE_PRESETS[method].exaggeration;
      this.hillshadeExEl.value = String(exaggeration);
      this.hillshadeExEl.dispatchEvent(new Event('input'));
      this.update({ hillshadeMethod: method, hillshadeExaggeration: exaggeration });
    });
    s.appendChild(row);

    const { field, input } = this.sliderField(
      'Exaggeration',
      this.state.hillshadeExaggeration,
      0,
      1,
      0.05,
      (v) => this.update({ hillshadeExaggeration: v }),
    );
    this.hillshadeExEl = input;
    s.appendChild(field);
    return s;
  }

  private terrainSection(): HTMLElement {
    const s = this.toggleSection('3D terrain', this.state.terrain, (v) => this.update({ terrain: v }));
    const { field } = this.sliderField(
      'Exaggeration',
      this.state.terrainExaggeration,
      0,
      2,
      0.1,
      (v) => this.update({ terrainExaggeration: v }),
    );
    s.appendChild(field);
    return s;
  }

  private contourSection(): HTMLElement {
    const s = this.toggleSection('Contours', this.state.contours, (v) => this.update({ contours: v }));
    s.appendChild(this.caption('Zoom in to reveal contour lines and elevation labels.'));
    return s;
  }

  private populationSection(): HTMLElement {
    const s = this.toggleSection('Population · WorldPop', this.state.population, (v) =>
      this.update({ population: v }),
    );
    const { field } = this.sliderField(
      'Opacity',
      this.state.populationOpacity,
      0,
      1,
      0.05,
      (v) => this.update({ populationOpacity: v }),
    );
    s.appendChild(field);

    // Colour legend. The ramp breaks are log-ish, so place the stops evenly
    // across the bar (mapping raw values to % collapses the low end to nothing).
    const last = POPULATION_LEGEND.length - 1;
    const stops = POPULATION_LEGEND.map(
      (l, i) => `${l.color} ${Math.round((i / last) * 100)}%`,
    ).join(', ');
    const legend = document.createElement('div');
    legend.className = 'mh-legend';
    legend.innerHTML =
      `<span class="mh-legend-bar" style="background:linear-gradient(90deg, ${stops})"></span>` +
      '<span class="mh-legend-labels"><span>0</span><span>80,000+ /km²</span></span>';
    s.appendChild(legend);
    s.appendChild(this.caption('WorldPop 2020, global 1 km grid. Click the map to read the value.'));
    return s;
  }

  private earthquakeSection(): HTMLElement {
    const s = this.toggleSection('Earthquakes · USGS', this.state.earthquakes, (v) =>
      this.update({ earthquakes: v }),
    );

    // Feed selector (friendly labels).
    const row = document.createElement('div');
    row.className = 'mh-select';
    const select = document.createElement('select');
    QUAKE_FEED_OPTIONS.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      o.selected = this.state.quakeFeed === opt.value;
      select.appendChild(o);
    });
    select.addEventListener('change', () => this.update({ quakeFeed: select.value as QuakeFeed }));
    row.appendChild(select);
    s.appendChild(row);

    // Depth colour legend (shallow → deep).
    const legend = document.createElement('div');
    legend.className = 'mh-legend';
    legend.innerHTML =
      '<span class="mh-legend-bar"></span><span class="mh-legend-labels"><span>0 km</span><span>700 km</span></span>';
    s.appendChild(legend);
    s.appendChild(this.caption('Circle size = magnitude · colour = depth. Click a quake for details.'));

    // ShakeMap MMI contours for the focused event.
    s.appendChild(
      this.switchRow('ShakeMap MMI contours', this.state.shakemap, (v) => this.update({ shakemap: v })),
    );

    // Locate a specific event by id / event-page URL and fly to it.
    const find = document.createElement('div');
    find.className = 'mh-find';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mh-input';
    input.placeholder = 'USGS event id or URL';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'mh-btn';
    go.textContent = 'Show';
    const submit = () => this.onLoadEvent(input.value);
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'mh-btn mh-btn-ghost';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      input.value = '';
      this.onLoadEvent('');
    });
    find.append(input, go, clear);
    s.appendChild(find);
    return s;
  }
}
