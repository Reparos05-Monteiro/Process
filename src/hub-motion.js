// The route is calculated in screen pixels, so the wake stops at the edge of
// the actual stage icon on both narrow and wide layouts.
export function wakeRoute(source, target, center) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 16) return null;
  // Closely spaced editable stages still get a short route instead of
  // stopping the sequence when many stages are configured.
  const first = Math.min(source.radius + 8, distance * .4);
  const last = Math.min(target.radius + 8, distance * .4);

  const ux = dx / distance;
  const uy = dy / distance;
  const start = { x: source.x + ux * first, y: source.y + uy * first };
  const end = { x: target.x - ux * last, y: target.y - uy * last };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  let outwardX = midpoint.x - center.x;
  let outwardY = midpoint.y - center.y;
  const outwardLength = Math.hypot(outwardX, outwardY);
  // Opposite stages have a midpoint at the center; route around it.
  if (outwardLength < 1) { outwardX = -uy; outwardY = ux; }
  else { outwardX /= outwardLength; outwardY /= outwardLength; }
  const bend = Math.max(Math.min(62, Math.max(18, distance * .14)),
    2 * ((center.radius || 0) + 22 - outwardLength));
  const control = { x: midpoint.x + outwardX * bend, y: midpoint.y + outwardY * bend };
  const pair = point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  return { start, end, control, d: `M${pair(start)} Q${pair(control)} ${pair(end)}` };
}

export function mountHubMotion(orbit) {
  if (!orbit) return () => {};
  const svg = orbit.querySelector('svg.hub-waves');
  const stages = [...orbit.querySelectorAll('[data-hub-stage]')];
  const paths = [...orbit.querySelectorAll('[data-flow-path]')];
  const wakes = [...orbit.querySelectorAll('[data-flow-wake]')];
  const motions = [...orbit.querySelectorAll('[data-flow-motion]')];
  if (!svg || stages.length < 2 || [paths, wakes, motions].some(items => items.length !== stages.length)) return () => {};

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeIndex = -1;
  let currentMotion = null;
  let onMotionEnd = null;
  let sequence = 0;
  let disposed = false;
  let width = 0;
  let height = 0;

  function setActive(index) {
    if (activeIndex >= 0 && activeIndex !== index) stages[activeIndex].classList.remove('auto-hover', 'flow-arrived');
    activeIndex = index;
    if (index >= 0) stages[index].classList.add('auto-hover');
  }

  function halt() {
    sequence++;
    if (currentMotion) {
      currentMotion.removeEventListener('endEvent', onMotionEnd);
      currentMotion.endElement?.();
      currentMotion = null;
      onMotionEnd = null;
    }
    wakes.forEach(wake => wake.classList.remove('running'));
    stages.forEach(stage => stage.classList.remove('flow-arrived'));
  }

  function layout() {
    const rect = svg.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return false;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const points = stages.map(stage => {
      const icon = stage.querySelector('.hub-stage-icon');
      const bounds = (icon || stage).getBoundingClientRect();
      return {
        x: bounds.left + bounds.width / 2 - rect.left,
        y: bounds.top + bounds.height / 2 - rect.top,
        radius: Math.max(bounds.width, bounds.height) / 2,
      };
    });
    const core = orbit.querySelector('.hub-center')?.getBoundingClientRect();
    const center = {
      x: core?.left === undefined ? width / 2 : core.left + core.width / 2 - rect.left,
      y: core?.top === undefined ? height / 2 : core.top + core.height / 2 - rect.top,
      radius: (core?.width || 0) / 2,
    };
    paths.forEach((path, index) => {
      const route = wakeRoute(points[index], points[(index + 1) % points.length], center);
      path.setAttribute('d', route?.d || 'M0 0');
    });
    return true;
  }

  function launch(index) {
    if (disposed || reducedMotion.matches || document.visibilityState === 'hidden' || !orbit.isConnected) return;
    const motion = motions[index];
    // All current desktop and mobile browsers with SMIL fire endEvent at the
    // actual end of animateMotion. Without that API, leave the map static.
    if (typeof motion.beginElement !== 'function' || paths[index].getAttribute('d') === 'M0 0') return;
    setActive(index);
    const token = ++sequence;
    const wake = wakes[index];
    const targetIndex = (index + 1) % stages.length;
    wake.classList.add('running');
    onMotionEnd = () => {
      if (disposed || token !== sequence || !orbit.isConnected) return;
      motion.removeEventListener('endEvent', onMotionEnd);
      currentMotion = null;
      onMotionEnd = null;
      wake.classList.remove('running');
      setActive(targetIndex); // Same event as the native wave's arrival.
      stages[targetIndex].classList.add('flow-arrived');
      launch(targetIndex); // Start the next segment in this same event, without a dwell.
    };
    currentMotion = motion;
    motion.addEventListener('endEvent', onMotionEnd);
    motion.beginElement();
  }

  function onPreferenceChange() {
    halt();
    setActive(-1);
    if (!reducedMotion.matches && layout()) launch(0);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') halt();
    else if (!reducedMotion.matches && layout()) launch(Math.max(0, activeIndex));
  }

  if (layout() && !reducedMotion.matches && document.visibilityState !== 'hidden') launch(0);
  reducedMotion.addEventListener?.('change', onPreferenceChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    const rect = svg.getBoundingClientRect();
    if (Math.abs(rect.width - width) < 1 && Math.abs(rect.height - height) < 1) return;
    halt();
    if (layout() && !reducedMotion.matches) launch(Math.max(0, activeIndex));
  });
  observer?.observe(orbit);

  return () => {
    disposed = true;
    observer?.disconnect();
    reducedMotion.removeEventListener?.('change', onPreferenceChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    halt();
    setActive(-1);
  };
}
